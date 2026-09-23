<?php

namespace App\Services;

use App\Models\Contract;
use App\Models\Invoice;
use App\Models\InvoiceLine;
use App\Models\RentalDamageReport;
use App\Models\RentalExtension;
use App\Models\Reservation;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Resolve-or-create the "issued" invoice for a reservation (total = base +
 * applied extensions + damages). Idempotent: returns the existing invoice
 * (bumping it out of draft and aligning the due date), or creates one.
 *
 * Shared by the reservation ensure-invoice endpoint and the payment flow, so a
 * payment always has a facture to allocate to — no frontend timing race.
 */
class ReservationInvoiceService
{
    public function ensure(Reservation $reservation, ?string $userId = null): Invoice
    {
        $dueDate = $reservation->desired_end_at
            ? $reservation->desired_end_at->toDateString()
            : now()->addDays(7)->toDateString();

        $existing = Invoice::query()
            ->where('customer_id', $reservation->customer_id)
            ->whereHas('lines', fn ($lq) => $lq->whereRaw("JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.reservation_id')) = ?", [$reservation->id]))
            ->orderByDesc('issue_date')
            ->first();

        $contract = $this->resolveContract($reservation);
        [$base, $extensions, $damages, $total] = $this->amounts($reservation, $contract);

        if ($existing) {
            $changed = false;
            if ($existing->status === 'draft') {
                $existing->status = 'issued';
                $changed = true;
            }
            if ((string) $existing->due_date !== (string) $dueDate) {
                $existing->due_date = $dueDate;
                $changed = true;
            }
            if ($contract && ! $existing->contract_id) {
                $existing->contract_id = $contract->id;
                $existing->invoice_type = 'contract';
                $changed = true;
            }
            // Repair an invoice billed at 0 — it was created before the
            // reservation carried a price. Never touch one already (part) paid.
            if ((float) $existing->total_amount <= 0 && $total > 0 && (float) $existing->amount_paid <= 0) {
                $line = $existing->lines()->orderBy('position')->first();
                if ($line) {
                    $line->unit_price = $total;
                    $line->line_total = $total;
                    $line->metadata = array_merge((array) $line->metadata, [
                        'base_amount' => $base,
                        'extensions' => $extensions,
                        'damages' => $damages,
                    ]);
                    $line->save();
                } else {
                    $this->createLine($existing, $reservation, $base, $extensions, $damages, $total);
                }
                $existing->refresh();
                $existing->recalculateTotals();
                $changed = true;
            }
            if ($changed) {
                $existing->save();
            }

            return $existing;
        }

        return DB::transaction(function () use ($reservation, $userId, $dueDate, $contract, $base, $extensions, $damages, $total) {
            $invoice = Invoice::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'invoice_number' => $this->generateNumber(),
                'invoice_type' => $contract ? 'contract' : 'service',
                'customer_id' => $reservation->customer_id,
                'contract_id' => $contract?->id,
                'issue_date' => now()->toDateString(),
                'due_date' => $dueDate,
                'currency_code' => 'MAD',
                'status' => 'issued',
                'created_by' => $userId,
            ]);

            $this->createLine($invoice, $reservation, $base, $extensions, $damages, $total);
            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();

            return $invoice;
        });
    }

    /** The contract this reservation was created from, if it is still live. */
    private function resolveContract(Reservation $reservation): ?Contract
    {
        return Contract::query()
            ->where('reservation_id', $reservation->id)
            ->whereNotIn('status', ['cancelled', 'rejected', 'expired'])
            ->orderByDesc('created_at')
            ->first();
    }

    /**
     * Base + applied extensions + damages. A reservation created from a
     * contract carries no estimated_price, so fall back to the contract.
     *
     * @return array{0: float, 1: float, 2: float, 3: float}
     */
    private function amounts(Reservation $reservation, ?Contract $contract): array
    {
        $base = (float) ($reservation->estimated_price ?? 0);
        if ($base <= 0 && $contract) {
            $base = (float) ($contract->base_amount ?? 0);
        }
        $extensions = (float) RentalExtension::query()
            ->where('reservation_id', $reservation->id)
            ->where('status', 'applied')
            ->sum('additional_amount');
        $damages = (float) RentalDamageReport::query()
            ->where('reservation_id', $reservation->id)
            ->sum(DB::raw('COALESCE(final_cost, estimated_cost)'));

        return [$base, $extensions, $damages, max(0, $base + $extensions + $damages)];
    }

    private function createLine(Invoice $invoice, Reservation $reservation, float $base, float $extensions, float $damages, float $total): void
    {
        InvoiceLine::query()->create([
            'id' => (string) Str::uuid(),
            'invoice_id' => $invoice->id,
            'position' => 1,
            'line_type' => 'service',
            'description' => 'Location '.$reservation->reservation_number,
            'quantity' => 1,
            'unit_price' => $total,
            'discount_amount' => 0,
            'tax_rate' => 0,
            'tax_amount' => 0,
            'line_total' => $total,
            'metadata' => [
                'reservation_id' => $reservation->id,
                'base_amount' => $base,
                'extensions' => $extensions,
                'damages' => $damages,
            ],
        ]);
    }

    private function generateNumber(): string
    {
        $prefix = 'FAC-';
        $last = Invoice::query()
            ->where('invoice_number', 'like', $prefix.'%')
            ->orderByRaw('CAST(SUBSTRING(invoice_number, 5) AS UNSIGNED) DESC')
            ->value('invoice_number');
        $seq = $last ? ((int) substr($last, 4)) + 1 : 1;

        return $prefix.str_pad((string) $seq, 4, '0', STR_PAD_LEFT);
    }
}
