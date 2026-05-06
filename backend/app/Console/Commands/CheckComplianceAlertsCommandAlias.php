<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class CheckComplianceAlertsCommandAlias extends Command
{
    protected $signature = 'driveflow:check-compliance-alerts';

    protected $description = 'Alias: compliance expiry (visite technique, assurance…)';

    public function handle(): int
    {
        return $this->call('driveflow:check-compliance-expiry');
    }
}
