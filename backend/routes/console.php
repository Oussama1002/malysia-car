<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('driveflow:check-maintenance-due')->hourly();
Schedule::command('driveflow:check-vehicle-documents-expiry')->twiceDaily(8, 16);
Schedule::command('driveflow:check-immobilized-vehicles')->everyThirtyMinutes();
Schedule::command('driveflow:check-compliance-expiry')->dailyAt('07:15');
