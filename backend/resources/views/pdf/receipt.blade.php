@extends('pdf.layout')

@section('content')
    <h1>Reçu de paiement</h1>
    <span class="badge">{{ $payment->payment_number ?? substr($payment->id, 0, 8) }}</span>

    <table style="margin-top:8px">
        <tr>
            <th style="width:32%">Émetteur</th>
            <td>{{ $company->name ?? 'DriveFlow' }}</td>
        </tr>
        <tr>
            <th>Client</th>
            <td>{{ $customerName ?? '—' }}</td>
        </tr>
        <tr>
            <th>Date du paiement</th>
            <td>{{ optional($payment->payment_date)->format('d/m/Y') ?? '—' }}</td>
        </tr>
        <tr>
            <th>Mode de règlement</th>
            <td>{{ $methodLabel }}</td>
        </tr>
        @if($payment->check_number)
        <tr>
            <th>N° chèque</th>
            <td>{{ $payment->check_number }}{{ $payment->check_bank ? ' — '.$payment->check_bank : '' }}</td>
        </tr>
        @endif
        @if($reference)
        <tr>
            <th>Référence</th>
            <td>{{ $reference }}</td>
        </tr>
        @endif
    </table>

    <table class="totals" style="margin-top:16px; width:60%">
        <tr class="grand">
            <td>Montant reçu</td>
            <td style="text-align:right">{{ number_format((float) $payment->amount, 2, ',', ' ') }} MAD</td>
        </tr>
    </table>

    @if($invoice)
    <h2>Facture liée</h2>
    <table>
        <tr><th style="width:32%">N° facture</th><td>{{ $invoice->invoice_number }}</td></tr>
        <tr><th>Total facture</th><td>{{ number_format((float) $invoice->total_amount, 2, ',', ' ') }} MAD</td></tr>
        <tr><th>Déjà réglé</th><td>{{ number_format((float) ($invoice->amount_paid ?? 0), 2, ',', ' ') }} MAD</td></tr>
        <tr class="grand"><td>Reste dû</td><td>{{ number_format((float) ($invoice->amount_due ?? max(0, (float) $invoice->total_amount - (float) ($invoice->amount_paid ?? 0))), 2, ',', ' ') }} MAD</td></tr>
    </table>
    @endif

    <p class="muted" style="margin-top:24px">
        Ce reçu atteste du paiement mentionné ci-dessus. Conservez-le comme justificatif.
    </p>
@endsection
