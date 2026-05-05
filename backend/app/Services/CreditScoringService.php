<?php

namespace App\Services;

use App\Models\ContractInstallment;
use App\Models\CreditApplication;
use App\Models\CreditScore;
use Illuminate\Support\Str;

class CreditScoringService
{
    /**
     * @return array{score:float,risk_band:string,recommendation:string,factors_positive:array<int,string>,factors_negative:array<int,string>,breakdown:array<string,mixed>}
     */
    public function compute(CreditApplication $application): array
    {
        $application->loadMissing([
            'customer.latestKycCase.documents',
            'customer.employmentProfile',
            'customer.blacklistEntries',
        ]);

        $customer = $application->customer;
        $income = (float) ($application->monthly_income ?? 0);
        $debt = (float) ($application->monthly_debt ?? 0);
        $requested = (float) ($application->requested_amount ?? 0);
        $down = (float) ($application->down_payment_amount ?? 0);
        $duration = (int) ($application->requested_duration_months ?? 0);
        $debtRatio = $income > 0 ? min(1.0, max(0.0, $debt / $income)) : 1.0;
        $downPct = $requested > 0 ? min(1.0, max(0.0, $down / $requested)) : 0.0;

        $employment = $customer?->employmentProfile;
        $stableEmployment = $employment && in_array((string) $employment->employment_type, ['cdi', 'retired', 'self_employed'], true);
        $cnssAvailable = (bool) ($employment?->cnss_registered ?? false);
        $customerType = (string) ($customer?->customer_type ?? 'PARTICULIER');
        $isBlacklisted = (bool) ($customer?->is_blacklisted ?? false);
        $activeBlacklist = $customer?->blacklistEntries?->firstWhere('removed_at', null);
        if ($activeBlacklist) {
            $isBlacklisted = true;
        }

        $latestKyc = $customer?->latestKycCase;
        $kycApproved = (string) ($latestKyc?->kyc_status ?? '') === 'approved';
        $kycComplete = $kycApproved && (($latestKyc?->documents?->count() ?? 0) >= 2);

        $lateInstallments = 0;
        if ($customer) {
            $lateInstallments = ContractInstallment::query()
                ->whereHas('contract', fn ($q) => $q->where('customer_id', $customer->id))
                ->whereIn('installment_status', ['overdue'])
                ->count();
        }

        $positive = [];
        $negative = [];
        $score = 50.0;
        $breakdown = [];

        // revenu mensuel
        $incomePoints = $income >= 15000 ? 12 : ($income >= 8000 ? 8 : ($income >= 4000 ? 4 : 0));
        $score += $incomePoints;
        $breakdown['monthly_income'] = $incomePoints;
        if ($incomePoints >= 8) $positive[] = 'Revenu mensuel solide';
        if ($incomePoints === 0) $negative[] = 'Revenu mensuel faible';

        // taux d'endettement
        $debtPoints = $debtRatio <= 0.25 ? 16 : ($debtRatio <= 0.35 ? 10 : ($debtRatio <= 0.45 ? 4 : -8));
        $score += $debtPoints;
        $breakdown['debt_ratio'] = $debtPoints;
        if ($debtPoints >= 10) $positive[] = 'Taux d\'endettement sain';
        if ($debtPoints < 0) $negative[] = 'Taux d\'endettement eleve';

        // stabilite professionnelle
        $employmentPoints = $stableEmployment ? 8 : -4;
        $score += $employmentPoints;
        $breakdown['employment_stability'] = $employmentPoints;
        if ($stableEmployment) $positive[] = 'Situation professionnelle stable';
        else $negative[] = 'Stabilite professionnelle limitee';

        // CNSS
        $cnssPoints = $cnssAvailable ? 5 : -3;
        $score += $cnssPoints;
        $breakdown['cnss'] = $cnssPoints;
        if ($cnssAvailable) $positive[] = 'Affiliation CNSS disponible';
        else $negative[] = 'Absence de preuve CNSS';

        // apport initial
        $downPoints = $downPct >= 0.3 ? 10 : ($downPct >= 0.2 ? 7 : ($downPct >= 0.1 ? 3 : -5));
        $score += $downPoints;
        $breakdown['down_payment'] = $downPoints;
        if ($downPoints >= 7) $positive[] = 'Apport initial confortable';
        if ($downPoints < 0) $negative[] = 'Apport initial insuffisant';

        // duree demandee
        $durationPoints = $duration <= 36 ? 7 : ($duration <= 60 ? 3 : -5);
        $score += $durationPoints;
        $breakdown['requested_duration'] = $durationPoints;
        if ($durationPoints > 0) $positive[] = 'Duree de financement raisonnable';
        else $negative[] = 'Duree de financement longue';

        // historique client & retards
        $historyPoints = $lateInstallments === 0 ? 10 : ($lateInstallments <= 2 ? -4 : -12);
        $score += $historyPoints;
        $breakdown['payment_history'] = $historyPoints;
        if ($lateInstallments === 0) $positive[] = 'Historique client sans retard connu';
        else $negative[] = 'Retards de paiement existants';

        // blacklist
        $blacklistPoints = $isBlacklisted ? -40 : 4;
        $score += $blacklistPoints;
        $breakdown['blacklist'] = $blacklistPoints;
        if ($isBlacklisted) $negative[] = 'Client blackliste';
        else $positive[] = 'Aucun signalement blacklist';

        // type client
        $typePoints = $customerType === 'ENTREPRISE' ? 3 : 0;
        $score += $typePoints;
        $breakdown['customer_type'] = $typePoints;
        if ($typePoints > 0) $positive[] = 'Profil entreprise';

        // KYC complet
        $kycPoints = $kycComplete ? 8 : -10;
        $score += $kycPoints;
        $breakdown['kyc_completeness'] = $kycPoints;
        if ($kycComplete) $positive[] = 'KYC complet et approuve';
        else $negative[] = 'KYC incomplet ou non approuve';

        $score = max(0, min(100, round($score, 2)));
        $riskBand = $score >= 80 ? 'A' : ($score >= 65 ? 'B' : ($score >= 50 ? 'C' : 'D'));
        $recommendation = match ($riskBand) {
            'A' => 'APPROVE',
            'B' => 'APPROVE_WITH_MONITORING',
            'C' => 'COMMITTEE_REVIEW',
            default => 'REJECT_RECOMMENDED',
        };

        if ($isBlacklisted || !$kycApproved) {
            $riskBand = 'D';
            $recommendation = 'REJECT_RECOMMENDED';
        }

        $breakdown['risk_band'] = $riskBand;
        $breakdown['debt_ratio_value'] = $debtRatio;
        $breakdown['down_payment_ratio'] = $downPct;
        $breakdown['late_installments'] = $lateInstallments;

        return [
            'score' => $score,
            'risk_band' => $riskBand,
            'recommendation' => $recommendation,
            'factors_positive' => array_values(array_unique($positive)),
            'factors_negative' => array_values(array_unique($negative)),
            'breakdown' => $breakdown,
        ];
    }

    public function persist(CreditApplication $application, array $result, ?string $scoredBy = null): CreditScore
    {
        return CreditScore::query()->create([
            'id' => (string) Str::uuid(),
            'credit_application_id' => $application->id,
            'customer_id' => $application->customer_id,
            'score' => $result['score'],
            'risk_band' => $result['risk_band'],
            'recommendation' => $result['recommendation'],
            'factors_positive' => $result['factors_positive'],
            'factors_negative' => $result['factors_negative'],
            'breakdown' => $result['breakdown'],
            'scored_by' => $scoredBy,
            'scored_at' => now(),
        ]);
    }
}
