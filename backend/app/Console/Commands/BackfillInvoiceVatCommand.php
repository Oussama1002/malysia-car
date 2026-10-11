<?php

namespace App\Console\Commands;

use App\Models\Invoice;
use App\Support\CompanyDefaults;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fill the VAT on invoices issued before the default rate was applied.
 *
 * The rate is taken as included in the amount already invoiced, exactly as new
 * invoices do it: the total and the customer balance do not move, only the
 * HT / TVA split appears.
 */
class BackfillInvoiceVatCommand extends Command
{
    protected $signature = 'invoices:backfill-vat
                            {--dry-run : Show what would change without writing}
                            {--rate= : Rate to apply instead of the company default}';

    protected $description = 'Compute the VAT included in existing invoices (totals unchanged)';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');
        $forced = $this->option('rate') !== null ? (float) $this->option('rate') : null;

        $invoices = Invoice::query()
            ->with('lines')
            ->where('tax_amount', '<=', 0)
            ->where('total_amount', '>', 0)
            ->get();

        if ($invoices->isEmpty()) {
            $this->info('Aucune facture sans TVA à reprendre.');

            return self::SUCCESS;
        }

        $touched = 0;
        $skipped = 0;

        foreach ($invoices as $invoice) {
            $rate = $forced ?? CompanyDefaults::vatRate($invoice->company_id);
            if ($rate <= 0) {
                $skipped++;
                continue;
            }

            $this->line(sprintf(
                '%s — %s : TVA %s%% → %s',
                $invoice->invoice_number,
                number_format((float) $invoice->total_amount, 2, ',', ' '),
                rtrim(rtrim(number_format($rate, 2, ',', ''), '0'), ','),
                number_format(round((float) $invoice->total_amount * $rate / (100 + $rate), 2), 2, ',', ' '),
            ));

            if ($dry) {
                $touched++;
                continue;
            }

            DB::transaction(function () use ($invoice, $rate) {
                foreach ($invoice->lines as $line) {
                    $lineTotal = (float) $line->line_total;
                    $line->tax_rate = $rate;
                    $line->tax_amount = round($lineTotal * $rate / (100 + $rate), 2);
                    $line->save();
                }
                $invoice->refresh();
                $invoice->recalculateTotals();
                $invoice->save();
            });

            $touched++;
        }

        $this->info(($dry ? '[dry-run] ' : '').$touched.' facture(s) traitée(s).'
            .($skipped > 0 ? ' '.$skipped.' ignorée(s) : aucune TVA par défaut sur leur société.' : ''));

        return self::SUCCESS;
    }
}
