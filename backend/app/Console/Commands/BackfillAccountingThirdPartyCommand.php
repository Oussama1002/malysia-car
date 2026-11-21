<?php

namespace App\Console\Commands;

use App\Models\AccountingSetting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class BackfillAccountingThirdPartyCommand extends Command
{
    protected $signature = 'accounting:backfill-third-party
                            {--dry-run : Count lines that would be updated, without writing}';

    protected $description = 'Populate third_party_type/third_party_id on existing 3421 (client) entry lines by joining back to source invoices and payments';

    public function handle(): int
    {
        $dry = (bool) $this->option('dry-run');

        $clientCode = AccountingSetting::query()->where('key', 'account_client')->value('value') ?? '3421';

        $invoiceLines = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('invoices as i', function ($j) {
                $j->on('e.source_id', '=', 'i.id')->where('e.source_type', '=', 'invoice');
            })
            ->where('l.account_code', $clientCode)
            ->whereNull('l.third_party_id')
            ->select('l.id as line_id', 'i.customer_id');

        $paymentLines = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('payments as p', function ($j) {
                $j->on('e.source_id', '=', 'p.id')->where('e.source_type', '=', 'payment');
            })
            ->where('l.account_code', $clientCode)
            ->whereNull('l.third_party_id')
            ->select('l.id as line_id', 'p.customer_id');

        $invCount = (clone $invoiceLines)->count();
        $payCount = (clone $paymentLines)->count();

        $this->info("[invoice→line] {$invCount} à peupler");
        $this->info("[payment→line] {$payCount} à peupler");

        if ($dry) return self::SUCCESS;

        $this->update($invoiceLines, 'invoice');
        $this->update($paymentLines, 'payment');

        return self::SUCCESS;
    }

    private function update($query, string $kind): void
    {
        $ok = 0;
        $query->orderBy('line_id')->chunk(500, function ($rows) use (&$ok) {
            foreach ($rows as $r) {
                if (! $r->customer_id) continue;
                DB::table('accounting_entry_lines')
                    ->where('id', $r->line_id)
                    ->update([
                        'third_party_type' => 'customer',
                        'third_party_id' => $r->customer_id,
                        'updated_at' => now(),
                    ]);
                $ok++;
            }
        });
        $this->info("  [{$kind}] ✓ {$ok} lignes mises à jour");
    }
}
