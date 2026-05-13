<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('driveflow:check-maintenance-due')->hourly();
Schedule::command('driveflow:check-maintenance-alerts')->hourly();
Schedule::command('driveflow:check-vehicle-documents-expiry')->twiceDaily(8, 16);
Schedule::command('driveflow:check-immobilized-vehicles')->everyThirtyMinutes();
Schedule::command('driveflow:check-compliance-expiry')->dailyAt('07:15');
Schedule::command('driveflow:check-compliance-alerts')->dailyAt('07:15');
Schedule::command('driveflow:check-contract-alerts')->dailyAt('08:00');
Schedule::command('driveflow:check-reservation-alerts')->everyFourHours();
Schedule::command('driveflow:check-fixed-charge-alerts')->dailyAt('07:30');
Schedule::command('driveflow:check-sub-rental-alerts')->dailyAt('08:00');
