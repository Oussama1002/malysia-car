<?php

namespace App\Console\Commands;

use App\Services\FixedChargeService;
use Illuminate\Console\Command;

class CheckFixedChargeAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-fixed-charge-alerts';

    protected $description = 'Mark overdue fixed-charge payments and notify upcoming due-date thresholds';

    public function __construct(private readonly FixedChargeService $fixedChargeService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $overdue  = $this->fixedChargeService->refreshOverduePayments();
        $upcoming = $this->fixedChargeService->notifyUpcomingPayments();
        $this->info("Fixed charge overdue refresh: {$overdue} | upcoming notifications: {$upcoming}");

        return self::SUCCESS;
    }
}
