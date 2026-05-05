<?php

namespace App\Console\Commands;

use App\Services\ComplianceAlertService;
use Illuminate\Console\Command;

class CheckComplianceExpiryCommand extends Command
{
    protected $signature = 'driveflow:check-compliance-expiry';
    protected $description = 'Sync insurance and technical inspection compliance alerts';

    public function __construct(private readonly ComplianceAlertService $service)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $this->service->syncAll();
        $this->info('Compliance alerts synced.');

        return self::SUCCESS;
    }
}
