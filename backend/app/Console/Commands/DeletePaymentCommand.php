<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Models\Payment;
use App\Services\AuditLogger;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Remove a payment entered by mistake: its allocations go, the invoices it
 * paid are recomputed, and the payment is soft-deleted so the cheque number
 * becomes free again. Shows the row and asks before touching anything.
 */
class DeletePaymentCommand extends Command
{
    protected $signature = 'payments:delete
                            {identifier : payment number, id, or cheque number}
                            {--reservation= : reservation number, to disambiguate}
                            {--dry-run : show what would be deleted and stop}';

    protected $description = 'Delete a payment (allocations released, invoices recomputed)';

    public function handle(): int
    {
        $identifier = (string) $this->argument('identifier');

        $matches = Payment::query()
            ->where(function ($q) use ($identifier) {
                $q->where('payment_number', $identifier)
                    ->orWhere('id', $identifier)
                    ->orWhereRaw('TRIM(check_number) = ?', [trim($identifier)]);
            })
            ->when($this->option('reservation'), function ($q, $reservation) {
                $q->whereIn('reservation_id', function ($sub) use ($reservation) {
                    $sub->select('id')->from('reservations')->where('reservation_number', $reservation);
                });
            })
            ->with('allocations')
            ->get();

        if ($matches->isEmpty()) {
            $this->error('Aucun paiement trouvé pour "'.$identifier.'".');

            return self::FAILURE;
        }

        if ($matches->count() > 1) {
            $this->warn($matches->count().' paiements correspondent — précisez avec --reservation= ou donnez l\'id :');
            $this->table(
                ['N°', 'Montant', 'Date', 'Mode', 'Chèque', 'Réservation', 'Id'],
                $matches->map(fn (Payment $p) => [
                    $p->payment_number,
                    number_format((float) $p->amount, 2, ',', ' '),
                    optional($p->payment_date)->format('d/m/Y'),
                    $p->payment_method,
                    $p->check_number,
                    $p->reservation_id,
                    $p->id,
                ])->all(),
            );

            return self::FAILURE;
        }

        /** @var Payment $payment */
        $payment = $matches->first();

        $this->table(
            ['Champ', 'Valeur'],
            [
                ['N° paiement', $payment->payment_number],
                ['Montant', number_format((float) $payment->amount, 2, ',', ' ').' '.$payment->currency_code],
                ['Date', optional($payment->payment_date)->format('d/m/Y')],
                ['Mode', $payment->payment_method],
                ['Chèque', $payment->check_number ?? '—'],
                ['Banque', $payment->check_bank ?? '—'],
                ['Réservation', $payment->reservation_id ?? '—'],
                ['Facture', $payment->invoice_id ?? '—'],
                ['Allocations', (string) $payment->allocations->count()],
                ['Id', $payment->id],
            ],
        );

        if ($this->option('dry-run')) {
            $this->info('[dry-run] Rien n\'a été supprimé.');

            return self::SUCCESS;
        }

        if (! $this->confirm('Supprimer ce paiement ?', false)) {
            $this->line('Annulé.');

            return self::SUCCESS;
        }

        $invoiceIds = $payment->allocations->pluck('invoice_id')->filter()->unique()->all();
        if ($payment->invoice_id) {
            $invoiceIds[] = $payment->invoice_id;
        }

        DB::transaction(function () use ($payment, $invoiceIds) {
            AuditLogger::deleted($payment, null, module: 'finance');
            $payment->allocations()->delete();
            $payment->delete();

            foreach (array_unique($invoiceIds) as $invoiceId) {
                $invoice = Invoice::find($invoiceId);
                $invoice?->refreshPaymentStatus();
            }
        });

        $this->info('Paiement '.$payment->payment_number.' supprimé. Le chèque '.($payment->check_number ?? '').' est de nouveau disponible.');

        return self::SUCCESS;
    }
}
