<?php

namespace App\Providers;

use App\Services\DocumentReader\OcrProviderInterface;
use App\Services\DocumentReader\TesseractOcrProvider;
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

        $this->app->singleton(OcrProviderInterface::class, function () {
            // Future: switch on config('document_reader.provider') to swap in
            // Google Document AI / Azure Document Intelligence implementations.
            return new TesseractOcrProvider(
                tesseractBin: (string) config('document_reader.tesseract.bin', 'tesseract'),
                pdftoppmBin: (string) config('document_reader.tesseract.pdftoppm_bin', 'pdftoppm'),
                defaultLang: (string) config('document_reader.tesseract.lang', 'fra+eng'),
                timeoutSeconds: (int) config('document_reader.tesseract.timeout', 120),
            );
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
