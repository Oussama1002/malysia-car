<?php

namespace App\Providers;

use App\Services\Sms\ExternalSmsProviderStub;
use App\Services\Sms\LogSmsProvider;
use App\Services\Sms\SmsProviderInterface;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(SmsProviderInterface::class, function () {
            return match ((string) config('notifications.sms.provider', 'log')) {
                'external' => new ExternalSmsProviderStub(),
                default => new LogSmsProvider(),
            };
        });
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('login', function (Request $request) {
            $email = (string) $request->input('email', '');

            return Limit::perMinute(20)->by($request->ip().'|'.$email);
        });
    }
}
