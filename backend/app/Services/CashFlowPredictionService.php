<?php

namespace App\Services;

use App\Models\AiPrediction;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class CashFlowPredictionService
{
    public function generate(?User $actor = null, bool $persist = true): array
    {
        $openInvoices = Invoice::query()
            ->with('customer')
            ->whereIn('status', ['issued', 'partial', 'overdue'])
            ->where('amount_due', '>', 0)
            ->orderBy('due_date')
            ->limit(300)
            ->get();

        $items = $openInvoices->map(function (Invoice $invoice): array {
            $daysLate = $invoice->due_date ? now()->startOfDay()->diffInDays($invoice->due_date, false) * -1 : 0;
            $amountDue = (float) $invoice->amount_due;

            $score = 0;
            if ($daysLate > 90) {
                $score += 55;
            } elseif ($daysLate > 60) {
                $score += 40;
            } elseif ($daysLate > 30) {
                $score += 25;
            } elseif ($daysLate > 0) {
                $score += 10;
            }

            if ($amountDue > 150000) {
                $score += 30;
            } elseif ($amountDue > 60000) {
                $score += 20;
            } elseif ($amountDue > 20000) {
                $score += 10;
            }
            $score = min(100, $score);

            return [
                'entity_type' => 'invoice',
                'entity_id' => $invoice->id,
                'invoice_id' => $invoice->id,
                'invoice_number' => $invoice->invoice_number,
                'customer_id' => $invoice->customer_id,
                'customer_name' => $invoice->customer?->displayName() ?? "Client {$invoice->customer_id}",
                'contract_id' => $invoice->contract_id,
                'amount_due' => round($amountDue, 2),
                'due_date' => $invoice->due_date?->toDateString(),
                'days_overdue' => max(0, $daysLate),
                'score' => $score,
                'risk_level' => $this->riskLevel($score),
                'label' => 'rule-based insight',
                'requires_human_validation' => true,
                'summary' => sprintf('Facture %s: risque de tension de tresorerie %d/100.', $invoice->invoice_number, $score),
                'entity_links' => array_values(array_filter([
                    ['type' => 'invoice', 'id' => $invoice->id, 'path' => "/finance/invoices/{$invoice->id}"],
                    ['type' => 'customer', 'id' => $invoice->customer_id, 'path' => "/customers/{$invoice->customer_id}"],
                    $invoice->contract_id ? ['type' => 'contract', 'id' => $invoice->contract_id, 'path' => "/contracts/{$invoice->contract_id}"] : null,
                ])),
            ];
        })->sortByDesc('score')->values();

        $inflow90d = (float) Payment::query()
            ->whereIn('status', ['received', 'allocated'])
            ->whereDate('payment_date', '>=', now()->subDays(90)->toDateString())
            ->sum('amount');
        $avgDailyInflow = $inflow90d / 90;
        $forecastInflow30d = $avgDailyInflow * 30;
        $due30d = (float) Invoice::query()
            ->whereIn('status', ['issued', 'partial', 'overdue'])
            ->whereDate('due_date', '<=', now()->addDays(30)->toDateString())
            ->sum('amount_due');
        $netForecast30d = $forecastInflow30d - $due30d;

        if ($persist) {
            $this->persistPredictions($items, $actor, $netForecast30d);
        }

        return [
            'generated_at' => now()->toIso8601String(),
            'total_open_invoices' => $items->count(),
            'overdue_invoices' => $items->where('days_overdue', '>', 0)->count(),
            'forecast' => [
                'expected_inflow_30d' => round($forecastInflow30d, 2),
                'expected_due_30d' => round($due30d, 2),
                'net_cash_flow_30d' => round($netForecast30d, 2),
            ],
            'items' => $items->take(50)->values()->all(),
            'model_mode' => 'rule_based',
        ];
    }

    private function riskLevel(int $score): string
    {
        return match (true) {
            $score >= 75 => 'critical',
            $score >= 55 => 'high',
            $score >= 30 => 'medium',
            default => 'low',
        };
    }

    private function persistPredictions(Collection $items, ?User $actor, float $netForecast30d): void
    {
        AiPrediction::query()
            ->where('prediction_type', 'cash-flow')
            ->where('company_id', $actor?->company_id)
            ->delete();

        $items->take(25)->each(function (array $item) use ($actor): void {
            AiPrediction::query()->create([
                'id' => (string) Str::uuid(),
                'company_id' => $actor?->company_id,
                'branch_id' => null,
                'prediction_type' => 'cash-flow',
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

        AiPrediction::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $actor?->company_id,
            'branch_id' => null,
            'prediction_type' => 'cash-flow',
            'entity_type' => 'portfolio',
            'entity_id' => null,
            'score' => $netForecast30d < 0 ? 80 : 35,
            'risk_level' => $netForecast30d < 0 ? 'high' : 'low',
            'model_mode' => 'rule_based',
            'provider' => null,
            'summary' => sprintf('Projection nette de tresorerie a 30 jours: %.2f MAD', $netForecast30d),
            'payload' => [
                'net_cash_flow_30d' => round($netForecast30d, 2),
            ],
            'predicted_at' => now(),
            'created_by' => $actor?->id,
        ]);
    }
}
