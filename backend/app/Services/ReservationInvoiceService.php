<?php

namespace App\Services;

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
            if ($changed) {
                $existing->save();
            }

            return $existing;
        }

        return DB::transaction(function () use ($reservation, $userId, $dueDate) {
            $base = (float) ($reservation->estimated_price ?? 0);
            $extensions = (float) RentalExtension::query()
                ->where('reservation_id', $reservation->id)
                ->where('status', 'applied')
                ->sum('additional_amount');
            $damages = (float) RentalDamageReport::query()
                ->where('reservation_id', $reservation->id)
                ->sum(DB::raw('COALESCE(final_cost, estimated_cost)'));
            $total = max(0, $base + $extensions + $damages);

            $invoice = Invoice::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $reservation->company_id,
                'branch_id' => $reservation->branch_id,
                'invoice_number' => $this->generateNumber(),
                'invoice_type' => 'service',
                'customer_id' => $reservation->customer_id,
                'contract_id' => null,
                'issue_date' => now()->toDateString(),
                'due_date' => $dueDate,
                'currency_code' => 'MAD',
                'status' => 'issued',
                'created_by' => $userId,
            ]);

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
            $invoice->refresh();
            $invoice->recalculateTotals();
            $invoice->save();

            return $invoice;
        });
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
