<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\SubRentalContract;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class SubRentalAlertService
{
    public function __construct(private readonly NotificationService $notificationService) {}

    public function checkReturnDue(): void
    {
        // Returns due in exactly 3 days
        $this->alertReturnDueInDays(3);

        // Returns due tomorrow
        $this->alertReturnDueInDays(1);

        // Overdue returns
        $this->alertOverdueReturns();

        // Blacklisted supplier with active contract
        $this->alertBlacklistedSupplierContracts();
    }

    private function alertReturnDueInDays(int $days): void
    {
        $targetDate = Carbon::today()->addDays($days)->toDateString();

        $contracts = SubRentalContract::query()
            ->with(['supplierAgency', 'vehicle'])
            ->where('status', 'active')
            ->whereDate('end_date', $targetDate)
            ->get();

        foreach ($contracts as $contract) {
            $this->createReturnDueNotification($contract, $days);
        }
    }

    public function createReturnDueNotification(SubRentalContract $contract, int $daysLeft): void
    {
        $recipients = $this->getManagerRecipients($contract->company_id);

        foreach ($recipients as $user) {
            // Avoid duplicate within 24h
            $exists = Notification::query()
                ->where('user_id', $user->id)
                ->where('entity_type', 'sub_rental_contract')
                ->where('entity_id', $contract->id)
                ->where('category', 'sub_rental_return_due')
                ->where('created_at', '>=', now()->subDay())
                ->exists();

            if ($exists) {
                continue;
            }

            try {
                $this->notificationService->notifyUser(
                    userId: $user->id,
                    category: 'sub_rental_return_due',
                    title: "Retour fournisseur dans {$daysLeft} jour(s)",
                    body: sprintf(
                        'Le contrat %s (véhicule: %s, fournisseur: %s) doit être retourné le %s.',
                        $contract->contract_number,
                        $contract->vehicle?->registration_number ?? ($contract->external_vehicle_identity['registration_number'] ?? 'N/A'),
                        $contract->supplierAgency?->name ?? 'N/A',
                        $contract->end_date?->format('d/m/Y')
                    ),
                    module: 'fleet',
                    priority: $daysLeft <= 1 ? 'high' : 'normal',
                    entity: $contract,
                    linkUrl: "/fleet/sub-rentals/{$contract->id}",
                    payload: [
                        'sub_rental_contract_id' => $contract->id,
                        'days_left'              => $daysLeft,
                        'end_date'               => $contract->end_date?->toDateString(),
                    ],
                );
            } catch (\Throwable $e) {
                Log::warning("SubRentalAlertService: failed to create return_due notification for contract {$contract->id}: " . $e->getMessage());
            }
        }
    }

    public function createOverdueReturnNotification(SubRentalContract $contract): void
    {
        $recipients = $this->getManagerRecipients($contract->company_id);

        foreach ($recipients as $user) {
            $exists = Notification::query()
                ->where('user_id', $user->id)
                ->where('entity_type', 'sub_rental_contract')
                ->where('entity_id', $contract->id)
                ->where('category', 'sub_rental_overdue')
                ->where('created_at', '>=', now()->subDay())
                ->exists();

            if ($exists) {
                continue;
            }

            try {
                $this->notificationService->notifyUser(
                    userId: $user->id,
                    category: 'sub_rental_overdue',
                    title: 'Retour fournisseur EN RETARD',
                    body: sprintf(
                        'Le contrat %s (fournisseur: %s) est en retard depuis le %s. Retour immédiat requis.',
                        $contract->contract_number,
                        $contract->supplierAgency?->name ?? 'N/A',
                        $contract->end_date?->format('d/m/Y')
                    ),
                    module: 'fleet',
                    priority: 'urgent',
                    entity: $contract,
                    linkUrl: "/fleet/sub-rentals/{$contract->id}",
                    payload: [
                        'sub_rental_contract_id' => $contract->id,
                        'overdue_days'           => Carbon::today()->diffInDays($contract->end_date),
                        'end_date'               => $contract->end_date?->toDateString(),
                    ],
                );
            } catch (\Throwable $e) {
                Log::warning("SubRentalAlertService: failed to create overdue notification for contract {$contract->id}: " . $e->getMessage());
            }
        }
    }

    public function createNegativeMarginNotification(SubRentalContract $contract, float $margin): void
    {
        $recipients = $this->getManagerRecipients($contract->company_id);

        foreach ($recipients as $user) {
            try {
                $this->notificationService->notifyUser(
                    userId: $user->id,
                    category: 'sub_rental_margin_negative',
                    title: 'Marge négative sur sous-location',
                    body: sprintf(
                        'Le contrat %s (fournisseur: %s) génère une marge négative de %.2f MAD.',
                        $contract->contract_number,
                        $contract->supplierAgency?->name ?? 'N/A',
                        $margin
                    ),
                    module: 'fleet',
                    priority: 'high',
                    entity: $contract,
                    linkUrl: "/fleet/sub-rentals/{$contract->id}",
                    payload: [
                        'sub_rental_contract_id' => $contract->id,
                        'margin'                 => $margin,
                    ],
                );
            } catch (\Throwable $e) {
                Log::warning("SubRentalAlertService: failed to create margin_negative notification: " . $e->getMessage());
            }
        }
    }

    private function alertOverdueReturns(): void
    {
        $contracts = SubRentalContract::query()
            ->with(['supplierAgency', 'vehicle'])
            ->where('status', 'active')
            ->whereDate('end_date', '<', Carbon::today()->toDateString())
            ->get();

        foreach ($contracts as $contract) {
            $this->createOverdueReturnNotification($contract);
        }
    }

    private function alertBlacklistedSupplierContracts(): void
    {
        $contracts = SubRentalContract::query()
            ->with(['supplierAgency'])
            ->where('status', 'active')
            ->whereHas('supplierAgency', fn ($q) => $q->where('status', 'blacklisted'))
            ->get();

        foreach ($contracts as $contract) {
            $recipients = $this->getManagerRecipients($contract->company_id);
            foreach ($recipients as $user) {
                try {
                    $this->notificationService->notifyUser(
                        userId: $user->id,
                        category: 'sub_rental_blacklisted_supplier',
                        title: 'Fournisseur sur liste noire avec contrat actif',
                        body: sprintf(
                            'Le fournisseur "%s" est sur liste noire mais possède un contrat actif (%s).',
                            $contract->supplierAgency?->name ?? 'N/A',
                            $contract->contract_number
                        ),
                        module: 'fleet',
                        priority: 'high',
                        entity: $contract,
                        linkUrl: "/fleet/sub-rentals/{$contract->id}",
                        payload: ['sub_rental_contract_id' => $contract->id],
                    );
                } catch (\Throwable $e) {
                    Log::warning("SubRentalAlertService: blacklisted_supplier notification failed: " . $e->getMessage());
                }
            }
        }
    }

    /** @return \Illuminate\Support\Collection<int, User> */
    private function getManagerRecipients(string $companyId): \Illuminate\Support\Collection
    {
        return User::query()
            ->where('company_id', $companyId)
            ->where('is_active', true)
            ->whereHas('roles', fn ($q) => $q->whereIn('code', ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE']))
            ->get();
    }
}
