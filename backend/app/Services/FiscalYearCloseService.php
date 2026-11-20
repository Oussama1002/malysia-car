<?php

namespace App\Services;

use App\Models\AccountingEntry;
use App\Models\AccountingEntryLine;
use App\Models\AccountingJournal;
use App\Models\FiscalYear;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Standard Moroccan PCG closing:
 * - Solder tous les comptes 6xxx (charges) et 7xxx (produits) sur la période
 *   de l'exercice via une seule écriture dans le journal OD.
 * - La contrepartie globale va au compte 1191 "Résultat net de l'exercice".
 * - Aucune écriture d'ouverture n'est générée ici — elle sera faite par
 *   l'écriture d'affectation (1191 → 1161/1169) ou à l'ouverture suivante.
 */
class FiscalYearCloseService
{
    public const RESULT_ACCOUNT_CODE = '1191';
    public const RETAINED_PROFIT_CODE = '1161';
    public const RETAINED_LOSS_CODE = '1169';

    public function close(FiscalYear $year, ?string $userId = null): AccountingEntry
    {
        if ($year->status !== 'open') {
            throw new RuntimeException('Fiscal year is not open.');
        }

        $startDate = $year->start_date instanceof \DateTimeInterface ? $year->start_date->format('Y-m-d') : (string) $year->start_date;
        $endDate = $year->end_date instanceof \DateTimeInterface ? $year->end_date->format('Y-m-d') : (string) $year->end_date;

        $lines = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('accounting_accounts as a', 'l.account_code', '=', 'a.code')
            ->where('e.status', 'posted')
            ->where('e.company_id', $year->company_id)
            ->whereDate('e.entry_date', '>=', $startDate)
            ->whereDate('e.entry_date', '<=', $endDate)
            ->whereIn('a.account_type', ['income', 'expense'])
            ->select(
                'a.code', 'a.account_type', 'a.normal_balance',
                DB::raw('SUM(l.debit) as total_debit'),
                DB::raw('SUM(l.credit) as total_credit'),
            )
            ->groupBy('a.code', 'a.account_type', 'a.normal_balance')
            ->get();

        if ($lines->isEmpty()) {
            throw new RuntimeException('No posted income or expense entries in this fiscal year — nothing to close.');
        }

        /** @var AccountingEntry|null $entry */
        $entry = null;

        DB::transaction(function () use (&$entry, $lines, $year, $endDate, $userId) {
            $journal = AccountingJournal::where('journal_type', 'general')->where('is_active', true)->firstOrFail();
            $period = $year->periods()->orderByDesc('period_number')->first();

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $year->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $period?->id,
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $endDate,
                'description' => "Clôture exercice {$year->code} — soldes 6xxx/7xxx → 1191",
                'reference' => "CLOTURE-{$year->code}",
                'status' => 'draft',
                'source_type' => 'fiscal_year_close',
                'source_id' => $year->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => $userId,
            ]);

            $order = 1;
            $rows = [];
            $resultDebit = 0.0;
            $resultCredit = 0.0;

            foreach ($lines as $r) {
                $totalDebit = (float) $r->total_debit;
                $totalCredit = (float) $r->total_credit;
                if ($r->account_type === 'income') {
                    // Income accounts carry a credit balance → debit them to zero.
                    $delta = $totalCredit - $totalDebit;
                    if (abs($delta) < 0.01) continue;
                    $rows[] = $this->line($entry->id, $order++, $r->code, "Solde produit {$r->code}", $delta, 0);
                    $resultCredit += $delta;
                } else {
                    // Expense accounts carry a debit balance → credit them to zero.
                    $delta = $totalDebit - $totalCredit;
                    if (abs($delta) < 0.01) continue;
                    $rows[] = $this->line($entry->id, $order++, $r->code, "Solde charge {$r->code}", 0, $delta);
                    $resultDebit += $delta;
                }
            }

            $net = round($resultCredit - $resultDebit, 2);
            if ($net > 0) {
                // Bénéfice → 1191 crédité
                $rows[] = $this->line($entry->id, $order++, self::RESULT_ACCOUNT_CODE, "Résultat net exercice {$year->code}", 0, $net);
            } elseif ($net < 0) {
                // Perte → 1191 débité
                $rows[] = $this->line($entry->id, $order++, self::RESULT_ACCOUNT_CODE, "Résultat net exercice {$year->code}", -$net, 0);
            }

            AccountingEntryLine::insert($rows);
            $entry->recalculateTotals();
            $entry->status = 'posted';
            $entry->posted_at = now();
            $entry->posted_by_user_id = $userId;
            $entry->save();

            $year->periods()->where('status', 'open')->update(['status' => 'closed']);
            $year->status = 'closed';
            $year->closed_at = now();
            $year->closed_by_user_id = $userId;
            $year->save();
        });

        return $entry->fresh('lines');
    }

    /**
     * Affecte le résultat net de l'exercice clôturé :
     *   - bénéfice → 1191 D / 1161 C
     *   - perte    → 1169 D / 1191 C
     */
    public function allocateResult(FiscalYear $year, ?string $userId = null): AccountingEntry
    {
        if ($year->status !== 'closed') {
            throw new RuntimeException('Fiscal year must be closed before allocating its result.');
        }
        if (AccountingEntry::where('source_type', 'fiscal_year_allocation')->where('source_id', $year->id)->exists()) {
            throw new RuntimeException('Result already allocated for this fiscal year.');
        }

        $endDate = $year->end_date instanceof \DateTimeInterface ? $year->end_date->format('Y-m-d') : (string) $year->end_date;

        $balance = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->where('e.status', 'posted')
            ->where('e.company_id', $year->company_id)
            ->whereDate('e.entry_date', '<=', $endDate)
            ->where('l.account_code', self::RESULT_ACCOUNT_CODE)
            ->selectRaw('COALESCE(SUM(l.credit),0) - COALESCE(SUM(l.debit),0) as net')
            ->value('net');

        $net = round((float) $balance, 2);
        if (abs($net) < 0.01) {
            throw new RuntimeException('Résultat net nul — rien à affecter.');
        }

        $entry = null;
        DB::transaction(function () use (&$entry, $year, $endDate, $userId, $net) {
            $journal = AccountingJournal::where('journal_type', 'general')->where('is_active', true)->firstOrFail();

            $entry = AccountingEntry::create([
                'id' => (string) Str::uuid(),
                'company_id' => $year->company_id,
                'journal_id' => $journal->id,
                'fiscal_period_id' => $year->periods()->orderByDesc('period_number')->value('id'),
                'entry_number' => $this->nextNumber($journal),
                'entry_date' => $endDate,
                'description' => "Affectation résultat exercice {$year->code}",
                'reference' => "AFFECT-{$year->code}",
                'status' => 'draft',
                'source_type' => 'fiscal_year_allocation',
                'source_id' => $year->id,
                'currency_code' => 'MAD',
                'created_by_user_id' => $userId,
            ]);

            if ($net > 0) {
                // Bénéfice : on solde 1191 (D) vers 1161 (C).
                $rows = [
                    $this->line($entry->id, 1, self::RESULT_ACCOUNT_CODE, "Solde résultat {$year->code}", $net, 0),
                    $this->line($entry->id, 2, self::RETAINED_PROFIT_CODE, "Report à nouveau bénéficiaire", 0, $net),
                ];
            } else {
                $loss = -$net;
                // Perte : 1169 (D) / 1191 (C).
                $rows = [
                    $this->line($entry->id, 1, self::RETAINED_LOSS_CODE, "Report à nouveau déficitaire", $loss, 0),
                    $this->line($entry->id, 2, self::RESULT_ACCOUNT_CODE, "Solde résultat {$year->code}", 0, $loss),
                ];
            }

            AccountingEntryLine::insert($rows);
            $entry->recalculateTotals();
            $entry->status = 'posted';
            $entry->posted_at = now();
            $entry->posted_by_user_id = $userId;
            $entry->save();
        });

        return $entry->fresh('lines');
    }

    /**
     * Preview sans écrire — pour alimenter une modale de confirmation.
     * @return array{entry_date:string,lines:array<int,array{code:string,label:string,debit:float,credit:float}>,net:float}
     */
    public function previewClose(FiscalYear $year): array
    {
        $startDate = $year->start_date instanceof \DateTimeInterface ? $year->start_date->format('Y-m-d') : (string) $year->start_date;
        $endDate = $year->end_date instanceof \DateTimeInterface ? $year->end_date->format('Y-m-d') : (string) $year->end_date;

        $rows = DB::table('accounting_entry_lines as l')
            ->join('accounting_entries as e', 'l.entry_id', '=', 'e.id')
            ->join('accounting_accounts as a', 'l.account_code', '=', 'a.code')
            ->where('e.status', 'posted')
            ->where('e.company_id', $year->company_id)
            ->whereDate('e.entry_date', '>=', $startDate)
            ->whereDate('e.entry_date', '<=', $endDate)
            ->whereIn('a.account_type', ['income', 'expense'])
            ->select('a.code', 'a.name', 'a.account_type',
                DB::raw('SUM(l.debit) as td'), DB::raw('SUM(l.credit) as tc'))
            ->groupBy('a.code', 'a.name', 'a.account_type')
            ->get();

        $lines = [];
        $resultCredit = 0.0;
        $resultDebit = 0.0;
        foreach ($rows as $r) {
            if ($r->account_type === 'income') {
                $delta = (float) $r->tc - (float) $r->td;
                if (abs($delta) < 0.01) continue;
                $lines[] = ['code' => $r->code, 'label' => "Solde produit {$r->name}", 'debit' => $delta, 'credit' => 0];
                $resultCredit += $delta;
            } else {
                $delta = (float) $r->td - (float) $r->tc;
                if (abs($delta) < 0.01) continue;
                $lines[] = ['code' => $r->code, 'label' => "Solde charge {$r->name}", 'debit' => 0, 'credit' => $delta];
                $resultDebit += $delta;
            }
        }
        $net = round($resultCredit - $resultDebit, 2);
        if (abs($net) >= 0.01) {
            $lines[] = $net > 0
                ? ['code' => self::RESULT_ACCOUNT_CODE, 'label' => "Résultat net {$year->code}", 'debit' => 0, 'credit' => $net]
                : ['code' => self::RESULT_ACCOUNT_CODE, 'label' => "Résultat net {$year->code}", 'debit' => -$net, 'credit' => 0];
        }

        return ['entry_date' => $endDate, 'lines' => $lines, 'net' => $net];
    }

    private function nextNumber(AccountingJournal $journal): string
    {
        $prefix = $journal->sequence_prefix ?? 'OD';
        $year = now()->format('Y');
        $seq = $journal->sequence_next;
        $journal->increment('sequence_next');

        return $prefix . $year . '-' . str_pad((string) $seq, 5, '0', STR_PAD_LEFT);
    }

    private function line(string $entryId, int $order, string $code, string $label, float $debit, float $credit): array
    {
        return [
            'id' => (string) Str::uuid(),
            'entry_id' => $entryId,
            'account_code' => $code,
            'account_id' => null,
            'line_order' => $order,
            'label' => $label,
            'debit' => round($debit, 2),
            'credit' => round($credit, 2),
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ];
    }
}
