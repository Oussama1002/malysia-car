<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Document' }}</title>
    <style>
        @page { margin: 28mm 18mm 22mm 18mm; }
        * { box-sizing: border-box; }
        body { font-family: DejaVu Sans, sans-serif; color: #1f2937; font-size: 11px; line-height: 1.45; }
        h1, h2, h3 { color: #111827; margin: 0 0 6px 0; }
        h1 { font-size: 20px; }
        h2 { font-size: 14px; margin-top: 14px; }
        .header { border-bottom: 2px solid #4f46e5; padding-bottom: 10px; margin-bottom: 14px; }
        .header .brand { font-size: 18px; font-weight: 800; color: #4f46e5; }
        .header .meta { float: right; text-align: right; font-size: 10px; color: #6b7280; }
        .row { display: block; width: 100%; }
        .col { display: inline-block; vertical-align: top; }
        table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        th, td { padding: 6px 8px; border-bottom: 1px solid #e5e7eb; text-align: left; }
        th { background: #f3f4f6; font-weight: 700; color: #374151; }
        .totals td { border-bottom: none; padding: 4px 8px; }
        .totals .grand { font-weight: 800; font-size: 13px; border-top: 2px solid #111827; }
        .footer { position: fixed; bottom: -10mm; left: 0; right: 0; text-align: center; color: #9ca3af; font-size: 9px; }
        .badge { display: inline-block; padding: 2px 8px; background: #eef2ff; color: #4338ca; border-radius: 4px; font-size: 10px; font-weight: 700; }
        .muted { color: #6b7280; }
    </style>
</head>
<body>
    <div class="header">
        <div class="meta">
            <div>{{ $documentRef ?? '' }}</div>
            <div>{{ now()->format('d/m/Y H:i') }}</div>
        </div>
        <div class="brand">{{ $brandName ?? 'DriveFlow' }}</div>
        <div class="muted">{{ $brandTagline ?? 'Gestion location & financement automobile' }}</div>
    </div>

    @yield('content')

    <div class="footer">
        Document généré électroniquement — {{ $sha256Short ?? '' }}
    </div>
</body>
</html>
