@extends('pdf.layout')

@section('content')
    <h1>Facture {{ $invoice->invoice_number ?? $invoice->number ?? $invoice->id }}</h1>
    <span class="badge">{{ strtoupper($invoice->status ?? 'draft') }}</span>

    <table style="margin-top:8px">
        <tr>
            <th style="width:30%">Émetteur</th>
            <td>{{ $company->name ?? 'DriveFlow' }}</td>
        </tr>
        <tr>
            <th>Client</th>
            <td>
                {{ $customer->full_name ?? ($customer->name ?? '—') }}<br>
                <span class="muted">{{ $customer->email ?? '' }}</span>
            </td>
        </tr>
        <tr>
            <th>Date d'émission</th>
            <td>{{ optional($invoice->issued_at ?? $invoice->created_at)->format('d/m/Y') ?? '—' }}</td>
        </tr>
        <tr>
            <th>Date d'échéance</th>
            <td>{{ optional($invoice->due_at)->format('d/m/Y') ?? '—' }}</td>
        </tr>
    </table>

    <h2>Détail</h2>
    <table>
        <thead>
            <tr>
                <th>Désignation</th>
                <th style="width:12%">Qté</th>
                <th style="width:18%">PU HT</th>
                <th style="width:10%">TVA</th>
                <th style="width:18%">Total HT</th>
            </tr>
        </thead>
        <tbody>
            @foreach(($lines ?? []) as $line)
                <tr>
                    <td>{{ $line['label'] ?? $line['description'] ?? '' }}</td>
                    <td>{{ number_format($line['qty'] ?? $line['quantity'] ?? 1, 2, ',', ' ') }}</td>
                    <td>{{ number_format($line['unit_price_ht'] ?? $line['price'] ?? 0, 2, ',', ' ') }} €</td>
                    <td>{{ number_format($line['tax_rate'] ?? 0, 1, ',', ' ') }} %</td>
                    <td>{{ number_format($line['total_ht'] ?? (($line['qty'] ?? 1) * ($line['unit_price_ht'] ?? 0)), 2, ',', ' ') }} €</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <table class="totals" style="margin-top:14px; width:50%; float:right">
        <tr><td>Total HT</td><td style="text-align:right">{{ number_format($invoice->total_ht ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr><td>TVA</td><td style="text-align:right">{{ number_format($invoice->total_tax ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr class="grand"><td>Total TTC</td><td style="text-align:right">{{ number_format($invoice->total_ttc ?? 0, 2, ',', ' ') }} €</td></tr>
    </table>

    <div style="clear:both"></div>

    <h2>Modalités de paiement</h2>
    <p class="muted">
        Paiement à réception. Tout retard expose à des pénalités au taux légal en vigueur ainsi qu'à
        une indemnité forfaitaire de 40 € pour frais de recouvrement.
    </p>
@endsection
