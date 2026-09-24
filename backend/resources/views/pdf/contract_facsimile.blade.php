{{--
    Contrat de location — fac-similé pour impression sur papier blanc.

    Même placement des valeurs que la version overlay, mais avec le formulaire
    vierge scanné en fond : le PDF se suffit à lui-même.
--}}
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Contrat de location' }}</title>
    <style>
        @page { margin: 0; }
        body { margin: 0; font-family: DejaVu Sans, sans-serif; color: #000; }
        .v { position: absolute; white-space: nowrap; }
        .form-bg { position: absolute; left: 0; top: 0; width: 210mm; height: 297mm; }
        .grid-line { position: absolute; background: #e3342f; opacity: .35; }
        .grid-label { position: absolute; font-size: 5px; color: #e3342f; }
    </style>
</head>
<body>
{{-- Le formulaire vierge scanné, pour une impression sur papier blanc. --}}
<img class="form-bg" src="{{ resource_path('images/contract-form.jpg') }}" alt="">
@php
    $conf = config('contract_form');
    $dx = (float) ($conf['offset_x'] ?? 0);
    $dy = (float) ($conf['offset_y'] ?? 0);
    $baseSize = (float) ($conf['font_size'] ?? 8.5);

    $put = function (string $key, $value) use ($conf, $dx, $dy, $baseSize) {
        $spot = $conf['fields'][$key] ?? null;
        if (! $spot || $value === null || $value === '' || $value === '—') {
            return '';
        }
        $size = $spot['size'] ?? $baseSize;
        $weight = ! empty($spot['bold']) ? 'font-weight:bold;' : '';

        return sprintf(
            '<div class="v" style="left:%.2fmm; top:%.2fmm; font-size:%.1fpx; %s">%s</div>',
            $spot['x'] + $dx,
            $spot['y'] + $dy,
            $size * 1.333, // pt → px, dompdf raisonne en px
            $weight,
            e((string) $value),
        );
    };
@endphp

@if (request()->boolean('grid'))
    {{-- Grille de calibrage : un trait par centimètre. --}}
    @for ($i = 1; $i < 21; $i++)
        <div class="grid-line" style="left: {{ $i * 10 }}mm; top: 0; width: .2mm; height: 297mm;"></div>
        <div class="grid-label" style="left: {{ $i * 10 + 0.5 }}mm; top: 1mm;">{{ $i }}</div>
    @endfor
    @for ($i = 1; $i < 30; $i++)
        <div class="grid-line" style="left: 0; top: {{ $i * 10 }}mm; height: .2mm; width: 210mm;"></div>
        <div class="grid-label" style="left: 1mm; top: {{ $i * 10 + 0.5 }}mm;">{{ $i }}</div>
    @endfor
@endif

{!! $put('contract_number', $f['contract_number']) !!}

{!! $put('customer_first_name', $f['customer_first_name']) !!}
{!! $put('customer_last_name', $f['customer_last_name']) !!}
{!! $put('customer_birth_date', $f['customer_birth_date']) !!}
{!! $put('customer_birth_place', $f['customer_birth_place']) !!}
{!! $put('customer_cin', $f['customer_cin']) !!}
{!! $put('customer_passport', $f['customer_passport']) !!}
{!! $put('customer_license', $f['customer_license']) !!}
{!! $put('customer_address', $f['customer_address']) !!}
{!! $put('customer_phone', $f['customer_phone']) !!}
{!! $put('customer_mobile', $f['customer_mobile']) !!}

{!! $put('driver_first_name', $f['driver_first_name']) !!}
{!! $put('driver_last_name', $f['driver_last_name']) !!}
{!! $put('driver_birth_date', $f['driver_birth_date']) !!}
{!! $put('driver_cin', $f['driver_cin']) !!}
{!! $put('driver_passport', $f['driver_passport']) !!}
{!! $put('driver_license', $f['driver_license']) !!}
{!! $put('driver_address', $f['driver_address']) !!}
{!! $put('driver_phone', $f['driver_phone']) !!}

{!! $put('vehicle_brand', $f['vehicle_brand']) !!}
{!! $put('vehicle_plate', $f['vehicle_plate']) !!}
{!! $put('start_date', $f['start_date']) !!}
{!! $put('start_time', $f['start_time']) !!}
{!! $put('end_date', $f['end_date']) !!}
{!! $put('end_time', $f['end_time']) !!}
{!! $put('delivered_at', $f['delivered_at']) !!}
{!! $put('returned_at', $f['returned_at']) !!}
{!! $put('fuel', $f['fuel']) !!}
{!! $put('odometer', $f['odometer']) !!}
{!! $put('days', $f['days']) !!}
{!! $put('insurance', $f['insurance']) !!}
{!! $put('unit_price', $f['unit_price']) !!}
{!! $put('total_ttc', $f['total_ttc']) !!}
{!! $put('payment_method', $f['payment_method']) !!}
{!! $put('file_ref', $f['file_ref']) !!}

{!! $put('departure_fuel', $f['departure_fuel']) !!}
{!! $put('departure_km', $f['departure_km']) !!}
{!! $put('return_fuel', $f['return_fuel']) !!}
{!! $put('return_km', $f['return_km']) !!}

@foreach ($f['papers'] as $paper => $ok)
    {!! $put('papers_'.$paper.'_'.($ok ? 'yes' : 'no'), 'X') !!}
@endforeach
</body>
</html>
