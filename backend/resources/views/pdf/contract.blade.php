{{--
    Contrat de location — reprend la structure du formulaire papier de l'agence
    (Locataire, Deuxième conducteur, Information sur véhicule, Check-list,
    Contrôle papiers, tarifs pneus, signatures), pré-rempli avec les données du
    contrat. Page 2 : conditions générales.
--}}
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <title>{{ $title ?? 'Contrat de location' }}</title>
    <style>
        @page { margin: 10mm 8mm; }
        * { box-sizing: border-box; }
        body { font-family: DejaVu Sans, sans-serif; color: #111; font-size: 8.5px; line-height: 1.35; }
        table { width: 100%; border-collapse: collapse; }
        td { vertical-align: top; }

        .brand { background: #1a1a1a; color: #fff; padding: 6px 10px; text-align: center; }
        .brand .name { font-size: 13px; font-weight: bold; letter-spacing: 1px; }
        .brand .tag { font-size: 7px; color: #c9a227; letter-spacing: 2px; }
        .title { text-align: right; }
        .title .t { font-size: 15px; font-weight: bold; letter-spacing: 1px; }
        .title .n { font-size: 12px; font-weight: bold; }

        .block { border: 1px solid #000; margin-bottom: 4px; }
        .block h2 {
            margin: 0; padding: 2.5px 6px; font-size: 9px; text-align: center;
            border-bottom: 1px solid #000; background: #ededed; font-weight: bold;
        }
        .block .body { padding: 4px 6px; }

        .f { margin-bottom: 1.5px; }
        .f .k { display: inline; }
        .f .v { display: inline; font-weight: bold; border-bottom: 1px dotted #555; }

        .papers td { border: 1px solid #000; padding: 2px 4px; }
        .papers .h { background: #ededed; font-weight: bold; text-align: center; }
        .papers .c { text-align: center; width: 34px; font-weight: bold; }

        .car { border: 1px solid #000; height: 58px; text-align: center; padding-top: 2px; color: #999; font-size: 7px; }
        .gauge { font-size: 7.5px; }
        .km { border: 1px solid #000; padding: 2px 4px; font-weight: bold; }

        .tarifs { font-weight: bold; font-size: 9px; line-height: 1.7; }
        .warn { border: 1px solid #000; padding: 3px; text-align: center; font-weight: bold; font-size: 8.5px; }
        .mention { text-align: center; font-size: 7.5px; font-style: italic; padding: 2px 0; }

        .sign td { border: 1px solid #000; height: 46px; font-size: 7.5px; text-align: center; vertical-align: top; }
        .sign .h { background: #ededed; height: auto; font-weight: bold; padding: 2px; }

        .foot { text-align: center; font-size: 6.8px; line-height: 1.5; border-top: 1px solid #000; padding-top: 3px; margin-top: 4px; }

        .terms { font-size: 8px; line-height: 1.5; text-align: justify; }
        .terms h2 { font-size: 12px; text-align: center; margin: 0 0 8px 0; }
    </style>
</head>
<body>
@php
    $val = fn ($v) => ($v === null || $v === '' ) ? '—' : $v;
    $fmtDate = function ($v) {
        if (empty($v)) return '—';
        try { return \Carbon\Carbon::parse($v)->format('d/m/Y'); } catch (\Throwable) { return '—'; }
    };
    $fmtTime = function ($v) {
        if (empty($v)) return '—';
        try { return \Carbon\Carbon::parse($v)->format('H:i'); } catch (\Throwable) { return '—'; }
    };
    $money = fn ($v) => number_format((float) ($v ?? 0), 2, ',', ' ').' Dhs';

    $ind = $customer->individual_profile ?? $customer->individualProfile ?? null;
    $comp = $customer->company_profile ?? $customer->companyProfile ?? null;
    $address = optional($customer->addresses ?? collect())->first();
    $addressLine = $address
        ? trim(collect([$address->line1 ?? null, $address->line2 ?? null, $address->city ?? null])->filter()->implode(', '))
        : ($customer->address ?? null);

    $brand = $vehicle->brand_name ?? optional($vehicle->brand)->name ?? null;
    $model = $vehicle->model_name ?? optional($vehicle->model)->name ?? null;
    $brandModel = trim(($brand ?? '').' '.($model ?? '')) ?: null;

    $start = $reservation->desired_start_at ?? $contract->start_date ?? null;
    $end = $reservation->desired_end_at ?? $contract->end_date ?? null;
    $days = ($start && $end)
        ? max(1, \Carbon\Carbon::parse($start)->diffInDays(\Carbon\Carbon::parse($end)))
        : ($contract->duration_months ? (int) $contract->duration_months * 30 : null);

    $methodFr = [
        'cash' => 'Espèces', 'especes' => 'Espèces', 'check' => 'Chèque', 'cheque' => 'Chèque',
        'bank_transfer' => 'Virement', 'virement' => 'Virement', 'card' => 'Carte', 'carte' => 'Carte',
        'wallet' => 'Portefeuille', 'compensation' => 'Compensation',
    ][strtolower((string) ($contract->payment_method ?? ''))] ?? ($contract->payment_method ?? null);

    // Papiers du véhicule : Oui quand la pièce est présente et non expirée.
    $valid = function ($date) {
        if (empty($date)) return false;
        try { return \Carbon\Carbon::parse($date)->endOfDay()->gte(now()); } catch (\Throwable) { return false; }
    };
    $papers = [
        "L'Assurance" => $valid($vehicle->insurance_expiry ?? null),
        'La Carte Grise' => ! empty($vehicle->registration_card_number ?? null),
        'Autorisation de circulation' => ! empty($vehicle->circulation_permit ?? null) || ! empty($vehicle->registration_card_number ?? null),
        'Vignette' => $valid($vehicle->vignette_expiry ?? null),
        'La visite technique' => $valid($vehicle->tech_control_expiry ?? null),
    ];

    $fuelFr = function ($level) {
        if ($level === null || $level === '') return null;
        $n = (float) $level;
        return match (true) { $n <= 12 => '0', $n <= 37 => '1/4', $n <= 62 => '1/2', $n <= 87 => '3/4', default => '4/4' };
    };

    $s = is_array($settings ?? null) ? $settings : [];
@endphp

{{-- ── En-tête ─────────────────────────────────────────────────── --}}
<table style="margin-bottom:5px">
    <tr>
        <td style="width:38%">
            <div class="brand">
                <div class="name">{{ $s['trade_name'] ?? 'MALYSIA CAR PRO' }}</div>
                <div class="tag">LOCATION DE VOITURES</div>
            </div>
        </td>
        <td class="title">
            <div class="t">CONTRAT DE LOCATION</div>
            <div class="n">
                N° {{ $contract->contract_number ?? substr((string) $contract->id, 0, 8) }}
                / {{ \Carbon\Carbon::parse($contract->start_date ?? now())->format('Y') }}
            </div>
        </td>
    </tr>
</table>

{{-- ── Locataire / Véhicule ─────────────────────────────────────── --}}
<table>
    <tr>
        <td style="width:49%; padding-right:4px">
            <div class="block">
                <h2>LOCATAIRE</h2>
                <div class="body">
                    <div class="f"><span class="k">Prénom :</span> <span class="v">{{ $val($ind->first_name ?? null) }}</span></div>
                    <div class="f"><span class="k">Nom :</span> <span class="v">{{ $val($ind->last_name ?? ($comp->trade_name ?? $comp->legal_name ?? null)) }}</span></div>
                    <div class="f"><span class="k">Date de Naissance :</span> <span class="v">{{ $fmtDate($ind->date_of_birth ?? null) }}</span></div>
                    <div class="f"><span class="k">Lieu de Naissance :</span> <span class="v">{{ $val($ind->place_of_birth ?? null) }}</span></div>
                    <div class="f"><span class="k">CIN :</span> <span class="v">{{ $val($ind->national_id_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Passeport :</span> <span class="v">{{ $val($ind->passport_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Permis de conduite N° :</span> <span class="v">{{ $val($ind->driving_license_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Adresse :</span> <span class="v">{{ $val($addressLine) }}</span></div>
                    <div class="f"><span class="k">Tél. :</span> <span class="v">{{ $val($customer->phone ?? null) }}</span>
                        &nbsp;&nbsp;<span class="k">GSM :</span> <span class="v">{{ $val($customer->mobile ?? $customer->phone ?? null) }}</span></div>
                </div>
            </div>

            <div class="block">
                <h2>DEUXIEME CONDUCTEUR</h2>
                <div class="body">
                    <div class="f"><span class="k">Prénom :</span> <span class="v">{{ $val($secondDriver->first_name ?? null) }}</span></div>
                    <div class="f"><span class="k">Nom :</span> <span class="v">{{ $val($secondDriver->last_name ?? null) }}</span></div>
                    <div class="f"><span class="k">CIN / Passeport :</span> <span class="v">{{ $val($secondDriver->cin_passport ?? null) }}</span></div>
                    <div class="f"><span class="k">Permis de conduite N° :</span> <span class="v">{{ $val($secondDriver->license_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Tél. :</span> <span class="v">{{ $val($secondDriver->phone ?? null) }}</span></div>
                </div>
            </div>
        </td>

        <td style="width:51%">
            <div class="block">
                <h2>INFORMATION SUR VEHICULE</h2>
                <div class="body">
                    <div class="f"><span class="k">Marque :</span> <span class="v">{{ $val($brandModel) }}</span></div>
                    <div class="f"><span class="k">Immatriculation :</span> <span class="v">{{ $val($vehicle->registration_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Date de départ :</span> <span class="v">{{ $fmtDate($start) }}</span>
                        &nbsp;<span class="k">Heure :</span> <span class="v">{{ $fmtTime($start) }}</span></div>
                    <div class="f"><span class="k">Date de retour :</span> <span class="v">{{ $fmtDate($end) }}</span>
                        &nbsp;<span class="k">Heure :</span> <span class="v">{{ $fmtTime($end) }}</span></div>
                    <div class="f"><span class="k">Prolongation (1) :</span> <span class="v">&nbsp;</span></div>
                    <div class="f"><span class="k">Prolongation (2) :</span> <span class="v">&nbsp;</span></div>
                    <div class="f"><span class="k">Livrée à :</span> <span class="v">{{ $val($reservation->pickup_location ?? $reservation->pickup_address ?? null) }}</span></div>
                    <div class="f"><span class="k">Retour à :</span> <span class="v">{{ $val($reservation->return_location ?? null) }}</span></div>
                    <div class="f"><span class="k">Carburant :</span> <span class="v">{{ $val($vehicle->fuel_type ?? null) }}</span></div>
                    <div class="f"><span class="k">Km départ / Retour :</span> <span class="v">{{ $val($pickupReport->odometer ?? null) }} / {{ $val($returnReport->odometer ?? null) }}</span></div>
                    <div class="f"><span class="k">Nombre de jours :</span> <span class="v">{{ $val($days) }}</span></div>
                    <div class="f"><span class="k">Assurance :</span> <span class="v">{{ ($contract->insurance_included ?? false) ? 'Incluse' : '—' }}</span></div>
                    <div class="f"><span class="k">Frais de Livraison :</span> <span class="v">&nbsp;</span></div>
                    <div class="f"><span class="k">Prix Unitaire :</span> <span class="v">{{ $days ? $money(((float) ($contract->base_amount ?? 0)) / $days) : '—' }}</span></div>
                    <div class="f"><span class="k">Montant : T.T.C :</span> <span class="v">{{ $money($contract->base_amount ?? 0) }}</span></div>
                    <div class="f"><span class="k">Mode de Règlement :</span> <span class="v">{{ $val($methodFr) }}</span></div>
                    <div class="f"><span class="k">Réf Dossier :</span> <span class="v">{{ $val($reservation->reservation_number ?? null) }}</span></div>
                    <div class="f"><span class="k">Intermédiaire :</span> <span class="v">&nbsp;</span></div>
                </div>
            </div>
        </td>
    </tr>
</table>

{{-- ── Check-list / Contrôle papiers ────────────────────────────── --}}
<table>
    <tr>
        <td style="width:49%; padding-right:4px">
            <div class="block">
                <h2>CHECK LIST Etat du Véhicule</h2>
                <div class="body">
                    <div style="font-weight:bold; text-decoration:underline">ETAT DE DÉPART</div>
                    <table>
                        <tr>
                            <td style="width:58%"><div class="car">Schéma du véhicule — AVANT</div></td>
                            <td style="padding-left:4px">
                                <div class="gauge">CARBURANT : <b>{{ $fuelFr($pickupReport->fuel_level ?? null) ?? '0 · 1/4 · 1/2 · 3/4 · 4/4' }}</b></div>
                                <div class="km" style="margin-top:4px">{{ $val($pickupReport->odometer ?? null) }} Km</div>
                            </td>
                        </tr>
                    </table>

                    <div style="font-weight:bold; text-decoration:underline; margin-top:4px">ETAT DE RETOUR</div>
                    <table>
                        <tr>
                            <td style="width:58%"><div class="car">Schéma du véhicule — APRÈS</div></td>
                            <td style="padding-left:4px">
                                <div class="gauge">CARBURANT : <b>{{ $fuelFr($returnReport->fuel_level ?? null) ?? '0 · 1/4 · 1/2 · 3/4 · 4/4' }}</b></div>
                                <div class="km" style="margin-top:4px">{{ $val($returnReport->odometer ?? null) }} Km</div>
                            </td>
                        </tr>
                    </table>
                </div>
            </div>
        </td>

        <td style="width:51%">
            <div class="block">
                <h2>CONTROLE PAPIERS VEHICULE</h2>
                <div class="body">
                    <table class="papers">
                        <tr><td style="border:none"></td><td class="h c">Oui</td><td class="h c">Non</td></tr>
                        @foreach ($papers as $label => $ok)
                            <tr>
                                <td>{{ $label }}</td>
                                <td class="c">{{ $ok ? 'X' : '' }}</td>
                                <td class="c">{{ $ok ? '' : 'X' }}</td>
                            </tr>
                        @endforeach
                    </table>

                    <div class="tarifs" style="margin-top:6px">
                        <div>Pneu Petite Voiture 600,00 Dhs</div>
                        <div>Pneu Moyenne Voiture 1500,00 Dhs</div>
                        <div>Pneu Voiture 4*4 3000,00 Dhs Ou Plus</div>
                    </div>
                </div>
            </div>
        </td>
    </tr>
</table>

<div class="warn">
    Si le retour de la voiture dépasse 19h vous devez payer une pénalité de retard de 200 Dhs
</div>
<div class="mention">
    * Je reconnais avoir pris connaissance des conditions générales de location au verso du contrat et j'accepte de m'y conformer.
</div>

<table class="sign">
    <tr>
        <td class="h">Deuxième Conducteur</td>
        <td class="h">Signature du Locataire</td>
        <td class="h">Signature Agent</td>
        <td class="h">Restitution</td>
    </tr>
    <tr><td></td><td></td><td></td><td></td></tr>
</table>

<div class="foot">
    <div><b>S.A.R.L au Capitale de {{ $s['capital'] ?? '500 000,00' }} Dhs</b></div>
    <div>Siège Social : {{ $s['address'] ?? 'Rue Ahmed El Kadmiri Mg 3 Lot Akinaoui 2, Casablanca - Maroc' }}
        - Fixe : {{ $s['phone'] ?? '0522 99 48 45 / 05 20 01 18 88' }}</div>
    <div>E-mail : {{ $s['email'] ?? 'malysiacar@gmail.com' }} · Site Web : {{ $s['website'] ?? 'www.malysiacar.com' }}</div>
    <div>R.C : {{ $s['rc'] ?? '555871' }} · Patente : {{ $s['patente'] ?? '34703643' }}
        · IF : {{ $s['if'] ?? '52569429' }} · ICE : {{ $s['ice'] ?? '003058732000036' }}</div>
</div>

{{-- ── Page 2 : conditions générales ────────────────────────────── --}}
<div style="page-break-before: always"></div>
<div class="terms">
    @include('pdf.partials.contract_terms')
</div>
</body>
</html>
