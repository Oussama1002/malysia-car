<?php

namespace App\Console\Commands;

use App\Models\SubRentalPayment;
use App\Models\VehicleMaintenanceEvent;
use App\Models\VehicleRepair;
use App\Services\ExpenseRecorder;
use Illuminate\Console\Command;

/**
 * Les Dépenses n'enregistraient les paiements fournisseur, entretiens et
 * réparations qu'à partir du moment où le lien a été posé. Tout ce qui existait
 * avant restait invisible — cette commande le rattrape. Elle est idempotente :
 * ExpenseRecorder retrouve la dépense par sa source avant d'en créer une.
 */
class BackfillExpensesCommand extends Command
{
    protected $signature = 'driveflow:backfill-expenses';

    protected $description = 'Reprend les paiements fournisseur, entretiens et réparations déjà saisis dans les Dépenses';

    public function handle(ExpenseRecorder $recorder): int
    {
        $this->line('Paiements fournisseur…');
        $payments = 0;
        SubRentalPayment::query()->with('contract')->chunkById(200, function ($rows) use ($recorder, &$payments) {
            foreach ($rows as $payment) {
                $contract = $payment->contract;
                if (! $contract) {
                    continue;
                }
                $recorder->record('sub_rental_payment', (string) $payment->id, [
                    'company_id' => $contract->company_id,
                    'branch_id' => $contract->branch_id,
                    'label' => 'Paiement fournisseur — '.($contract->contract_number ?? 'sous-location'),
                    'amount' => $payment->amount,
                    'expense_date' => $payment->payment_date,
                    'category' => 'sous-location',
                    'status' => 'paid',
                    'paid_at' => $payment->payment_date,
                    'payment_method' => $payment->payment_method,
                    'reference' => $payment->reference ?? $payment->check_number,
                    'vehicle_id' => $contract->vehicle_id,
                    'created_by' => $payment->created_by,
                ]);
                $payments++;
            }
        });
        $this->info("  {$payments} paiement(s)");

        $this->line('Entretiens…');
        $events = 0;
        VehicleMaintenanceEvent::query()->with('vehicle')->chunkById(200, function ($rows) use ($recorder, &$events) {
            foreach ($rows as $ev) {
                if ($ev->cost_mad === null || (float) $ev->cost_mad <= 0 || ! $ev->vehicle) {
                    continue;
                }
                $recorder->record('maintenance_event', (string) $ev->id, [
                    'company_id' => $ev->vehicle->company_id,
                    'branch_id' => $ev->vehicle->branch_id,
                    'label' => 'Entretien — '.$ev->title,
                    'amount' => $ev->cost_mad,
                    'expense_date' => $ev->performed_at ?? $ev->created_at?->toDateString() ?? now()->toDateString(),
                    'category' => 'entretien',
                    'status' => $ev->performed_at ? 'paid' : 'unpaid',
                    'paid_at' => $ev->performed_at,
                    'vehicle_id' => $ev->vehicle_id,
                    'notes' => $ev->vendor ? 'Prestataire : '.$ev->vendor : null,
                    'created_by' => $ev->created_by,
                ]);
                $events++;
            }
        });
        $this->info("  {$events} entretien(s)");

        $this->line('Réparations…');
        $repairs = 0;
        VehicleRepair::query()->with('vehicle')->chunkById(200, function ($rows) use ($recorder, &$repairs) {
            foreach ($rows as $repair) {
                if ($repair->cost_amount === null || (float) $repair->cost_amount <= 0 || ! $repair->vehicle) {
                    continue;
                }
                $recorder->record('vehicle_repair', (string) $repair->id, [
                    'company_id' => $repair->vehicle->company_id,
                    'branch_id' => $repair->vehicle->branch_id,
                    'label' => 'Réparation — '.$repair->description,
                    'amount' => $repair->cost_amount,
                    'expense_date' => ($repair->completed_at ?? $repair->reported_at ?? now())->toDateString(),
                    'category' => 'réparations',
                    'status' => $repair->status === 'completed' ? 'paid' : 'unpaid',
                    'paid_at' => $repair->completed_at,
                    'vehicle_id' => $repair->vehicle_id,
                    'notes' => $repair->vendor_name ? 'Prestataire : '.$repair->vendor_name : null,
                    'created_by' => $repair->created_by,
                ]);
                $repairs++;
            }
        });
        $this->info("  {$repairs} réparation(s)");

        return self::SUCCESS;
    }
}
