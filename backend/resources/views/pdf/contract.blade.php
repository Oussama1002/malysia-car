@extends('pdf.layout')

@section('content')
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
                {{ $customer->full_name ?? ($customer->name ?? '—') }}<br>
                <span class="muted">{{ $customer->email ?? '' }} {{ $customer->phone ? ' · '.$customer->phone : '' }}</span>
            </td>
        </tr>
    </table>

    <h2>Véhicule</h2>
    <table>
        <tr>
            <th style="width:30%">Immatriculation</th>
            <td>{{ $vehicle->plate ?? '—' }}</td>
        </tr>
        <tr>
            <th>Marque / Modèle</th>
            <td>{{ trim(($vehicle->brand ?? '').' '.($vehicle->model ?? '')) ?: '—' }}</td>
        </tr>
        <tr>
            <th>Kilométrage départ</th>
            <td>{{ number_format($contract->start_km ?? 0, 0, ',', ' ') }} km</td>
        </tr>
    </table>

    <h2>Conditions financières</h2>
    <table>
        <tr><th style="width:30%">Date début</th><td>{{ optional($contract->start_at)->format('d/m/Y H:i') ?? '—' }}</td></tr>
        <tr><th>Date fin prévue</th><td>{{ optional($contract->end_at)->format('d/m/Y H:i') ?? '—' }}</td></tr>
        <tr><th>Tarif journalier HT</th><td>{{ number_format($contract->daily_rate_ht ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr><th>Caution</th><td>{{ number_format($contract->deposit ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr><th>Total HT</th><td>{{ number_format($contract->total_ht ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr><th>TVA</th><td>{{ number_format($contract->total_tax ?? 0, 2, ',', ' ') }} €</td></tr>
        <tr><th>Total TTC</th><td><strong>{{ number_format($contract->total_ttc ?? 0, 2, ',', ' ') }} €</strong></td></tr>
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
