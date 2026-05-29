<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Preuve de signature' }}</title>
    <style>
        @page { margin: 24mm 18mm 20mm 18mm; }
        * { box-sizing: border-box; }
        body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.5; }
        h1 { font-size: 20px; color: #111827; margin: 0 0 2px 0; }
        h2 { font-size: 13px; color: #111827; margin: 18px 0 6px 0; }
        .header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 16px; }
        .brand { font-size: 16px; font-weight: 800; color: #4f46e5; }
        .muted { color: #6b7280; }
        table { width: 100%; border-collapse: collapse; margin-top: 6px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
        th { width: 38%; background: #f9fafb; font-weight: 700; color: #374151; }
        .badge { display: inline-block; padding: 3px 10px; background: #ecfdf5; color: #047857; border-radius: 6px; font-size: 11px; font-weight: 800; }
        .sigbox { margin-top: 8px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px; width: 320px; }
        .sigbox img { max-width: 300px; max-height: 140px; }
        .footer { position: fixed; bottom: -12mm; left: 0; right: 0; text-align: center; color: #9ca3af; font-size: 9px; }
        .mono { font-family: DejaVu Sans Mono, monospace; font-size: 10px; color: #374151; }
    </style>
</head>
<body>
    <div class="header">
        <div class="brand">DriveFlow</div>
        <h1>Preuve de signature électronique</h1>
        <div class="muted">Document généré automatiquement — valeur probante</div>
    </div>

    <span class="badge">SIGNÉ</span>

    <h2>Contrat</h2>
    <table>
        <tr><th>Référence</th><td>{{ $summary['contract_number'] ?? '—' }}</td></tr>
        <tr><th>Type</th><td>{{ $summary['contract_type'] ?? '—' }}</td></tr>
        <tr><th>Période</th><td>{{ $summary['start_date'] ?? '—' }} → {{ $summary['end_date'] ?? '—' }}</td></tr>
        @if(!empty($summary['vehicle']))
            <tr><th>Véhicule</th><td>{{ trim(($summary['vehicle']['brand'] ?? '').' '.($summary['vehicle']['model'] ?? '')) ?: '—' }} @if(!empty($summary['vehicle']['registration'])) · {{ $summary['vehicle']['registration'] }} @endif</td></tr>
        @endif
        @if(!empty($summary['base_amount']))
            <tr><th>Montant</th><td>{{ number_format((float) $summary['base_amount'], 2, ',', ' ') }} {{ $summary['currency_code'] ?? 'MAD' }}</td></tr>
        @endif
    </table>

    <h2>Signataire</h2>
    <table>
        <tr><th>Nom</th><td>{{ $signerName }}</td></tr>
        <tr><th>Date / heure</th><td>{{ $signedAt->format('d/m/Y H:i:s') }} (UTC{{ $signedAt->format('P') }})</td></tr>
        <tr><th>Adresse IP</th><td class="mono">{{ $ip ?? '—' }}</td></tr>
        <tr><th>Navigateur</th><td class="mono">{{ \Illuminate\Support\Str::limit($userAgent ?? '—', 180) }}</td></tr>
        <tr><th>Jeton (réf.)</th><td class="mono">{{ $token }}</td></tr>
    </table>

    <h2>Signature manuscrite</h2>
    <div class="sigbox">
        <img src="{{ $signatureDataUri }}" alt="signature">
    </div>

    <div class="footer">
        Preuve de signature électronique — DriveFlow · généré le {{ now()->format('d/m/Y H:i') }}
    </div>
</body>
</html>
