<?php

namespace App\Console\Commands;

use App\Models\Contract;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

class CheckContractAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-contract-alerts';

    protected $description = 'Alert on contracts ending soon / follow-up';

    public function __construct(private readonly NotificationService $notifications)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $soon = Carbon::now()->addDays(14)->toDateString();
        $contracts = Contract::query()
            ->where('status', 'active')
            ->whereNotNull('end_date')
            ->whereDate('end_date', '<=', $soon)
            ->whereDate('end_date', '>=', now()->toDateString())
            ->limit(100)
            ->get();

        foreach ($contracts as $c) {
            $this->notifications->notifyRoles(
                roleCodes: ['AGENT_COMMERCIAL', 'DIRECTEUR', 'ADMIN'],
                category: 'contracts.expiring',
                title: 'Contrat arrive à échéance',
                body: 'Contrat '.$c->contract_number.' jusqu\'au '.$c->end_date->toDateString(),
                module: 'contracts',
                priority: 'high',
                entity: $c,
                customerId: $c->customer_id,
                linkUrl: '/contracts/'.$c->id,
            );
        }

        $this->info('Contract alerts: '.$contracts->count());

        return self::SUCCESS;
    }
}
