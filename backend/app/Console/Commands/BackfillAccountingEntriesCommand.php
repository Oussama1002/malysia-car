<?php

namespace App\Console\Commands;

use App\Models\AccountingEntry;
use App\Models\DepreciationLine;
use App\Models\FixedAsset;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\AccountingBridgeService;
use Illuminate\Console\Command;
use Throwable;

class BackfillAccountingEntriesCommand extends Command
{
    protected $signature = 'accounting:backfill
                            {--dry-run : Count what would be generated, without writing}
                            {--only= : invoice|payment|depreciation|disposal — restrict to one source}';

    protected $description = 'Generate missing journal entries for existing invoices, payments, depreciation lines and disposed assets';

    public function handle(AccountingBridgeService $bridge): int
    {
        $dry = (bool) $this->option('dry-run');
        $only = $this->option('only');

        $kinds = ['invoice', 'payment', 'depreciation', 'disposal'];
        if ($only && ! in_array($only, $kinds, true)) {
            $this->error("--only must be one of: " . implode(', ', $kinds));
            return self::FAILURE;
        }

        $run = function (string $kind, callable $fn) use ($only) {
            if ($only && $only !== $kind) return;
            $fn();
        };

        $run('invoice', fn () => $this->backfillInvoices($bridge, $dry));
        $run('payment', fn () => $this->backfillPayments($bridge, $dry));
        $run('depreciation', fn () => $this->backfillDepreciation($bridge, $dry));
        $run('disposal', fn () => $this->backfillDisposals($bridge, $dry));

        return self::SUCCESS;
    }

    private function backfillInvoices(AccountingBridgeService $bridge, bool $dry): void
    {
        $existing = AccountingEntry::where('source_type', 'invoice')->pluck('source_id')->all();
        $invoices = Invoice::whereIn('status', ['issued', 'partial', 'paid', 'overdue'])
            ->whereNotIn('id', $existing)
            ->get();

        $this->info("[invoice] {$invoices->count()} à traiter");
        if ($dry) return;

        $ok = 0; $ko = 0;
        foreach ($invoices as $inv) {
            try {
                $bridge->fromInvoice($inv);
                $ok++;
            } catch (Throwable $e) {
                $ko++;
                $this->line("  skip {$inv->invoice_number}: {$e->getMessage()}");
            }
        }
        $this->info("  ✓ {$ok} / skip {$ko}");
    }

    private function backfillPayments(AccountingBridgeService $bridge, bool $dry): void
    {
        $existing = AccountingEntry::where('source_type', 'payment')->pluck('source_id')->all();
        $payments = Payment::where('status', 'completed')
            ->whereNotIn('id', $existing)
            ->get();

        $this->info("[payment] {$payments->count()} à traiter");
        if ($dry) return;

        $ok = 0; $ko = 0;
        foreach ($payments as $p) {
            try {
                $bridge->fromPayment($p);
                $ok++;
            } catch (Throwable $e) {
                $ko++;
                $this->line("  skip {$p->payment_number}: {$e->getMessage()}");
            }
        }
        $this->info("  ✓ {$ok} / skip {$ko}");
    }

    private function backfillDepreciation(AccountingBridgeService $bridge, bool $dry): void
    {
        $lines = DepreciationLine::where('is_posted', false)->get();
        $this->info("[depreciation] {$lines->count()} à traiter");
        if ($dry) return;

        $ok = 0; $ko = 0;
        foreach ($lines as $l) {
            try {
                $bridge->fromDepreciation($l);
                $ok++;
            } catch (Throwable $e) {
                $ko++;
                $this->line("  skip line {$l->id}: {$e->getMessage()}");
            }
        }
        $this->info("  ✓ {$ok} / skip {$ko}");
    }

    private function backfillDisposals(AccountingBridgeService $bridge, bool $dry): void
    {
        $assets = FixedAsset::where('status', 'disposed')->whereNull('disposal_entry_id')->get();
        $this->info("[disposal] {$assets->count()} à traiter");
        if ($dry) return;

        $ok = 0; $ko = 0;
        foreach ($assets as $a) {
            try {
                $bridge->fromAssetDisposal($a);
                $ok++;
            } catch (Throwable $e) {
                $ko++;
                $this->line("  skip {$a->asset_number}: {$e->getMessage()}");
            }
        }
        $this->info("  ✓ {$ok} / skip {$ko}");
    }
}
