<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;

class CheckMaintenanceAlertsCommand extends Command
{
    protected $signature = 'driveflow:check-maintenance-alerts';

    protected $description = 'Alias: run maintenance plan due checks (vidange, CT, etc. via plans)';

    public function handle(): int
    {
        return $this->call('driveflow:check-maintenance-due');
    }
}
