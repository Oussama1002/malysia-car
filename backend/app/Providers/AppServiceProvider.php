<?php

namespace App\Providers;

use App\Models\DepreciationLine;
use App\Models\Expense;
use App\Models\FixedAsset;
use App\Models\FixedChargePayment;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\SubRentalPayment;
use App\Models\WalletTransaction;
use App\Observers\DepreciationAccountingObserver;
use App\Observers\ExpenseAccountingObserver;
use App\Observers\FixedAssetAccountingObserver;
use App\Observers\FixedChargePaymentAccountingObserver;
use App\Observers\InvoiceAccountingObserver;
use App\Observers\PaymentAccountingObserver;
use App\Observers\SubRentalPaymentAccountingObserver;
use App\Observers\WalletTransactionAccountingObserver;
use App\Services\DocumentReader\GoogleVisionOcrProvider;
use App\Services\DocumentReader\OcrProviderInterface;
use App\Services\DocumentReader\TesseractOcrProvider;
use App\Services\Sms\ExternalSmsProviderStub;
use App\Services\Sms\LogSmsProvider;
use App\Services\Sms\SmsProviderInterface;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Database\Eloquent\Relations\Relation;
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
        // UI 100 % francophone : on force la locale pour que les messages de
        // validation (et autres chaînes traduites) sortent en français, quelle
        // que soit la valeur d'APP_LOCALE dans l'environnement.
        $this->app->setLocale('fr');

        // Short-alias morph map so audit_logs.entity_type and
        // app_notifications.entity_type never store a full "App\\Models\\…"
        // class name. The audit filter dropdown and the AuditTrailPresenter
        // both key off these short codes; keeping both encodings in the same
        // column (QA 2026-11-24 M8) made half of audit history invisible.
        Relation::enforceMorphMap([
            'contract' => \App\Models\Contract::class,
            'reservation' => \App\Models\Reservation::class,
            'payment' => \App\Models\Payment::class,
            'customer' => \App\Models\Customer::class,
            'vehicle' => \App\Models\Vehicle::class,
            'invoice' => \App\Models\Invoice::class,
            'mission' => \App\Models\Mission::class,
            'user' => \App\Models\User::class,
            'notification' => \App\Models\Notification::class,
            'website_lead' => \App\Models\WebsiteLead::class,
            'kyc_case' => \App\Models\CustomerKycCase::class,
            'credit_application' => \App\Models\CreditApplication::class,
            'arrears_case' => \App\Models\ArrearsCase::class,
            'signature_envelope' => \App\Models\SignatureEnvelope::class,
            'entity_attachment' => \App\Models\EntityAttachment::class,
            'supplier_agency' => \App\Models\SupplierAgency::class,
            'sub_rental_contract' => \App\Models\SubRentalContract::class,
            'sub_rental_payment' => \App\Models\SubRentalPayment::class,
            'vehicle_swap_request' => \App\Models\VehicleSwapRequest::class,
            'vehicle_maintenance_plan' => \App\Models\VehicleMaintenancePlan::class,
            'vehicle_movement' => \App\Models\VehicleMovement::class,
            'franchise_rule' => \App\Models\FranchiseRule::class,
        ]);

        Invoice::observe(InvoiceAccountingObserver::class);
        Payment::observe(PaymentAccountingObserver::class);
        DepreciationLine::observe(DepreciationAccountingObserver::class);
        FixedAsset::observe(FixedAssetAccountingObserver::class);
        Expense::observe(ExpenseAccountingObserver::class);
        FixedChargePayment::observe(FixedChargePaymentAccountingObserver::class);
        SubRentalPayment::observe(SubRentalPaymentAccountingObserver::class);
        WalletTransaction::observe(WalletTransactionAccountingObserver::class);

        RateLimiter::for('login', function (Request $request) {
            $email = (string) $request->input('email', '');

            return Limit::perMinute(20)->by($request->ip().'|'.$email);
        });
    }
}
