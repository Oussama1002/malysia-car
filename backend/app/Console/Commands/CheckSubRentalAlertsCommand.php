<?php

namespace App\Console\Commands;

use App\Services\SubRentalAlertService;
use Illuminate\Console\Command;

class CheckSubRentalAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-sub-rental-alerts';
    protected $description = 'Check sub-rental contracts for return due alerts, overdue returns, and negative margins';

    public function __construct(private readonly SubRentalAlertService $alertService)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->info('Checking sub-rental alerts...');

        try {
            $this->alertService->checkReturnDue();
            $this->info('Sub-rental alert checks complete.');
        } catch (\Throwable $e) {
            $this->error('Sub-rental alert check failed: ' . $e->getMessage());
            return self::FAILURE;
        }

        return self::SUCCESS;
    }
}
