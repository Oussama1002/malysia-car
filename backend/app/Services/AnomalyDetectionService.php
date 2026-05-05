<?php

namespace App\Services;

use App\Models\AiPrediction;
use App\Models\ArrearsCase;
use App\Models\CreditApplication;
use App\Models\Invoice;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class AnomalyDetectionService
{
    public function generate(?User $actor = null, bool $persist = true): array
    {
        $anomalies = collect();

        $this->collectInvoiceAnomalies($anomalies);
        $this->collectCreditAnomalies($anomalies);
        $this->collectFleetAnomalies($anomalies);
        $this->collectArrearsAnomalies($anomalies);

        $sorted = $anomalies->sortByDesc('score')->values();

        if ($persist) {
            $this->persist($sorted, $actor);
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'total' => $sorted->count(),
            'critical_count' => $sorted->where('risk_level', 'critical')->count(),
            'items' => $sorted->take(60)->values()->all(),
            'model_mode' => 'rule_based',
        ];
    }

    private function collectInvoiceAnomalies(Collection $anomalies): void
    {
        Invoice::query()
            ->whereIn('status', ['issued', 'partial', 'overdue'])
            ->where('amount_due', '>', 50000)
            ->whereDate('due_date', '<', now()->subDays(60)->toDateString())
            ->limit(40)
            ->get()
            ->each(function (Invoice $invoice) use ($anomalies): void {
                $anomalies->push([
                    'entity_type' => 'invoice',
                    'entity_id' => $invoice->id,
                    'score' => 85,
                    'risk_level' => 'critical',
                    'category' => 'overdue_invoice',
                    'label' => 'rule-based insight',
                    'requires_human_validation' => true,
                    'summary' => "Facture {$invoice->invoice_number} en retard eleve ({$invoice->amount_due} MAD dus).",
                    'entity_links' => array_values(array_filter([
                        ['type' => 'invoice', 'id' => $invoice->id, 'path' => "/finance/invoices/{$invoice->id}"],
                        ['type' => 'customer', 'id' => $invoice->customer_id, 'path' => "/customers/{$invoice->customer_id}"],
                        $invoice->contract_id ? ['type' => 'contract', 'id' => $invoice->contract_id, 'path' => "/contracts/{$invoice->contract_id}"] : null,
                    ])),
                ]);
            });
    }

    private function collectCreditAnomalies(Collection $anomalies): void
    {
        CreditApplication::query()
            ->where(function ($q): void {
                $q->where('debt_ratio', '>', 0.6)
                    ->orWhere(function ($q2): void {
                        $q2->whereNull('debt_ratio')
                            ->whereNotNull('monthly_debt')
                            ->whereNotNull('monthly_income')
                            ->whereRaw('monthly_debt > monthly_income * 0.6');
                    });
            })
            ->limit(40)
            ->get()
            ->each(function (CreditApplication $app) use ($anomalies): void {
                $anomalies->push([
                    'entity_type' => 'credit_application',
                    'entity_id' => $app->id,
                    'score' => 78,
                    'risk_level' => 'high',
                    'category' => 'credit_ratio',
                    'label' => 'rule-based insight',
                    'requires_human_validation' => true,
                    'summary' => "Dossier credit {$app->id}: ratio d'endettement eleve.",
                    'entity_links' => [
                        ['type' => 'customer', 'id' => $app->customer_id, 'path' => "/customers/{$app->customer_id}"],
                        ['type' => 'credit_application', 'id' => $app->id, 'path' => '/credit'],
                    ],
                ]);
            });
    }

    private function collectFleetAnomalies(Collection $anomalies): void
    {
        Vehicle::query()
            ->whereIn('status', ['BLOCKED', 'IN_REPAIR', 'MAINTENANCE'])
            ->where(function ($q): void {
                $q->whereDate('insurance_expiry', '<', now()->toDateString())
                    ->orWhereDate('tech_control_expiry', '<', now()->toDateString());
            })
            ->limit(40)
            ->get()
            ->each(function (Vehicle $vehicle) use ($anomalies): void {
                $anomalies->push([
                    'entity_type' => 'vehicle',
                    'entity_id' => $vehicle->id,
                    'score' => 74,
                    'risk_level' => 'high',
                    'category' => 'fleet_compliance',
                    'label' => 'rule-based insight',
                    'requires_human_validation' => true,
                    'summary' => "Vehicule {$vehicle->registration_number}: statut bloque + conformite expiree.",
                    'entity_links' => [
                        ['type' => 'vehicle', 'id' => $vehicle->id, 'path' => "/fleet/{$vehicle->id}"],
                    ],
                ]);
            });
    }

    private function collectArrearsAnomalies(Collection $anomalies): void
    {
        ArrearsCase::query()
            ->whereIn('stage', ['legal', 'repossession'])
            ->where('total_overdue', '>', 70000)
            ->limit(40)
            ->get()
            ->each(function (ArrearsCase $case) use ($anomalies): void {
                $anomalies->push([
                    'entity_type' => 'arrears_case',
                    'entity_id' => $case->id,
                    'score' => 82,
                    'risk_level' => 'critical',
                    'category' => 'arrears_escalation',
                    'label' => 'rule-based insight',
                    'requires_human_validation' => true,
                    'summary' => "Dossier impaye {$case->case_number}: montant eleve en phase contentieuse.",
                    'entity_links' => [
                        ['type' => 'arrears_case', 'id' => $case->id, 'path' => "/arrears/{$case->id}"],
                        ['type' => 'customer', 'id' => $case->customer_id, 'path' => "/customers/{$case->customer_id}"],
                        $case->contract_id ? ['type' => 'contract', 'id' => $case->contract_id, 'path' => "/contracts/{$case->contract_id}"] : null,
                    ],
                ]);
            });
    }

    private function persist(Collection $items, ?User $actor): void
    {
        AiPrediction::query()
            ->where('prediction_type', 'anomalies')
            ->where('company_id', $actor?->company_id)
            ->delete();

        $items->take(35)->each(function (array $item) use ($actor): void {
            AiPrediction::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $actor?->company_id,
                'branch_id' => null,
                'prediction_type' => 'anomalies',
                'entity_type' => $item['entity_type'],
                'entity_id' => $item['entity_id'],
                'score' => $item['score'],
                'risk_level' => $item['risk_level'],
                'model_mode' => 'rule_based',
                'provider' => null,
                'summary' => $item['summary'],
                'payload' => $item,
                'predicted_at' => now(),
                'created_by' => $actor?->id,
            ]);
        });
    }
}
