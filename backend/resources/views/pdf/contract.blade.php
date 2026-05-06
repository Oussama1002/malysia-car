@extends('pdf.layout')

@section('content')
    @php
        $currency = $contract->currency_code ?? 'MAD';
        $fmtMoney = function ($value) use ($currency) {
            return number_format((float) ($value ?? 0), 2, ',', ' ') . ' ' . $currency;
        };
        $fmtDate = function ($value) {
            if (empty($value)) return '—';
            try {
                return \Carbon\Carbon::parse($value)->format('d/m/Y');
            } catch (\Throwable $e) {
                return '—';
            }
        };
        $customerName =
            ($customer->display_name ?? null)
            ?: ($customer->full_name ?? null)
            ?: (method_exists($customer, 'displayName') ? $customer->displayName() : null)
            ?: ($customer->name ?? null)
            ?: '—';
        $customerEmail = $customer->email ?? ($customer->individual_profile->email ?? null);
        $customerPhone = $customer->phone ?? ($customer->individual_profile->phone ?? null);

        $plate = $vehicle->registration_number ?? $vehicle->registration ?? $vehicle->plate ?? '—';
        $brandRaw = $vehicle->brand_name ?? $vehicle->brand ?? null;
        $modelRaw = $vehicle->model_name ?? $vehicle->model ?? null;
        if (is_array($brandRaw)) { $brandRaw = $brandRaw['name'] ?? null; }
        if (is_object($brandRaw)) { $brandRaw = $brandRaw->name ?? null; }
        if (is_array($modelRaw)) { $modelRaw = $modelRaw['name'] ?? null; }
        if (is_object($modelRaw)) { $modelRaw = $modelRaw->name ?? null; }
        $brandModel = trim((string) ($brandRaw ?? '') . ' ' . (string) ($modelRaw ?? ''));

        $baseAmount = $contract->base_amount ?? 0;
        $vat = 0;
        $ttc = (float) $baseAmount + (float) $vat;
    @endphp

    <h1>Contrat {{ $contract->contract_number ?? $contract->id }}</h1>
    <span class="badge">{{ strtoupper($contract->status ?? 'brouillon') }}</span>

    <h2>Parties</h2>
    <table>
        <tr>
            <th style="width:30%">Loueur / Société</th>
            <td>{{ $company->name ?? 'DriveFlow' }}</td>
        </tr>
        <tr>
            <th>Locataire</th>
            <td>
                {{ $customerName }}<br>
                <span class="muted">{{ $customerEmail ?? '' }} {{ $customerPhone ? ' · '.$customerPhone : '' }}</span>
            </td>
        </tr>
    </table>

    <h2>Véhicule</h2>
    <table>
        <tr>
            <th style="width:30%">Immatriculation</th>
            <td>{{ $plate }}</td>
        </tr>
        <tr>
            <th>Marque / Modèle</th>
            <td>{{ $brandModel ?: '—' }}</td>
        </tr>
        <tr>
            <th>Kilométrage départ</th>
            <td>{{ number_format((float) ($vehicle->mileage_current ?? $vehicle->mileage_km ?? 0), 0, ',', ' ') }} km</td>
        </tr>
    </table>

    <h2>Conditions financières</h2>
    <table>
        <tr><th style="width:30%">Date début</th><td>{{ $fmtDate($contract->start_date) }}</td></tr>
        <tr><th>Date fin prévue</th><td>{{ $fmtDate($contract->end_date) }}</td></tr>
        <tr><th>Mensualité</th><td>{{ $fmtMoney($contract->monthly_payment) }}</td></tr>
        <tr><th>Caution</th><td>{{ $fmtMoney($contract->deposit_amount) }}</td></tr>
        <tr><th>Total HT</th><td>{{ $fmtMoney($baseAmount) }}</td></tr>
        <tr><th>TVA</th><td>{{ $fmtMoney($vat) }}</td></tr>
        <tr><th>Total TTC</th><td><strong>{{ $fmtMoney($ttc) }}</strong></td></tr>
    </table>

    <h2>Clauses</h2>
    <p class="muted">
        Le présent contrat est régi par les conditions générales en vigueur. Le locataire reconnaît avoir
        pris connaissance de l'état du véhicule au départ et s'engage à le restituer dans le même état,
        franchise applicable en cas de sinistre.
    </p>

    <table style="margin-top:30px">
        <tr>
            <td style="width:50%; border:none">
                <strong>Loueur</strong><br>
                <span class="muted">Signature & cachet</span>
                <div style="height:60px"></div>
            </td>
            <td style="width:50%; border:none">
                <strong>Locataire</strong><br>
                <span class="muted">Signature précédée de "Lu et approuvé"</span>
                <div style="height:60px"></div>
            </td>
        </tr>
    </table>
@endsection
