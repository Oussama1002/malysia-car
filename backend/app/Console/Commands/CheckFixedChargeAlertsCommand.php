<?php

namespace App\Console\Commands;

use App\Services\FixedChargeService;
use Illuminate\Console\Command;

class CheckFixedChargeAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-fixed-charge-alerts';

    protected $description = 'Mark overdue fixed-charge payments and notify';

    public function __construct(private readonly FixedChargeService $fixedChargeService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $n = $this->fixedChargeService->refreshOverduePayments();
        $this->info("Fixed charge overdue refresh: {$n}");

        return self::SUCCESS;
    }
}
