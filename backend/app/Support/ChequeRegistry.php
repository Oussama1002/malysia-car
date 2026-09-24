<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A physical cheque is cashed once. It can be entered as a client payment on
 * any reservation, as a supplier payment on a sous-location, or as a franchise
 * — so the check spans the three, and compares numbers the way a human reads
 * them: "0283359", "283 359" and "283359" are the same cheque.
 */
class ChequeRegistry
{
    /** @return array<int, array{table: string, label: string, ref: string, method: array{0: string, 1: array<int, string>}, bank: string}> */
    private static function sources(): array
    {
        return [
            ['table' => 'payments', 'ref' => 'payment_number', 'bank' => 'check_bank', 'label' => 'paiement client', 'method' => ['payment_method', ['check', 'cheque']]],
            ['table' => 'sub_rental_payments', 'ref' => 'reference', 'bank' => 'check_bank', 'label' => 'paiement fournisseur', 'method' => ['payment_method', ['check', 'cheque']]],
            ['table' => 'contract_deposits', 'ref' => 'id', 'bank' => 'check_bank', 'label' => "franchise d'assurance", 'method' => ['method', ['cheque', 'check']]],
            // Les chèques saisis dans l'assistant contrat sont stockés sur le
            // contrat lui-même, parfois plusieurs séparés par des virgules.
            ['table' => 'contracts', 'ref' => 'contract_number', 'bank' => 'check_bank', 'label' => 'contrat', 'method' => ['payment_method', ['cheque', 'check']], 'column' => 'cheque_number'],
        ];
    }

    /**
     * The normalised numbers held by one row — the contract wizard writes
     * several cheques into a single field, separated by commas.
     *
     * @return array<int, string>
     */
    private static function normalizedParts(?string $raw): array
    {
        $parts = preg_split('/[,;\/]+/', (string) $raw) ?: [];

        return array_values(array_filter(array_map([self::class, 'normalize'], $parts), fn ($p) => $p !== ''));
    }

    /**
     * Digits and letters only, without the leading zeros: what is actually
     * printed on the cheque, whatever the operator typed around it.
     */
    public static function normalize(?string $number): string
    {
        $clean = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $number) ?? '');
        $trimmed = ltrim($clean, '0');

        return $trimmed !== '' ? $trimmed : $clean;
    }

    /**
     * The record already holding this cheque, or null.
     *
     * Banks are compared only when both sides carry one: the same number typed
     * once with its bank and once without is the same cheque.
     *
     * @return array{label: string, reference: string, table: string, id: string}|null
     */
    public static function findDuplicate(string $number, ?string $bank = null, ?string $ignoreTable = null, ?string $ignoreId = null): ?array
    {
        $needle = self::normalize($number);
        if ($needle === '') {
            return null;
        }
        $bank = $bank !== null && trim($bank) !== '' ? strtolower(trim($bank)) : null;

        foreach (self::sources() as $source) {
            foreach (self::rows($source) as $row) {
                if (! in_array($needle, self::normalizedParts($row->check_number ?? null), true)) {
                    continue;
                }
                if ($ignoreTable === $source['table'] && $ignoreId && (string) $row->id === $ignoreId) {
                    continue;
                }
                $rowBank = isset($row->check_bank) && trim((string) $row->check_bank) !== ''
                    ? strtolower(trim((string) $row->check_bank))
                    : null;
                if ($bank !== null && $rowBank !== null && $bank !== $rowBank) {
                    continue; // même numéro, banque différente : autre chèque
                }

                return [
                    'label' => $source['label'],
                    'reference' => (string) ($row->{$source['ref']} ?? $row->id ?? ''),
                    'table' => $source['table'],
                    'id' => (string) $row->id,
                ];
            }
        }

        return null;
    }

    /** Ready-to-show refusal, or null when the cheque is free. */
    public static function duplicateMessage(string $number, ?string $bank = null, ?string $ignoreTable = null, ?string $ignoreId = null): ?string
    {
        $dup = self::findDuplicate($number, $bank, $ignoreTable, $ignoreId);
        if (! $dup) {
            return null;
        }

        $ref = $dup['reference'] !== '' ? ' ('.$dup['reference'].')' : '';

        return 'Ce chèque n° '.trim($number).' est déjà enregistré sur un '.$dup['label'].$ref
            .'. Un même chèque ne peut pas être encaissé deux fois.';
    }

    /**
     * Every live cheque on record, grouped by normalised number — used to list
     * the duplicates entered before the guard existed.
     *
     * @return array<string, array<int, array{label: string, reference: string, table: string, id: string, bank: ?string, amount: ?float, date: ?string}>>
     */
    public static function all(): array
    {
        $groups = [];

        foreach (self::sources() as $source) {
            foreach (self::rows($source) as $row) {
                foreach (self::normalizedParts($row->check_number ?? null) as $key) {
                    $groups[$key][] = [
                        'label' => $source['label'],
                        'reference' => (string) ($row->{$source['ref']} ?? $row->id ?? ''),
                        'table' => $source['table'],
                        'id' => (string) $row->id,
                        'bank' => $row->check_bank ?? null,
                        'amount' => isset($row->amount) ? (float) $row->amount : null,
                        'date' => $row->payment_date ?? $row->collected_at ?? null,
                    ];
                }
            }
        }

        return $groups;
    }

    /**
     * @param  array{table: string, ref: string, bank: string, label: string, method: array{0: string, 1: array<int, string>}}  $source
     * @return \Illuminate\Support\Collection<int, \stdClass>
     */
    private static function rows(array $source)
    {
        if (! Schema::hasTable($source['table'])) {
            return collect();
        }

        $numberColumn = $source['column'] ?? 'check_number';
        if (! Schema::hasColumn($source['table'], $numberColumn)) {
            return collect();
        }

        $columns = ['id', $numberColumn.' as check_number'];
        foreach ([$source['ref'], $source['bank'], 'amount', 'payment_date', 'collected_at'] as $extra) {
            if (Schema::hasColumn($source['table'], $extra) && ! in_array($extra, $columns, true)) {
                $columns[] = $extra;
            }
        }

        return DB::table($source['table'])
            ->whereNotNull($numberColumn)
            ->whereRaw('TRIM('.$numberColumn.") <> ''")
            ->when(
                Schema::hasColumn($source['table'], $source['method'][0]),
                fn ($q) => $q->whereIn($source['method'][0], $source['method'][1]),
            )
            // Live rows only: a bounced cheque is soft-deleted and its number is
            // free again for a new physical cheque.
            ->when(Schema::hasColumn($source['table'], 'deleted_at'), fn ($q) => $q->whereNull('deleted_at'))
            ->when(
                Schema::hasColumn($source['table'], 'status'),
                fn ($q) => $q->whereNotIn('status', ['reversed', 'refunded', 'cancelled', 'rejected', 'expired']),
            )
            ->get($columns);
    }
}
