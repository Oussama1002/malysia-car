<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A physical cheque is cashed once. It can be entered as a client payment, as
 * a supplier payment on a sous-location, or as a franchise — so the check has
 * to span the three, not just the table being written to.
 */
class ChequeRegistry
{
    /**
     * The record already holding this cheque, or null.
     *
     * Banks are compared only when both sides carry one: the same number typed
     * once with its bank and once without is the same cheque, and refusing to
     * see that is how the same cheque got paid twice.
     *
     * @return array{label: string, reference: string}|null
     */
    public static function findDuplicate(string $number, ?string $bank = null, ?string $ignoreTable = null, ?string $ignoreId = null): ?array
    {
        $number = trim($number);
        if ($number === '') {
            return null;
        }
        $bank = $bank !== null && trim($bank) !== '' ? strtolower(trim($bank)) : null;

        $sources = [
            ['table' => 'payments', 'ref' => 'payment_number', 'bank' => 'check_bank', 'label' => 'paiement client', 'method' => ['payment_method', ['check', 'cheque']]],
            ['table' => 'sub_rental_payments', 'ref' => 'reference', 'bank' => 'check_bank', 'label' => 'paiement fournisseur', 'method' => ['payment_method', ['check', 'cheque']]],
            ['table' => 'contract_deposits', 'ref' => 'id', 'bank' => 'check_bank', 'label' => "franchise d'assurance", 'method' => ['method', ['cheque', 'check']]],
        ];

        foreach ($sources as $source) {
            if (! Schema::hasTable($source['table']) || ! Schema::hasColumn($source['table'], 'check_number')) {
                continue;
            }

            $q = DB::table($source['table'])
                ->whereRaw('TRIM(check_number) = ?', [$number])
                ->when(
                    Schema::hasColumn($source['table'], $source['method'][0]),
                    fn ($q) => $q->whereIn($source['method'][0], $source['method'][1]),
                );

            // Live rows only: a bounced cheque is soft-deleted and its number
            // is free again for a new physical cheque.
            if (Schema::hasColumn($source['table'], 'deleted_at')) {
                $q->whereNull('deleted_at');
            }
            if (Schema::hasColumn($source['table'], 'status')) {
                $q->whereNotIn('status', ['reversed', 'refunded', 'cancelled']);
            }
            if ($bank !== null && Schema::hasColumn($source['table'], $source['bank'])) {
                $q->where(function ($q) use ($source, $bank) {
                    $q->whereNull($source['bank'])
                        ->orWhereRaw('TRIM('.$source['bank'].') = ?', [''])
                        ->orWhereRaw('LOWER(TRIM('.$source['bank'].')) = ?', [$bank]);
                });
            }
            if ($ignoreTable === $source['table'] && $ignoreId) {
                $q->where('id', '!=', $ignoreId);
            }

            $row = $q->first();
            if ($row) {
                return [
                    'label' => $source['label'],
                    'reference' => (string) ($row->{$source['ref']} ?? $row->id ?? ''),
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

        return 'Ce chèque n° '.trim($number).' est déjà enregistré sur un '.$dup['label'].$ref.'. Un même chèque ne peut pas être encaissé deux fois.';
    }
}
