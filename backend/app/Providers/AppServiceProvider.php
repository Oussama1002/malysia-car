<?php

namespace App\Providers;

use App\Services\DocumentReader\GoogleVisionOcrProvider;
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
            $tesseract = new TesseractOcrProvider(
                tesseractBin: (string) config('document_reader.tesseract.bin', 'tesseract'),
                pdftoppmBin: (string) config('document_reader.tesseract.pdftoppm_bin', 'pdftoppm'),
                defaultLang: (string) config('document_reader.tesseract.lang', 'fra+eng'),
                timeoutSeconds: (int) config('document_reader.tesseract.timeout', 120),
            );

            // Google Vision when selected — with Tesseract kept as the automatic
            // fallback so a bad key / network issue never breaks OCR entirely.
            if ((string) config('document_reader.provider') === 'google_vision') {
                return new GoogleVisionOcrProvider(
                    apiKey: (string) config('document_reader.google_vision.api_key', ''),
                    endpoint: (string) config('document_reader.google_vision.endpoint', 'https://vision.googleapis.com/v1'),
                    timeoutSeconds: (int) config('document_reader.google_vision.timeout', 120),
                    maxPdfPages: (int) config('document_reader.google_vision.max_pdf_pages', 5),
                    fallback: $tesseract,
                );
            }

            return $tesseract;
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
