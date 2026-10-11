<?php

/**
 * Position des valeurs sur le contrat papier pré-imprimé.
 *
 * Le PDF généré ne dessine rien : il ne contient que les valeurs, placées aux
 * coordonnées ci-dessous, pour être imprimé sur le formulaire vierge de
 * l'agence. Les coordonnées sont en millimètres depuis le coin haut-gauche de
 * la page A4, mesurées sur le scan du formulaire.
 *
 * Calibrage : imprimer une fois sur papier blanc, superposer au formulaire, et
 * corriger le décalage global avec CONTRACT_PDF_OFFSET_X / _Y (en mm, positif
 * vers la droite et vers le bas). Ajouter ?grid=1 à la génération affiche une
 * grille centimétrique pour mesurer.
 */
return [
    // Décalage global, imprimante par imprimante.
    'offset_x' => (float) env('CONTRACT_PDF_OFFSET_X', 0),
    'offset_y' => (float) env('CONTRACT_PDF_OFFSET_Y', 0),

    // Taille du texte imprimé dans les blancs du formulaire.
    'font_size' => (float) env('CONTRACT_PDF_FONT_SIZE', 8.5),

    /*
     * x = bord gauche de la valeur, y = ligne de base approximative.
     * Colonne gauche : locataire puis deuxième conducteur.
     * Colonne droite : informations véhicule.
     */
    'fields' => [
        // ── En-tête ──────────────────────────────────────────────
        'contract_number' => ['x' => 152, 'y' => 32, 'size' => 11, 'bold' => true],

        // ── Locataire ────────────────────────────────────────────
        'customer_first_name' => ['x' => 35, 'y' => 45.5],
        'customer_last_name' => ['x' => 30, 'y' => 50.5],
        'customer_birth_date' => ['x' => 45, 'y' => 55.5],
        'customer_birth_place' => ['x' => 45, 'y' => 60.5],
        'customer_cin' => ['x' => 30, 'y' => 65.5],
        'customer_passport' => ['x' => 38, 'y' => 70.5],
        'customer_license' => ['x' => 52, 'y' => 75.5],
        'customer_address' => ['x' => 36, 'y' => 80.5],
        'customer_phone' => ['x' => 27, 'y' => 89.5],
        'customer_mobile' => ['x' => 70, 'y' => 89.5],

        // ── Deuxième conducteur ──────────────────────────────────
        'driver_first_name' => ['x' => 35, 'y' => 102],
        'driver_last_name' => ['x' => 30, 'y' => 107],
        'driver_birth_date' => ['x' => 45, 'y' => 112],
        'driver_cin' => ['x' => 30, 'y' => 117],
        'driver_passport' => ['x' => 38, 'y' => 122],
        'driver_license' => ['x' => 52, 'y' => 127],
        'driver_address' => ['x' => 36, 'y' => 132],
        'driver_phone' => ['x' => 27, 'y' => 137],

        // ── Information sur véhicule ─────────────────────────────
        'vehicle_brand' => ['x' => 128, 'y' => 45.5],
        'vehicle_plate' => ['x' => 140, 'y' => 50.5],
        'start_date' => ['x' => 139, 'y' => 55.5],
        'start_time' => ['x' => 186, 'y' => 55.5],
        'end_date' => ['x' => 139, 'y' => 60.5],
        'end_time' => ['x' => 186, 'y' => 60.5],
        'extension_1' => ['x' => 140, 'y' => 65.5],
        'extension_2' => ['x' => 140, 'y' => 70.5],
        'delivered_at' => ['x' => 128, 'y' => 75.5],
        'returned_at' => ['x' => 128, 'y' => 80.5],
        'fuel' => ['x' => 128, 'y' => 85.5],
        'odometer' => ['x' => 148, 'y' => 90.5],
        'days' => ['x' => 143, 'y' => 95.5],
        'insurance' => ['x' => 131, 'y' => 100.5],
        'delivery_fee' => ['x' => 142, 'y' => 105.5],
        'unit_price' => ['x' => 134, 'y' => 110.5],
        'total_ttc' => ['x' => 139, 'y' => 115.5],
        'payment_method' => ['x' => 149, 'y' => 120.5],
        'file_ref' => ['x' => 132, 'y' => 125.5],
        'intermediary' => ['x' => 133, 'y' => 130.5],

        // ── Contrôle papiers : une croix dans Oui ou dans Non ─────
        'papers_insurance_yes' => ['x' => 181, 'y' => 160],
        'papers_insurance_no' => ['x' => 196, 'y' => 160],
        'papers_registration_yes' => ['x' => 181, 'y' => 167],
        'papers_registration_no' => ['x' => 196, 'y' => 167],
        'papers_circulation_yes' => ['x' => 181, 'y' => 174],
        'papers_circulation_no' => ['x' => 196, 'y' => 174],
        'papers_vignette_yes' => ['x' => 181, 'y' => 182],
        'papers_vignette_no' => ['x' => 196, 'y' => 182],
        'papers_inspection_yes' => ['x' => 181, 'y' => 189],
        'papers_inspection_no' => ['x' => 196, 'y' => 189],

        // ── Check-list état du véhicule ──────────────────────────
        'departure_fuel' => ['x' => 95, 'y' => 172],
        'departure_km' => ['x' => 95, 'y' => 184],
        'return_fuel' => ['x' => 95, 'y' => 219],
        'return_km' => ['x' => 95, 'y' => 231],
    ],
];
