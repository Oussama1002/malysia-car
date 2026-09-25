<?php

namespace App\Console\Commands;

use App\Models\Payment;
use App\Services\NotificationService;
use Carbon\Carbon;
use Illuminate\Console\Command;

/**
 * Un chèque reçu n'est pas un chèque encaissé. Passé le délai de grâce réglé
 * dans Paramètres → Paiements, l'agence est prévenue tant qu'il reste en
 * attente : c'est de l'argent qu'on croit avoir.
 */
class CheckPendingChequesCommand extends Command
{
    protected $signature = 'driveflow:check-pending-cheques';

    protected $description = 'Notify about cheques received but not cashed yet';

    public function __construct(private readonly NotificationService $notifications)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $notified = 0;

        Payment::query()
            ->whereIn('payment_method', ['check', 'cheque'])
            ->whereNotIn('status', ['reversed', 'refunded'])
            ->where(fn ($q) => $q->whereNull('cheque_status')->orWhere('cheque_status', 'pending'))
            ->with('customer')
            ->orderBy('payment_date')
            ->chunkById(200, function ($payments) use (&$notified) {
                foreach ($payments as $payment) {
                    $graceDays = (int) \App\Support\CompanyDefaults::get($payment->company_id, 'payments.cheque_grace_days', 3);

                    // Un chèque daté du futur n'est pas en retard : on compte à
                    // partir de sa date d'échéance quand elle existe.
                    $reference = $payment->check_date ?? $payment->payment_date;
                    if (! $reference) {
                        continue;
                    }
                    $due = Carbon::parse($reference)->addDays(max(0, $graceDays));
                    if ($due->isFuture()) {
                        continue;
                    }

                    $days = (int) $due->diffInDays(now());
                    $this->notifications->notifyRoles(
                        roleCodes: ['COMPTABLE', 'DIRECTEUR', 'ADMIN'],
                        category: 'finance.cheque_pending',
                        title: 'Chèque non encaissé',
                        body: 'Chèque n° '.($payment->check_number ?? '—')
                            .' de '.number_format((float) $payment->amount, 2, ',', ' ').' MAD'
                            .' — en attente depuis '.$days.' jour'.($days > 1 ? 's' : '')
                            .($payment->check_bank ? ' ('.$payment->check_bank.')' : ''),
                        module: 'finance',
                        priority: $days >= 15 ? 'high' : 'normal',
                        entity: $payment,
                        linkUrl: '/finance/payments',
                    );
                    $notified++;
                }
            });

        $this->info('Chèques en attente signalés : '.$notified);

        return self::SUCCESS;
    }
}
