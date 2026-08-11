<?php

namespace App\Services\DocumentReader;

use App\Models\ReaderDocument;
use Illuminate\Support\Facades\Log;

/**
 * Regex / heuristic parser for the 5 document types supported in the MVP.
 *
 * The parser is intentionally permissive — OCR output for ID papers is noisy
 * (accents, dotted letters, line breaks). All fields are nullable. The admin
 * always reviews and edits the result before it is persisted as
 * `validated_data`.
 */
class DocumentParser
{
    /**
     * @return array{type: string, fields: array<string, mixed>, hints: array<string, mixed>}
     */
    public function parse(string $rawText, ?string $hintedType = null): array
    {
        $normalized = $this->normalize($rawText);
        $type = $hintedType && in_array($hintedType, ReaderDocument::TYPES, true)
            ? $hintedType
            : $this->detectType($normalized);

        Log::info('DocumentParser.parse', ['type' => $type, 'hinted' => $hintedType, 'text_length' => mb_strlen($normalized), 'text_full' => $normalized]);

        $fields = match ($type) {
            ReaderDocument::TYPE_CIN => $this->parseCin($normalized),
            ReaderDocument::TYPE_PASSPORT => $this->parsePassport($normalized),
            ReaderDocument::TYPE_DRIVING_LICENSE => $this->parseDrivingLicense($normalized),
            ReaderDocument::TYPE_VEHICLE_REGISTRATION => $this->parseCarteGrise($normalized),
            ReaderDocument::TYPE_CHEQUE => $this->parseCheque($normalized),
            ReaderDocument::TYPE_INSURANCE => $this->parseInsurance($normalized),
            ReaderDocument::TYPE_PAYMENT_ATTESTATION => $this->parsePaymentAttestation($normalized),
            default => [],
        };

        return [
            'type' => $type,
            'fields' => $fields,
            'hints' => [
                'lines' => substr_count($normalized, "\n") + 1,
                'chars' => mb_strlen($normalized),
            ],
        ];
    }

    public function detectType(string $text): string
    {
        $upper = mb_strtoupper($text);

        // Carte grise / vehicle registration
        if (preg_match('/CARTE\s*GRISE|CERTIFICAT\s+D\'?IMMATRICULATION|VEHICLE\s+REGISTRATION/u', $upper)) {
            return ReaderDocument::TYPE_VEHICLE_REGISTRATION;
        }
        // Driving license
        if (preg_match('/PERMIS\s+DE\s+CONDUIRE|DRIVING\s+LIC[EÉ]NCE|DRIVER\s+LICENSE/u', $upper)) {
            return ReaderDocument::TYPE_DRIVING_LICENSE;
        }
        // Passport
        if (preg_match('/PASSPORT|PASSEPORT|REPUBLIQUE.*MAROC.*PASS/u', $upper)) {
            return ReaderDocument::TYPE_PASSPORT;
        }
        // Moroccan CIN
        if (preg_match('/CARTE\s+NATIONALE|CARTE\s+D\'?IDENTIT|ROYAUME\s+DU\s+MAROC|CIN\b/u', $upper)) {
            return ReaderDocument::TYPE_CIN;
        }
        // Payment attestation (vignette / taxe spéciale)
        if (preg_match('/ATTESTATION\s+DE\s+PAI[EÉ]MENT|TAXE\s+SP[ÉE]CIALE\s+ANNUELLE|QUITTANCE\s+DE\s+VIGNETTE|TAXE\s+SUR\s+LES\s+V[ÉE]HICULES|PUISSANCE\s+FISCALE.*CARBURANT|CARBURANT.*PUISSANCE\s+FISCALE/u', $upper)) {
            return ReaderDocument::TYPE_PAYMENT_ATTESTATION;
        }
        // Insurance / assurance
        if (preg_match('/ASSURANCE|INSURANCE|POLICE\s+D\'?ASSURANCE|N°?\s*POLICE|ATTESTATION\s+D\'?ASSURANCE|COMPAGNIE\s+D\'?ASSURANCE|P[ÉE]RIODE\s+DE\s+GARANTIE/u', $upper)) {
            return ReaderDocument::TYPE_INSURANCE;
        }
        // Cheque / bank check
        if (preg_match('/CH[ÈE]QUE|CHEQUE|PAYEZ\s+CONTRE|ORDER\s+OF|PAY\s+TO\s+THE|BANQUE|BANK.*CHECK/u', $upper)) {
            return ReaderDocument::TYPE_CHEQUE;
        }
        // Rental contract
        if (preg_match('/CONTRAT\s+DE\s+LOCATION|RENTAL\s+AGREEMENT|CONTRAT\s+LOCATION/u', $upper)) {
            return ReaderDocument::TYPE_RENTAL_CONTRACT;
        }

        return ReaderDocument::TYPE_OTHER;
    }

    /** @return array<string, mixed> */
    private function parseCin(string $text): array
    {
        $names = $this->extractNames($text);
        // Moroccan CIN 2008/2020 doesn't print "Nom"/"Prénom" in French — names
        // are bare tokens. Fall back to heuristic if label extraction missed them.
        if (! isset($names['first_name']) || ! isset($names['last_name'])) {
            $heuristic = $this->extractNamesHeuristic($text);
            $names = array_filter(array_merge($heuristic, $names), fn ($v) => $v !== null && $v !== '');
            if (isset($names['first_name']) || isset($names['last_name'])) {
                $names['full_name'] = trim(($names['first_name'] ?? '').' '.($names['last_name'] ?? ''));
            }
        }

        // Moroccan CIN format: 1–2 uppercase letters + 5–7 digits (e.g., BV819234).
        // Pick the LONGEST candidate to defeat Tesseract truncation (often
        // drops trailing digits → "BV819" instead of "BV819234"). Always
        // require the letter prefix — pure digit runs are dates / état-civil
        // numbers, never the CIN itself.
        $docNumber = $this->longestMatch('/\b[A-Z]{1,2}\d{5,8}\b/u', $text)
            ?? $this->longestMatch('/\b[A-Z]{1,2}\d{3,8}\b/u', $text)
            ?? $this->labelValue($text, ['CIN', 'N°\s*CIN', 'Card\s*No'], '[A-Z]{1,2}\d{3,8}');

        // Date strategy: try label first, then classify any standalone date
        // by year (birth = before today-16y, expiry = after today).
        $birthDate = $this->extractDate($text, [
            'Date\s+de\s+naissance',
            'N[ée]\(?e\)?\s+le',
            'N[ée]e?\s+le',
            'Nee\s+le',
            'Date\s+of\s+birth',
            'Born\s+on',
        ]);
        $expiryDate = $this->extractDate($text, ['Valable\s+jusqu', 'Date\s+d\'expiration', 'Expiry', 'Expir']);
        $classified = $this->classifyDatesByYear($text);
        $birthDate = $birthDate ?? $classified['birth'];
        $expiryDate = $expiryDate ?? $classified['expiry'];

        return [
            'first_name' => $names['first_name'] ?? null,
            'last_name' => $names['last_name'] ?? null,
            'full_name' => $names['full_name'] ?? null,
            'document_number' => $docNumber,
            'document_type' => 'cin',
            'date_of_birth' => $birthDate,
            'nationality' => $this->labelValue($text, ['Nationalit[ée]', 'Nationality'], '[A-Za-z\s\-]+')
                ?: ($this->containsAny($text, ['MAROC', 'MOROCCAN']) ? 'Maroc' : null),
            'address' => $this->labelValue($text, ['Adresse', 'Address'], '.+'),
            'issue_date' => $this->extractDate($text, ['Date\s+de\s+d[ée]livrance', 'Issued', 'D[ée]livr[ée]\s+le'])
                ?? $classified['issue'],
            'expiry_date' => $expiryDate,
        ];
    }

    /** @return array<string, mixed> */
    private function parsePassport(string $text): array
    {
        $names = $this->extractNames($text);
        $mrz = $this->extractMrz($text);
        $docNumber = $mrz['document_number']
            ?? $this->firstMatch('/\b([A-Z]{1,2}\d{6,9})\b/u', $text);

        return [
            'first_name' => $names['first_name'] ?? $mrz['given_names'] ?? null,
            'last_name' => $names['last_name'] ?? $mrz['surname'] ?? null,
            'full_name' => $names['full_name']
                ?? trim(($mrz['given_names'] ?? '').' '.($mrz['surname'] ?? '')) ?: null,
            'document_number' => $docNumber,
            'document_type' => 'passport',
            'date_of_birth' => $this->extractDate($text, [
                'Date\s+of\s+birth',
                'Date\s+de\s+naissance',
                'N[ée]\(?e\)?\s+le',
                'Birth',
            ]),
            'nationality' => $mrz['nationality'] ?? $this->labelValue($text, ['Nationality', 'Nationalit[ée]'], '[A-Za-z\s]+'),
            'address' => null,
            'issue_date' => $this->extractDate($text, ['Date\s+of\s+issue', 'Date\s+de\s+d[ée]livrance']),
            'expiry_date' => $this->extractDate($text, ['Date\s+of\s+expiry', 'Date\s+d\'expiration', 'Expiry']),
        ];
    }

    /** @return array<string, mixed> */
    private function parseDrivingLicense(string $text): array
    {
        $names = $this->extractNames($text);
        // Fallback to the heuristic when the license has no French labels —
        // Moroccan permis 2010+ has Latin labels but the OCR sometimes drops
        // them.
        if (! isset($names['first_name']) || ! isset($names['last_name'])) {
            $heuristic = $this->extractNamesHeuristic($text);
            $names = array_filter(array_merge($heuristic, $names), fn ($v) => $v !== null && $v !== '');
            if (isset($names['first_name']) || isset($names['last_name'])) {
                $names['full_name'] = trim(($names['first_name'] ?? '').' '.($names['last_name'] ?? ''));
            }
        }

        // EU/ICAO layout uses numbered fields: "5." = license number, "4a."/"4b."
        // = issue/expiry dates, "9." = categories. Match those alongside the
        // French labels.
        $licenseNumber = $this->labelValue($text, [
            'N°\s*Permis',
            'N°\s*de\s*Permis',
            'License\s*No',
            'Driver\s*License\s*No',
            '5\s*\.',
        ], '[A-Z0-9\-\/]{4,20}')
            ?? $this->firstMatch('/\b(\d{2,3}[-\/]\d{4,8})\b/u', $text)
            ?? $this->longestMatch('/\b[A-Z]{0,2}\d{6,10}\b/u', $text);

        $categories = $this->extractCategories($text);

        // Date classifier handles licenses that bury labels under OCR noise.
        $classified = $this->classifyDatesByYear($text);
        $birth = $this->extractDate($text, [
            'Date\s+de\s+naissance',
            'Date\s+et\s*/?\s*Lieu\s+de\s+naissance', // Moroccan permis bilingual label
            'N[ée]\(?e\)?\s+le',
            'Date\s+of\s+birth',
            'naissance',                               // fallback: just the key word
            '3\s*\.',
        ]) ?? $classified['birth'];
        $issue = $this->extractDate($text, [
            'Date\s+de\s+d[ée]livrance',
            'Issued',
            'D[ée]livr[ée]\s+le',
            '4a\s*\.',
        ]) ?? $classified['issue'];
        $expiry = $this->extractDate($text, [
            'Fin\s+de\s+validit[ée]',   // Moroccan permis verso label
            'Validit[ée]',
            'Valable\s+jusqu',
            'Expiry',
            'Expir',
            '4b\s*\.',
        ]) ?? $classified['expiry'];

        // Birth-year sanity vs issue date. Driving age in Morocco is 18 — at
        // minimum 16 with provisional categories — so a birth year less than
        // 16 years before the issue year is physically impossible. When that
        // happens Tesseract has almost certainly misread a single digit (the
        // observed case: "2001" → "2007", with the trailing 1 read as 7).
        // Try a bounded digit-swap repair across known OCR confusions and only
        // accept it when EXACTLY ONE swap yields a plausible year.
        if ($birth && $issue) {
            $repaired = $this->repairImplausibleBirthYear($birth, $issue);
            if ($repaired !== null) {
                $birth = $repaired;
            }
        }

        // The verso MRZ (e.g. "D1LMA51<285342270820ELHADI<<<1") is printed in a
        // high-contrast OCR font on a clean background — far more reliable than
        // the watermarked, bilingual front side. Prefer its surname unless the
        // front-side label already produced the same name (which keeps nicer
        // spacing, e.g. "EL HADI" vs MRZ "ELHADI").
        $mrzSurname = $this->extractMrzSurname($text);
        if ($mrzSurname) {
            $labelLast = $names['last_name'] ?? null;
            $labelMatchesMrz = $labelLast
                && mb_strtoupper(preg_replace('/\s+/', '', $labelLast) ?? '') === $mrzSurname;
            if (! $labelMatchesMrz) {
                $names['last_name'] = $this->cleanName($mrzSurname);
            }
            if (isset($names['first_name']) || isset($names['last_name'])) {
                $names['full_name'] = trim(($names['first_name'] ?? '').' '.($names['last_name'] ?? ''));
            }
        }

        // Moroccan Permis prints the CIN under the "N°C.N.I.E." block (and
        // again in the MRZ at the bottom). Pull both as a fallback for the
        // customer scanner.
        $cin = $this->valueAfterLabel($text, '(?:N°\s*C\.?N\.?I\.?E?\.?|C\.?N\.?I\.?E?\.?)', 4);
        if ($cin) {
            $cin = preg_replace('/\s+/', '', $cin) ?? $cin;
            if (! preg_match('/^[A-Z]{1,2}\d{3,8}$/u', $cin)) {
                $cin = null;
            }
        }
        $cin = $cin
            ?? $this->longestMatch('/\b[A-Z]{1,2}\d{5,8}\b/u', $text)
            ?? $this->longestMatch('/\b[A-Z]{1,2}\d{3,8}\b/u', $text);

        return [
            'license_number' => $licenseNumber,
            'first_name' => $names['first_name'] ?? null,
            'last_name' => $names['last_name'] ?? null,
            'full_name' => $names['full_name'] ?? null,
            'national_id_number' => $cin,
            'date_of_birth' => $birth,
            'categories' => $categories,
            'issue_date' => $issue,
            'expiry_date' => $expiry,
        ];
    }

    /** @return array<string, mixed> */
    private function parseCarteGrise(string $text): array
    {
        $upper = mb_strtoupper($text);

        // --- Brand: match known brands in text (labelValue too greedy on noisy OCR) ---
        $brand = null;
        $knownBrands = [
            'RENAULT', 'DACIA', 'PEUGEOT', 'CITROEN', 'CITROËN', 'FIAT',
            'VOLKSWAGEN', 'HYUNDAI', 'KIA', 'TOYOTA', 'NISSAN', 'FORD',
            'OPEL', 'BMW', 'MERCEDES', 'AUDI', 'SEAT', 'SKODA', 'SUZUKI',
            'MITSUBISHI', 'HONDA', 'CHEVROLET', 'MG', 'BYD', 'CUPRA',
            'JEEP', 'LAND ROVER', 'RANGE ROVER', 'VOLVO', 'MAZDA',
            'MINI', 'PORSCHE', 'ALFA ROMEO', 'JAGUAR', 'ISUZU',
            'SSANGYONG', 'CHERY', 'GEELY', 'HAVAL', 'GREAT WALL',
            'DFSK', 'CHANGAN', 'JAC', 'FOTON', 'IVECO', 'MAN',
        ];
        foreach ($knownBrands as $b) {
            if (str_contains($upper, $b)) {
                $brand = mb_convert_case(mb_strtolower($b), MB_CASE_TITLE, 'UTF-8');
                break;
            }
        }

        // --- Model: search near "Mod[èe]le" label on same line ---
        $model = null;
        if (preg_match('/Mod[èeé]le\s+(\S+)/iu', $text, $mm)) {
            $candidate = trim($mm[1]);
            if (mb_strlen($candidate) >= 2 && preg_match('/[A-Za-z]/u', $candidate)) {
                $model = mb_convert_case(mb_strtolower($candidate), MB_CASE_TITLE, 'UTF-8');
            }
        }

        // --- Fuel type: match known types in text near carburant label ---
        $fuelType = null;
        $fuelKeywords = [
            'ESSENCE' => 'Essence', 'EESANCE' => 'Essence', 'ESSANCE' => 'Essence',
            'GASOIL' => 'Diesel', 'DIESEL' => 'Diesel', 'GAZOLE' => 'Diesel',
            'HYBRIDE' => 'Hybride', 'ELECTRIQUE' => 'Électrique', 'GPL' => 'GPL',
        ];
        foreach ($fuelKeywords as $key => $val) {
            if (str_contains($upper, $key)) {
                $fuelType = $val;
                break;
            }
        }

        // --- Fiscal power: search near "fiscale" with OCR variants ---
        $fiscalPower = $this->labelValue($text, [
            'Puissance\s+fiscale',
            'P[a-zéèô]*\s+fiscale',
            'P\.?\s*F\.?',
        ], '\d{1,3}');

        // --- Nombre de places ---
        $nbPlaces = $this->labelValue($text, [
            'Nombre\s+de\s+places',
            'Nb\.?\s*(?:de\s+)?places',
        ], '\d{1,2}');

        // --- Genre: include OCR variants (Gente, Ganre, ...) ---
        $genre = $this->labelValue($text, [
            'Gen[rt]e',
            'Genre',
            'Usage',
        ], '[A-Za-zÀ-ÖØ-öø-ÿ\s\-]+');

        // --- Expiry date: fuzzy "fin de validité" with OCR noise ---
        $expiryDate = $this->extractDate($text, [
            '[FfIi]in?\s+de\s+va[lh][io]dit[ée]',
            'Fin\s+de\s+validit[ée]',
            'Validit[ée]',
            'va[lh]dit[ée]',
        ]);

        // --- Mise en circulation: fuzzy OCR patterns ---
        $miseEnCirc = $this->extractDate($text, [
            'mi[st]e\s+en\s+[a-z]*irculation',
            'Mise\s+en\s+circulation',
            'Premi[èe]re\s+mi[st]e\s+en',
            'M\.?\s*C\.?\s*(?:au\s+)?Mar',
        ]);

        // --- VIN / chassis ---
        $vin = $this->firstMatch('/\b([A-HJ-NPR-Z0-9]{17})\b/u', $text)
            ?? $this->labelValue($text, ['VIN', '[Cc]h[aâ]ssis', 'N°?\s*(?:du\s+)?[Cc]h[aâ]ssis'], '[A-Z0-9]{6,20}');

        $result = [
            'registration_number' => $this->labelValue($text, ['Immatriculation', 'N°?\s*d\'?immatriculation'], '[A-Z0-9\-\s]{4,20}')
                ?? $this->firstMatch('/\b(\d{1,6}\s*[-|]\s*[A-Z]{1,3}\s*[-|]\s*\d{1,3})\b/u', $text),
            'vin_number' => $vin,
            'brand' => $brand,
            'model' => $model,
            'fuel_type' => $fuelType,
            'fiscal_power' => $fiscalPower ? (int) $fiscalPower : null,
            'nb_places' => $nbPlaces ? (int) $nbPlaces : null,
            'genre' => $genre ? trim($genre) : null,
            'first_registration_date' => $miseEnCirc,
            'expiry_date' => $expiryDate,
            'owner_name' => $this->labelValue($text, ['Propri[ée]taire', 'Nom\s+du\s+propri[ée]taire', 'Owner'], '.+'),
        ];
        Log::info('DocumentParser.parseCarteGrise', $result);
        return $result;
    }

    /** @return array<string, mixed> */
    private function parseCheque(string $text): array
    {
        $upper = mb_strtoupper($text);

        // Check number — usually 7-digit number printed at the bottom (MICR line)
        // or labelled "N° du chèque", "Chèque N°", etc.
        $checkNumber = $this->labelValue($text, [
            'N°\s*(?:du\s*)?ch[èe]que',
            'Ch[èe]que\s*N°',
            'Check\s*No',
            'Cheque\s*No',
        ], '\d{5,10}')
            ?? $this->firstMatch('/\b(\d{7})\b/u', $text);

        // Bank name — look for known Moroccan banks or a "Banque" label
        $bank = $this->labelValue($text, [
            'Banque',
            'Bank',
            'Établissement',
        ], '[A-Za-zÀ-ÖØ-öø-ÿ\s\-\']+');
        if (! $bank) {
            // Try to detect known Moroccan bank names
            $moroccanBanks = [
                'ATTIJARIWAFA', 'AWB', 'BMCE', 'BANK OF AFRICA', 'BOA',
                'BANQUE POPULAIRE', 'BP', 'BMCI', 'SOCIETE GENERALE',
                'SGMB', 'CIH', 'CIH BANK', 'CREDIT DU MAROC', 'CDM',
                'CREDIT AGRICOLE', 'CAM', 'AL BARID BANK', 'CFG BANK',
                'BANK AL MAGHRIB', 'BAM', 'ARAB BANK', 'CITIBANK',
                'UMNIA BANK', 'AL AKHDAR BANK', 'BTI BANK',
            ];
            foreach ($moroccanBanks as $bk) {
                if (str_contains($upper, $bk)) {
                    $bank = $bk;
                    break;
                }
            }
        }

        // Amount — look for numeric amount with decimals (Moroccan cheques show amount in digits)
        $amount = null;
        // Try labelled amount first
        $amountStr = $this->labelValue($text, [
            'Montant',
            'Amount',
            'Somme\s+de',
            'MAD',
            'DH',
        ], '[\d\s\.,]+');
        if ($amountStr) {
            $amount = $this->parseAmount($amountStr);
        }
        // Fallback: find a large number with decimals (likely the amount)
        if (! $amount && preg_match_all('/(\d{1,3}(?:[\s\.,]\d{3})*(?:[,\.]\d{2}))\b/u', $text, $am)) {
            foreach ($am[1] as $candidate) {
                $parsed = $this->parseAmount($candidate);
                if ($parsed && $parsed > 100) { // Cheques are usually > 100 MAD
                    $amount = $parsed;
                    break;
                }
            }
        }

        // Date — cheques have a date (usually DD/MM/YYYY)
        $checkDate = $this->extractDate($text, [
            'Fait\s+[àa].*le',
            'Date',
            'Le',
            'Casablanca\s*,?\s*le',
            'Rabat\s*,?\s*le',
        ]);
        // Fallback: any date in the text
        if (! $checkDate) {
            $classified = $this->classifyDatesByYear($text);
            $checkDate = $classified['issue'] ?? $classified['expiry'];
        }

        return [
            'check_number' => $checkNumber,
            'bank' => $bank ? mb_convert_case(mb_strtolower($bank), MB_CASE_TITLE, 'UTF-8') : null,
            'amount' => $amount,
            'check_date' => $checkDate,
        ];
    }

    /** @return array<string, mixed> */
    private function parseInsurance(string $text): array
    {
        $upper = mb_strtoupper($text);

        // Moroccan insurance policy numbers look like AU112024026094T1 or
        // FL112023C-153426 (2 letters + digits + optional letter/dash suffix).
        // Try that format first, then fall back to label-based extraction.
        $policyNumber = $this->firstMatch('/\b([A-Z]{2}\d[A-Z0-9\-]{9,28})\b/u', $text)
            ?? $this->labelValue($text, [
                'N°?\s*(?:de\s+)?Police',
                'Police\s*N°?',
                'Policy\s*N[o°]',
                'Contract\s*N[o°]',
                'N°?\s*Contrat',
            ], '[A-Z]{2}[A-Z0-9\-]{6,30}');
        if ($policyNumber && ! preg_match('/\d/', $policyNumber)) {
            $policyNumber = null;
        }

        // Insurance company
        $company = $this->labelValue($text, [
            'Compagnie',
            'Assureur',
            'Soci[ée]t[ée]\s+d\'?assurance',
            'Insurance\s+Company',
            'Insurer',
        ], '[A-Za-zÀ-ÖØ-öø-ÿ\s\-\'\.]+');
        if (! $company) {
            $moroccanInsurers = [
                'WAFA ASSURANCE', 'SAHAM', 'ATLANTA', 'AXA', 'RMA',
                'MAMDA', 'MCMA', 'ZURICH', 'ALLIANZ', 'SANAD',
                'LA MAROCAINE VIE', 'MAROC ASSISTANCE', 'SANLAM',
                'CAT', 'CNIA', 'MATU', 'MUTUELLE', 'ISAAF',
            ];
            foreach ($moroccanInsurers as $ins) {
                if (str_contains($upper, $ins)) {
                    $company = $ins;
                    break;
                }
            }
        }

        // Guarantee period: "Période de garantie du DD/MM/YYYY au DD/MM/YYYY"
        // or "du ... à ..." / "du ... au ..."
        $guaranteeStart = null;
        $guaranteeEnd = null;

        $datePattern = '(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})';
        // "du DD/MM/YYYY au DD/MM/YYYY" or "du DD/MM/YYYY à DD/MM/YYYY"
        if (preg_match('/(?:p[ée]riode|garantie|validit[ée]|effet|couverture)[^\n]*?du\s*'.$datePattern.'\s*(?:au|[àa])\s*'.$datePattern.'/iu', $text, $m)) {
            $guaranteeStart = $this->canonicalizeDate($m[1]);
            $guaranteeEnd = $this->canonicalizeDate($m[2]);
        }
        // Fallback: "du DD/MM/YYYY au DD/MM/YYYY" anywhere
        if (! $guaranteeStart && preg_match('/du\s*'.$datePattern.'\s*(?:au|[àa])\s*'.$datePattern.'/iu', $text, $m)) {
            $guaranteeStart = $this->canonicalizeDate($m[1]);
            $guaranteeEnd = $this->canonicalizeDate($m[2]);
        }
        // Fallback: labeled start/end dates
        if (! $guaranteeStart) {
            $guaranteeStart = $this->extractDate($text, [
                'Date\s+d\'?effet',
                'Date\s+de\s+d[ée]but',
                'Effet\s+du',
                'Start\s+date',
                'D[ée]but',
            ]);
        }
        if (! $guaranteeEnd) {
            $guaranteeEnd = $this->extractDate($text, [
                'Date\s+d\'?[ée]ch[ée]ance',
                'Date\s+d\'?expiration',
                'Date\s+de\s+fin',
                'Expir',
                'Fin\s+de\s+garantie',
                'Ech[ée]ance',
                'End\s+date',
                'Valable\s+jusqu',
            ]);
        }
        // Fallback: parse the PERIODE DE GARANTIE table with French month
        // names. Moroccan attestations use a Jour|Mois|Année table where
        // months are French words (Janvier, Décembre, …) that Tesseract
        // often garbles — we match common OCR variants too.
        if (! $guaranteeStart || ! $guaranteeEnd) {
            $periode = $this->extractPeriodeDeGarantie($text);
            $guaranteeStart = $guaranteeStart ?? $periode['start'];
            $guaranteeEnd = $guaranteeEnd ?? $periode['end'];
        }
        // Last resort: only use classified future dates as guarantee end.
        if (! $guaranteeEnd) {
            $classified = $this->classifyDatesByYear($text);
            $guaranteeEnd = $classified['expiry'];
        }

        // Registration / Immatriculation — try WW provisional plate first (most
        // reliable on noisy OCR), then Moroccan plate format, then label-based.
        $registration = $this->firstMatch('/[~\s]?(WW[\s\-]?\d{3,8}[\s\-]?[A-Z]?)\b/iu', $text)
            ?? $this->firstMatch('/\b(\d{1,6}\s*[-|]\s*[A-Z]{1,3}\s*[-|]\s*\d{1,3})\b/u', $text)
            ?? $this->labelValue($text, [
                'Immatriculation',
                'N°?\s*d\'?immatriculation',
                'V[ée]hicule\s+immatricul[ée]',
                'Immat',
            ], '[A-Z0-9]{2,}[\-\s\/]?[A-Z0-9]{2,}[\-\s\/]?[A-Z0-9]*');

        $result = [
            'policy_number'    => $policyNumber ? trim($policyNumber) : null,
            'insurance_company' => $company ? mb_convert_case(mb_strtolower(trim($company)), MB_CASE_TITLE, 'UTF-8') : null,
            'guarantee_start'  => $guaranteeStart,
            'guarantee_end'    => $guaranteeEnd,
            'expiry_date'      => $guaranteeEnd,
            'registration_number' => $registration ? trim($registration) : null,
        ];
        Log::info('DocumentParser.parseInsurance', $result);
        return $result;
    }

    /** @return array<string, mixed> */
    private function parsePaymentAttestation(string $text): array
    {
        // Registration: Moroccan plates look like "90948 - T - 6" but OCR
        // often splits the last digit onto the next line. Search a 200-char
        // window after the "immatriculation" label, collapsing whitespace
        // (including newlines) to reassemble the plate.
        $registration = null;
        if (preg_match('/(?:immatriculation|N°?\s*d\'?immatriculation|Immat\.?)/iu', $text, $lm, PREG_OFFSET_CAPTURE)) {
            $window = substr($text, $lm[0][1], 200);
            $flat = preg_replace('/[\r\n\t]+/', ' ', $window) ?? $window;
            if (preg_match('/(\d{1,6})\s*[-–—|]\s*([A-Z]{1,3})\s*[-–—|]\s*(\d{1,3})/iu', $flat, $pm)) {
                $registration = $pm[1] . '-' . mb_strtoupper($pm[2]) . '-' . $pm[3];
            }
        }
        if (! $registration) {
            $registration = $this->firstMatch('/(\d{1,6})\s*[-–—|]\s*([A-Z]{1,3})\s*[-–—|]\s*(\d{1,3})/iu', $text);
            if ($registration && preg_match('/(\d{1,6})\s*[-–—|]\s*([A-Z]{1,3})\s*[-–—|]\s*(\d{1,3})/iu', $text, $pm)) {
                $registration = $pm[1] . '-' . mb_strtoupper($pm[2]) . '-' . $pm[3];
            }
        }
        if (! $registration) {
            $registration = $this->firstMatch('/\b(WW[\s\-]?\d{3,6}[\s\-]?[A-Z]?)\b/iu', $text);
        }

        // Fuel type: "Carburant", "Type de carburant", "Energie"
        $fuelType = $this->labelValue($text, [
            'Type\s+de\s+carburant',
            'Carburant',
            '[ÉE]nergie',
            'Fuel\s+type',
        ], '[A-Za-zÀ-ÖØ-öø-ÿ\s\-]+');
        if ($fuelType) {
            $fuelUpper = mb_strtoupper(trim($fuelType));
            $fuelMap = [
                'GASOIL' => 'Diesel', 'DIESEL' => 'Diesel', 'GO' => 'Diesel',
                'ESSENCE' => 'Essence', 'SUPER' => 'Essence', 'SP' => 'Essence',
                'HYBRIDE' => 'Hybride', 'ELECTRIQUE' => 'Électrique', 'GPL' => 'GPL',
            ];
            foreach ($fuelMap as $key => $val) {
                if (str_contains($fuelUpper, $key)) {
                    $fuelType = $val;
                    break;
                }
            }
        }

        // Mise en circulation: "Mise en circulation", "Date 1ère mise en circulation"
        $miseEnCirculation = $this->extractDate($text, [
            'Mise\s+en\s+circulation',
            'Date\s+(?:de\s+)?(?:1[èe]?re?\s+)?mise\s+en\s+circulation',
            'Premi[èe]re\s+mise\s+en\s+circulation',
            '1[èe]?re?\s+circulation',
            'First\s+registration',
        ]);

        // Puissance fiscale: "Puissance fiscale", "CV fiscaux", "P.F."
        $fiscalPower = $this->labelValue($text, [
            'Puissance\s+fiscale',
            'P\.?\s*F\.?',
            'CV\s+fiscaux',
            'Fiscal\s+power',
            'Chevaux\s+fiscaux',
        ], '\d{1,3}');
        if (! $fiscalPower) {
            // Try to find "X CV" pattern near fiscal/puissance context
            if (preg_match('/(?:puissance|fiscale?|P\.?\s*F\.?)[^\n]*?(\d{1,3})\s*(?:CV|ch)/iu', $text, $m)) {
                $fiscalPower = $m[1];
            }
        }

        $result = [
            'registration_number'    => $registration ? trim($registration) : null,
            'fuel_type'              => $fuelType ? trim($fuelType) : null,
            'first_registration_date' => $miseEnCirculation,
            'fiscal_power'           => $fiscalPower ? (int) $fiscalPower : null,
        ];
        Log::info('DocumentParser.parsePaymentAttestation', $result);
        return $result;
    }

    /**
     * Parse the PERIODE DE GARANTIE table found on Moroccan insurance attestations.
     * The table has columns Jour | Mois (French name) | Année, with DU (start)
     * and AU (end) rows. OCR often garbles month names and years, so we match
     * common variants and infer missing years from the issuance date.
     *
     * @return array{start: ?string, end: ?string}
     */
    private function extractPeriodeDeGarantie(string $text): array
    {
        $result = ['start' => null, 'end' => null];

        if (! preg_match('/PERIODE/iu', $text, $pm, PREG_OFFSET_CAPTURE)) {
            return $result;
        }

        $after = mb_substr($text, $pm[0][1]);
        $chunk = mb_substr($after, 0, 600);

        $frenchMonths = [
            'janvier' => 1, 'janv' => 1,
            'f[ée]vrier' => 2, 'fevrier' => 2,
            'mars' => 3,
            'avril' => 4,
            'mai' => 5,
            'juin' => 6,
            'juillet' => 7, 'juil' => 7,
            'ao[uû]t' => 8, 'aout' => 8,
            'septembre' => 9, 'sept' => 9,
            'octobre' => 10,
            'novembre' => 11,
            'd[ée][cv]embre' => 12, 'decembre' => 12, 'd[ée]vembre' => 12,
        ];

        $monthPositions = [];
        $seenNums = [];
        foreach ($frenchMonths as $pattern => $num) {
            if (in_array($num, $seenNums, true)) {
                continue;
            }
            if (preg_match('/'.$pattern.'/iu', $chunk, $mm, PREG_OFFSET_CAPTURE)) {
                $monthPositions[] = ['month' => $num, 'pos' => $mm[0][1]];
                $seenNums[] = $num;
            }
        }
        usort($monthPositions, fn ($a, $b) => $a['pos'] <=> $b['pos']);

        if (empty($monthPositions)) {
            return $result;
        }

        $contextYear = null;
        $contextMonth = null;
        if (preg_match('/\b(\d{1,2})[\/\-.]\s*(\d{1,2})[\/\-.]\s*(20[12]\d)\b/', $text, $ym)) {
            $contextYear = (int) $ym[3];
            $contextMonth = (int) $ym[2];
        }

        $allDays = [];
        if (preg_match_all('/\b(\d{1,2})\b/', $chunk, $dm, PREG_OFFSET_CAPTURE)) {
            foreach ($dm[1] as $pair) {
                $di = (int) $pair[0];
                if ($di >= 1 && $di <= 31) {
                    $allDays[] = ['day' => $di, 'pos' => (int) $pair[1]];
                }
            }
        }

        $findDayOnSameLine = function (int $monthPos) use ($chunk, $allDays): ?int {
            $lineStart = (int) strrpos(substr($chunk, 0, $monthPos), "\n");
            $lineEnd = strpos($chunk, "\n", $monthPos) ?: mb_strlen($chunk);
            $best = null;
            foreach ($allDays as $dd) {
                if ($dd['pos'] >= $lineStart && $dd['pos'] < $lineEnd && $dd['pos'] < $monthPos) {
                    $best = $dd['day'];
                }
            }
            return $best;
        };

        $year = $contextYear ?? (int) date('Y');

        if (count($monthPositions) >= 2) {
            $startMonth = $monthPositions[0]['month'];
            $endMonth = $monthPositions[1]['month'];
            $startDay = $findDayOnSameLine($monthPositions[0]['pos']) ?? 1;
            $endDay = $findDayOnSameLine($monthPositions[1]['pos'])
                ?? (int) date('t', mktime(0, 0, 0, $endMonth, 1, $year));
            $result['start'] = sprintf('%04d-%02d-%02d', $year, $startMonth, $startDay);
            $result['end'] = sprintf('%04d-%02d-%02d', $year, $endMonth, $endDay);
        } else {
            $foundMonth = $monthPositions[0]['month'];
            $endDay = $findDayOnSameLine($monthPositions[0]['pos'])
                ?? (int) date('t', mktime(0, 0, 0, $foundMonth, 1, $year));
            $result['end'] = sprintf('%04d-%02d-%02d', $year, $foundMonth, $endDay);

            $monthLineStart = (int) strrpos(mb_substr($chunk, 0, $monthPositions[0]['pos']), "\n");
            $startDay = null;
            foreach ($allDays as $dd) {
                if ($dd['pos'] < $monthLineStart) {
                    $startDay = $dd['day'];
                    break;
                }
            }
            if ($startDay && $contextMonth) {
                $result['start'] = sprintf('%04d-%02d-%02d', $year, $contextMonth, $startDay);
            }
        }

        return $result;
    }

    private function parseAmount(string $raw): ?float
    {
        // Normalize: "1 234 567,89" or "1.234.567,89" or "1,234,567.89"
        $raw = trim($raw);
        // If last separator is comma with 2 digits after → European format
        if (preg_match('/,(\d{2})$/', $raw)) {
            $raw = str_replace([' ', '.'], '', $raw);
            $raw = str_replace(',', '.', $raw);
        } else {
            $raw = str_replace([' ', ','], '', $raw);
        }
        $val = (float) $raw;
        return $val > 0 ? round($val, 2) : null;
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private function normalize(string $text): string
    {
        // Collapse exotic whitespace, normalize line endings, drop control chars.
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', ' ', $text) ?? $text;
        // Strip Unicode invisible/directional formatting characters that OCR
        // embeds when the source document has bidirectional (Arabic + Latin) text.
        // LRM, RLM, zero-width spaces, directional overrides, BOM, etc. disrupt
        // every regex that relies on word boundaries or start-of-line anchors.
        $text = preg_replace('/[\x{200B}-\x{200F}\x{202A}-\x{202E}\x{2060}-\x{2064}\x{FEFF}]/u', '', $text) ?? $text;
        // Tesseract sometimes inserts a stray space INSIDE a date component
        // ("06/1 0/2001"). Collapse 1-2 spaces only when the gap sits between a
        // digit and another digit that's IMMEDIATELY followed by a date
        // separator — i.e. we're plausibly inside a broken date, not between
        // two unrelated numbers separated by wide whitespace. The earlier
        // looser rule was gluing OCR noise like "Fe a ه77       06/10/2001"
        // into "Fe a ه7706/10/2001", which then caused the date regex to
        // greedy-match the bogus "7706/10/20" prefix and miss the real date.
        $text = preg_replace('/(?<=\d)[ \t]{1,2}(?=\d[\/\-.])/u', '', $text) ?? $text;

        return trim($text);
    }

    private function firstMatch(string $pattern, string $text): ?string
    {
        if (preg_match($pattern, $text, $m)) {
            return trim($m[1]);
        }

        return null;
    }

    /**
     * Return the LONGEST match for the given pattern, or null. Useful for IDs
     * that Tesseract may truncate (`BV819` vs `BV819234`): if both shapes appear
     * in the OCR output, we want the longer one.
     */
    private function longestMatch(string $pattern, string $text): ?string
    {
        if (! preg_match_all($pattern, $text, $matches)) {
            return null;
        }
        $best = '';
        foreach ($matches[0] as $candidate) {
            if (strlen($candidate) > strlen($best)) {
                $best = $candidate;
            }
        }

        return $best !== '' ? $best : null;
    }

    /**
     * @param  list<string>  $labels  Regex-safe labels (without anchoring).
     *
     * Tolerant matcher: accepts the value on the SAME line OR the next non-empty
     * line. Moroccan CINs typically print "Nom / لقب" then the value on the
     * line below; this matches that layout. The label is also allowed to be
     * followed by a slash + Arabic gloss (`Nom / لقب`, `Né(e) le /…`).
     */
    private function labelValue(string $text, array $labels, string $valuePattern): ?string
    {
        foreach ($labels as $label) {
            // Same-line match, allowing an optional "/ <arabic/other>" tail
            // between label and the colon/value.
            $sameLine = '/'.$label.'[^\n\r:]*[:\-]?[ \t]*(?P<v>'.$valuePattern.')/iu';
            if (preg_match($sameLine, $text, $m) && $this->cleanLabelValue($m['v']) !== '') {
                return $this->cleanLabelValue($m['v']);
            }

            // Next-line match: label on one line, value on the following non-empty line.
            $nextLine = '/'.$label.'[^\n\r]*[\r\n]+\s*(?P<v>'.$valuePattern.')/iu';
            if (preg_match($nextLine, $text, $m) && $this->cleanLabelValue($m['v']) !== '') {
                return $this->cleanLabelValue($m['v']);
            }
        }

        return null;
    }

    private function cleanLabelValue(string $value): string
    {
        $value = trim($value);
        // Drop trailing run of 2+ spaces and anything after — usually the next label.
        $value = preg_replace('/\s{2,}.*$/u', '', $value) ?? $value;

        return trim($value);
    }

    /**
     * @param  list<string>  $labels
     */
    private function extractDate(string $text, array $labels): ?string
    {
        // YMD year restricted to 19xx-21xx so OCR noise like "7706" (Tesseract
        // glued the spurious "77" onto a real date) can't satisfy the YMD slot
        // and starve the real DMY date that follows.
        $datePattern = '(?P<d>\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|(?:19|20|21)\d{2}[\/\-.]\d{1,2}[\/\-.]\d{1,2})';
        // Use `#` as the delimiter (not `/`) so a label containing a literal
        // slash — e.g. "Date et / Lieu de naissance" on the Moroccan permis —
        // can't terminate the regex early and trigger
        // "preg_match(): Unknown modifier '?'". Labels never contain `#`.
        foreach ($labels as $label) {
            // Same line
            if (preg_match('#'.$label.'[^\n\r:]*[:\-]?[ \t]*'.$datePattern.'#iu', $text, $m)) {
                return $this->canonicalizeDate($m['d']);
            }
            // Next line (label-only, value on the next non-empty line)
            if (preg_match('#'.$label.'[^\n\r]*[\r\n]+\s*'.$datePattern.'#iu', $text, $m)) {
                return $this->canonicalizeDate($m['d']);
            }
            // Up to 3 lines below: handles cases where OCR fractures the row
            // ("Né le … <garbage line> <garbage line> 06.10.2001").
            if (preg_match('#'.$label.'[\s\S]{0,200}?'.$datePattern.'#iu', $text, $m)) {
                $candidate = $this->canonicalizeDate($m['d']);
                if ($candidate && (int) substr($candidate, 0, 4) <= (int) date('Y')) {
                    return $candidate;
                }
            }
        }

        return null;
    }

    private function canonicalizeDate(string $raw): ?string
    {
        $raw = str_replace(['.', '/'], '-', $raw);
        $parts = explode('-', $raw);
        if (count($parts) !== 3) {
            return null;
        }
        // DMY → YMD
        if (strlen($parts[0]) <= 2 && strlen($parts[2]) === 4) {
            $iso = sprintf('%04d-%02d-%02d', (int) $parts[2], (int) $parts[1], (int) $parts[0]);
        } elseif (strlen($parts[0]) === 4) {
            $iso = sprintf('%04d-%02d-%02d', (int) $parts[0], (int) $parts[1], (int) $parts[2]);
        } elseif (strlen($parts[2]) === 2) {
            $year = (int) $parts[2];
            $year += $year < 50 ? 2000 : 1900;
            $iso = sprintf('%04d-%02d-%02d', $year, (int) $parts[1], (int) $parts[0]);
        } else {
            return null;
        }

        [$yyyy, $mm, $dd] = explode('-', $iso);
        $mi = (int) $mm;
        $di = (int) $dd;

        // Salvage a common Tesseract digit confusion on Moroccan permis: the
        // month's leading "1" read as "4", e.g. real 10/11/12 → 40/41/42
        // ("06/10/2001" came through as "06/40/2001"). No valid month is 40-42,
        // so mapping 4x→1x is unambiguous and safe.
        if ($mi >= 40 && $mi <= 42) {
            $mi -= 30;
            $mm = sprintf('%02d', $mi);
            $iso = $yyyy.'-'.$mm.'-'.$dd;
        }

        // Reject dates with impossible month or day values rather than emit a
        // date an HTML date input would silently drop.
        if ($mi < 1 || $mi > 12 || $di < 1 || $di > 31) {
            return null;
        }

        return $iso;
    }

    /**
     * Returns a repaired birth date when the OCR'd birth year is implausibly
     * close to the issue year (driver too young), but exactly ONE common
     * digit-confusion swap (7↔1, 4↔1, 8↔3, 6↔5, 0↔8) on the year yields a
     * plausible year (≥16 years before the issue year). Single-candidate is
     * required to avoid guessing; if zero or multiple swaps work, returns null
     * and the original date stays untouched.
     */
    private function repairImplausibleBirthYear(string $birthIso, string $issueIso): ?string
    {
        $by = (int) substr($birthIso, 0, 4);
        $iy = (int) substr($issueIso, 0, 4);
        if ($iy - $by >= 16) {
            return null; // already plausible
        }

        // Bidirectional common Tesseract digit confusions on small print.
        $confusions = [
            '7' => ['1'], '1' => ['7'],
            '4' => ['1'], '8' => ['3', '0'],
            '6' => ['5', '0'], '5' => ['6'],
            '0' => ['8', '6'], '3' => ['8'],
        ];

        $year = substr($birthIso, 0, 4);
        $rest = substr($birthIso, 4); // "-mm-dd"
        $candidates = [];
        for ($i = 0; $i < 4; $i++) {
            $orig = $year[$i];
            foreach ($confusions[$orig] ?? [] as $sub) {
                $candYear = substr_replace($year, $sub, $i, 1);
                $cy = (int) $candYear;
                if ($cy >= 1900 && $iy - $cy >= 16 && $iy - $cy <= 90) {
                    $candidates[$candYear] = true;
                }
            }
        }
        if (count($candidates) !== 1) {
            return null;
        }

        return array_key_first($candidates).$rest;
    }

    /**
     * Pull the surname from a Moroccan permis verso MRZ line such as
     * "D1LMA51<285342270820ELHADI<<<1". The surname is the alphabetic run
     * immediately before the "<<" filler. Returns null when no MRZ line is
     * present (e.g. only the front side was scanned).
     */
    private function extractMrzSurname(string $text): ?string
    {
        foreach (preg_split('/[\r\n]+/', $text) ?: [] as $line) {
            $compact = preg_replace('/\s+/', '', $line) ?? '';
            // MRZ lines are long and composed only of A-Z, digits and '<',
            // and contain the "<<" name filler.
            if (mb_strlen($compact) < 18 || ! str_contains($compact, '<<')) {
                continue;
            }
            if (! preg_match('/^[A-Z0-9<]+$/', $compact)) {
                continue;
            }
            if (preg_match('/([A-Z]{2,})<<+/', $compact, $m)) {
                return $m[1];
            }
        }

        return null;
    }

    /** @return array{first_name?: string, last_name?: string, full_name?: string} */
    private function extractNames(string $text): array
    {
        $out = [];
        // valueAfterLabel runs FIRST: it skips OCR noise between the label and
        // the real value. labelValue is the fallback for single-line layouts.
        // labelValueName() (below) is used as a second fallback — unlike
        // labelValue it collapses multiple spaces instead of cutting at them,
        // so "EL  HADI" (OCR double-space) survives intact as "EL HADI".
        $last = $this->valueAfterLabel($text, '(?:\b2\s*[\.\-]?\s*Nom\b|\bNom\b|\bHom\b|\bSurname\b|\bLast\s*Name\b)')
            ?? $this->labelValueName($text, ['2\s*[\.\-]\s*Nom', 'Nom', 'Surname', 'Last\s*Name']);
        if ($last) {
            $out['last_name'] = $this->cleanName($last);
        }
        $first = $this->valueAfterLabel($text, '(?:\b1\s*[\.\-]?\s*Pr[ée]noms?\b|\bPr[ée]noms?\b|\bGiven\s*Names?\b|\bFirst\s*Name\b)')
            ?? $this->labelValueName($text, ['1\s*[\.\-]\s*Pr[ée]noms?', 'Pr[ée]noms?', 'Given\s*Names?', 'First\s*Name']);
        if ($first) {
            $out['first_name'] = $this->cleanName($first);
        }
        if (isset($out['first_name']) || isset($out['last_name'])) {
            $out['full_name'] = trim(($out['first_name'] ?? '').' '.($out['last_name'] ?? ''));
        }

        return $out;
    }

    /**
     * Like labelValue() but for name fields: collapses multiple spaces instead
     * of cutting at them, so "EL  HADI" (OCR double-space noise) → "EL HADI".
     *
     * @param  list<string>  $labels
     */
    private function labelValueName(string $text, array $labels): ?string
    {
        $nameValue = "[A-Za-zÀ-ÖØ-öø-ÿ'\\-]{2,}(?:[ \\t]+[A-Za-zÀ-ÖØ-öø-ÿ'\\-]{2,})*";
        foreach ($labels as $label) {
            $sameLine = '/'.$label.'[^\n\r:]*[:\-]?[ \t]*(?P<v>'.$nameValue.')/iu';
            if (preg_match($sameLine, $text, $m)) {
                $v = trim(preg_replace('/[ \t]{2,}/', ' ', $m['v']) ?? $m['v']);
                if ($v !== '') {
                    return $v;
                }
            }
            $nextLine = '/'.$label.'[^\n\r]*[\r\n]+[ \t]*(?P<v>'.$nameValue.')/iu';
            if (preg_match($nextLine, $text, $m)) {
                $v = trim(preg_replace('/[ \t]{2,}/', ' ', $m['v']) ?? $m['v']);
                if ($v !== '') {
                    return $v;
                }
            }
        }

        return null;
    }

    /**
     * Walk the lines AFTER a label and return the first one that "looks like"
     * a name value: contains uppercase Latin letters (possibly with EL/AL/BEN
     * style 2-letter prefixes joined by a space), no lowercase Latin, ≥4 letters
     * total. Stops after `maxLinesAfter` lines so we don't drift into the next
     * field on the card.
     */
    private function valueAfterLabel(string $text, string $labelPattern, int $maxLinesAfter = 6): ?string
    {
        // `#` delimiter (not `/`) so a label containing a literal slash can't
        // break the pattern — see extractDate() for the same defensive choice.
        if (! preg_match('#'.$labelPattern.'#iu', $text, $m, PREG_OFFSET_CAPTURE)) {
            return null;
        }
        $rest = substr($text, $m[0][1] + strlen($m[0][0]));
        $lines = preg_split('/[\r\n]+/', $rest) ?: [];

        // The value sits closest to its label. We score two candidate kinds and
        // let the CLOSEST win (tie → the cleaner one):
        //   - "clean"  : a line with no lowercase Latin (highest confidence)
        //   - "noisy"  : an uppercase island ≥5 chars buried in a junky line
        //                (e.g. "oi f= OSSAMA 7 |" on a watermarked Permis)
        // Closest-wins is what stops the first name drifting past the buried
        // "OSSAMA" line to a clean but unrelated line further down (e.g. the
        // birthplace "MEDIOUNA").
        $cleanValue = null;
        $cleanIdx = null;
        $noisyValue = null;
        $noisyIdx = null;
        $idx = 0;
        foreach ($lines as $line) {
            if ($idx > $maxLinesAfter) {
                break;
            }
            if (trim($line) === '') {
                $idx++;
                continue;
            }
            if (! preg_match('/[a-zà-öø-ÿ]/u', $line)) {
                if ($cleanValue === null && preg_match('/([A-ZÀ-Ö\'][A-ZÀ-Ö\s\'\-]{2,28}[A-ZÀ-Ö])/u', $line, $vm)) {
                    $value = trim(preg_replace('/\s{2,}/u', ' ', $vm[1]) ?? $vm[1]);
                    if (preg_match_all('/[A-ZÀ-Ö]/u', $value) >= 4) {
                        $cleanValue = $value;
                        $cleanIdx = $idx;
                    }
                }
            } elseif ($noisyValue === null) {
                if (preg_match_all('/[A-ZÀ-Ö]{2,}(?:\s[A-ZÀ-Ö]{2,})*/u', $line, $islands)) {
                    $best = '';
                    foreach ($islands[0] as $island) {
                        if (mb_strlen($island) > mb_strlen($best)) {
                            $best = $island;
                        }
                    }
                    $best = trim(preg_replace('/\s{2,}/u', ' ', $best) ?? $best);
                    if (preg_match_all('/[A-ZÀ-Ö]/u', $best) >= 5) {
                        $noisyValue = $best;
                        $noisyIdx = $idx;
                    }
                }
            }
            $idx++;
        }

        if ($cleanValue !== null && $noisyValue !== null) {
            // Closest wins; on a tie prefer the clean (higher-confidence) line.
            return $cleanIdx <= $noisyIdx ? $cleanValue : $noisyValue;
        }

        return $cleanValue ?? $noisyValue;
    }

    private function cleanName(string $value): string
    {
        $value = preg_replace('/\s{2,}.*$/u', '', $value) ?? $value;
        // Strip digits / punctuation, keep accented letters + dash + apostrophe + space.
        $value = preg_replace('/[^A-Za-zÀ-ÖØ-öø-ÿ\'\- ]/u', '', $value) ?? $value;

        return trim(mb_strtoupper($value));
    }

    /**
     * Heuristic fallback for cards without "Nom"/"Prénom" labels (Moroccan CIN
     * 2008/2020). Walks the lines top-to-bottom and picks the first two
     * isolated uppercase Latin tokens (4–15 chars) that aren't CIN boilerplate.
     * On Moroccan CINs the first name is printed above the last name, so:
     *   1st candidate → first_name
     *   2nd candidate → last_name
     *
     * @return array{first_name?: string, last_name?: string}
     */
    private function extractNamesHeuristic(string $text): array
    {
        $stopwords = [
            'ROYAUME', 'MAROC', 'CARTE', 'NATIONALE', 'IDENTITE', 'IDENTITÉ',
            'BUREAU', 'NATIONAL', 'KINGDOM', 'MOROCCO', 'REPUBLIQUE', 'REPUBLIC',
            'PASSEPORT', 'PASSPORT', 'PERMIS', 'CONDUIRE', 'LICENSE', 'LICENCE',
            'ETAT', 'CIVIL', 'SEXE', 'ADRESSE', 'ADDRESS', 'VALIDE', 'VALABLE',
            'JUSQU', 'EXPIRY', 'EXPIRE', 'BORN', 'DATE', 'NAISSANCE', 'BIRTH',
            'NATIONALITE', 'NATIONALITY', 'MAROCAINE', 'MAROCAIN', 'FRANCAISE',
            'FILS', 'FILLE', 'EPOUSE', 'CASABLANCA', 'RABAT', 'TANGER', 'FES',
            'AGADIR', 'MARRAKECH', 'OUJDA', 'MEKNES', 'KENITRA', 'TETOUAN',
            'MEDIOUNA', 'TISSIR', 'TAMESNA',
            'ABDELGHANI', 'ABDELLAH', 'AHMED', 'HASSAN', 'MOHAMMED', 'MOHAMED',
            'DRISS', 'HABIBA', 'OULAD',
            'SCANNED', 'WITH', 'CAMERA', 'PHOTO', 'POLICE',
            // Field labels — Tesseract sometimes picks these up as name tokens
            // when Arabic text flanks the label and strips adjacent whitespace.
            'PRENOM', 'PRÉNOM', 'PRENOMS', 'PRÉNOMS', 'SURNAME', 'SIGNÉ', 'SIGNE',
            'DELIVRE', 'DÉLIVRÉ', 'VALABLE', 'DELIVER',
            // Common Tesseract noise tokens seen on Moroccan CIN/Permis headers.
            'MERS', 'RENE', 'OTHE', 'GATAR', 'QATAR',
        ];
        $lines = preg_split('/[\r\n]+/', $text) ?: [];
        $candidates = [];
        foreach ($lines as $line) {
            // Strip non-Latin so Arabic glyphs don't count toward token density.
            $clean = preg_replace('/[^A-Za-zÀ-ÖØ-öø-ÿ\'\-\s]/u', ' ', $line) ?? '';
            $bigTokens = array_values(array_filter(
                preg_split('/\s+/', trim($clean)) ?: [],
                fn ($t) => mb_strlen($t) >= 5,
            ));
            // Require an isolated line: at most one other ≥4-char Latin word.
            $extras = array_values(array_filter(
                preg_split('/\s+/', trim($clean)) ?: [],
                fn ($t) => mb_strlen($t) >= 4,
            ));
            if (count($bigTokens) !== 1 || count($extras) > 2) {
                continue;
            }
            $token = mb_strtoupper($bigTokens[0]);
            if (! preg_match('/^[A-ZÀ-ÖØ-Þ][A-ZÀ-ÖØ-Þa-zà-öø-ÿ\'\-]{4,14}$/u', $token)) {
                continue;
            }
            if (in_array($token, $stopwords, true)) {
                continue;
            }
            if (! in_array($token, $candidates, true)) {
                $candidates[] = $token;
            }
            if (count($candidates) >= 2) {
                break;
            }
        }

        $out = [];
        if (isset($candidates[0])) {
            $out['first_name'] = $candidates[0];
        }
        if (isset($candidates[1])) {
            $out['last_name'] = $candidates[1];
        }

        return $out;
    }

    /**
     * Pull every DD.MM.YYYY-shape date out of the text and bucket them by year
     * vs today: future → expiry, past-by-≥16y → birth, in-between → issue.
     * Used as a fallback when label-based date extraction fails.
     *
     * @return array{birth: ?string, issue: ?string, expiry: ?string}
     */
    private function classifyDatesByYear(string $text): array
    {
        $out = ['birth' => null, 'issue' => null, 'expiry' => null];
        // No \b: when OCR glues stray digits onto a real date ("ه7706/10/2001")
        // the leading word boundary kills every potential match inside the run.
        // Same YMD year restriction as extractDate so noise like "7706" can't
        // hijack the YMD slot.
        if (! preg_match_all(
            '/(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|(?:19|20|21)\d{2}[\/\-.]\d{1,2}[\/\-.]\d{1,2})/u',
            $text,
            $matches,
        )) {
            return $out;
        }
        $now = (int) date('Y');
        foreach ($matches[1] as $raw) {
            $iso = $this->canonicalizeDate($raw);
            if (! $iso) {
                continue;
            }
            $year = (int) substr($iso, 0, 4);
            if ($year < 1900 || $year > $now + 40) {
                continue;
            }
            if ($year > $now && $out['expiry'] === null) {
                $out['expiry'] = $iso;
            } elseif ($year <= $now - 16 && $out['birth'] === null) {
                $out['birth'] = $iso;
            } elseif ($out['issue'] === null) {
                $out['issue'] = $iso;
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function extractCategories(string $text): array
    {
        if (! preg_match_all('/\b(A1|A2|A|B1|B|BE|C1|C|CE|D1|D|DE)\b/u', $text, $m)) {
            return [];
        }

        return array_values(array_unique($m[1]));
    }

    /**
     * Best-effort MRZ (machine readable zone) extraction. Most passports follow
     * ICAO 9303: 2 lines of 44 chars starting with P<. We only need a few fields.
     *
     * @return array{document_number?: string, surname?: string, given_names?: string, nationality?: string}
     */
    private function extractMrz(string $text): array
    {
        $lines = preg_split('/\n/', $text) ?: [];
        $out = [];
        foreach ($lines as $idx => $line) {
            $line = trim(str_replace(' ', '', $line));
            if (str_starts_with($line, 'P<') && strlen($line) >= 30) {
                $countryAndName = substr($line, 2);
                $parts = explode('<<', $countryAndName, 2);
                if (isset($parts[0]) && strlen($parts[0]) >= 3) {
                    $out['nationality'] = substr($parts[0], 0, 3);
                    $out['surname'] = str_replace('<', ' ', substr($parts[0], 3)) ?: null;
                }
                if (isset($parts[1])) {
                    $given = explode('<<', $parts[1])[0];
                    $out['given_names'] = trim(str_replace('<', ' ', $given)) ?: null;
                }
                // Next line usually carries the doc number in the first 9 chars.
                $next = isset($lines[$idx + 1]) ? trim(str_replace(' ', '', $lines[$idx + 1])) : '';
                if (strlen($next) >= 9) {
                    $candidate = substr($next, 0, 9);
                    $candidate = str_replace('<', '', $candidate);
                    if ($candidate !== '') {
                        $out['document_number'] = $candidate;
                    }
                }
                break;
            }
        }

        return $out;
    }

    /** @param list<string> $needles */
    private function containsAny(string $haystack, array $needles): bool
    {
        $upper = mb_strtoupper($haystack);
        foreach ($needles as $n) {
            if (str_contains($upper, $n)) {
                return true;
            }
        }

        return false;
    }
}
