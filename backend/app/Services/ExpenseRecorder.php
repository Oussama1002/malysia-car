<?php

namespace App\Services;

use App\Models\Expense;
use Illuminate\Support\Facades\Log;

/**
 * Tout ce qui sort de la caisse finit dans les Dépenses : paiement fournisseur
 * d'une sous-location, entretien, réparation. Chaque événement n'y écrit qu'une
 * ligne — on retrouve la dépense par sa source avant d'en créer une autre.
 */
class ExpenseRecorder
{
    /**
     * @param  array<string, mixed>  $attributes  label, amount, expense_date, category…
     */
    public function record(string $sourceType, string $sourceId, array $attributes): ?Expense
    {
        try {
            $existing = Expense::query()
                ->where('source_type', $sourceType)
                ->where('source_id', $sourceId)
                ->first();

            if ($existing) {
                $existing->fill($attributes)->save();

                return $existing;
            }

            return Expense::query()->create(array_merge([
                'currency_code' => 'MAD',
                'expense_type' => 'operational',
                'status' => 'paid',
            ], $attributes, [
                'source_type' => $sourceType,
                'source_id' => $sourceId,
            ]));
        } catch (\Throwable $e) {
            // La dépense est un reflet comptable : son échec ne doit jamais
            // empêcher d'enregistrer le paiement ou l'entretien lui-même.
            Log::warning('expense_recorder.failed', [
                'source' => $sourceType.':'.$sourceId,
                'error' => $e->getMessage(),
            ]);

            return null;
        }
    }

    /** La dépense disparaît avec l'événement qui l'a produite. */
    public function forget(string $sourceType, string $sourceId): void
    {
        try {
            Expense::query()
                ->where('source_type', $sourceType)
                ->where('source_id', $sourceId)
                ->delete();
        } catch (\Throwable $e) {
            Log::warning('expense_recorder.forget_failed', [
                'source' => $sourceType.':'.$sourceId,
                'error' => $e->getMessage(),
            ]);
        }
    }
}
