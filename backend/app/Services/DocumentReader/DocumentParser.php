<?php

namespace App\Services\DocumentReader;

use App\Models\ReaderDocument;

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

        $fields = match ($type) {
            ReaderDocument::TYPE_CIN => $this->parseCin($normalized),
            ReaderDocument::TYPE_PASSPORT => $this->parsePassport($normalized),
            ReaderDocument::TYPE_DRIVING_LICENSE => $this->parseDrivingLicense($normalized),
            ReaderDocument::TYPE_VEHICLE_REGISTRATION => $this->parseCarteGrise($normalized),
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
        if (preg_match('/CARTE\s*GRISE|CERTIFICAT\s+D[\'’]?IMMATRICULATION|VEHICLE\s+REGISTRATION/u', $upper)) {
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
        if (preg_match('/CARTE\s+NATIONALE|CARTE\s+D[\'’]?IDENTIT|ROYAUME\s+DU\s+MAROC|CIN\b/u', $upper)) {
            return ReaderDocument::TYPE_CIN;
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
        $docNumber = $this->firstMatch('/\b([A-Z]{1,2}\d{4,8})\b/u', $text)
            ?? $this->labelValue($text, ['CIN', 'N°\s*CIN', 'N°', 'No', 'Numero', 'Card\s*No'], '[A-Z0-9]{4,15}');

        return [
            'first_name' => $names['first_name'] ?? null,
            'last_name' => $names['last_name'] ?? null,
            'full_name' => $names['full_name'] ?? null,
            'document_number' => $docNumber,
            'document_type' => 'cin',
            'date_of_birth' => $this->extractDate($text, ['Date\s+de\s+naissance', 'N[ée]\s+le', 'Date\s+of\s+birth']),
            'nationality' => $this->labelValue($text, ['Nationalit[ée]', 'Nationality'], '[A-Za-z\s\-]+')
                ?: ($this->containsAny($text, ['MAROC', 'MOROCCAN']) ? 'Marocaine' : null),
            'address' => $this->labelValue($text, ['Adresse', 'Address'], '.+'),
            'issue_date' => $this->extractDate($text, ['Date\s+de\s+d[ée]livrance', 'Issued', 'D[ée]livr[ée]\s+le']),
            'expiry_date' => $this->extractDate($text, ['Valable\s+jusqu', 'Date\s+d[\'’]expiration', 'Expiry', 'Expir']),
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
            'date_of_birth' => $this->extractDate($text, ['Date\s+of\s+birth', 'Date\s+de\s+naissance', 'Birth']),
            'nationality' => $mrz['nationality'] ?? $this->labelValue($text, ['Nationality', 'Nationalit[ée]'], '[A-Za-z\s]+'),
            'address' => null,
            'issue_date' => $this->extractDate($text, ['Date\s+of\s+issue', 'Date\s+de\s+d[ée]livrance']),
            'expiry_date' => $this->extractDate($text, ['Date\s+of\s+expiry', 'Date\s+d[\'’]expiration', 'Expiry']),
        ];
    }

    /** @return array<string, mixed> */
    private function parseDrivingLicense(string $text): array
    {
        $names = $this->extractNames($text);
        $licenseNumber = $this->labelValue($text, ['N°\s*Permis', 'N°', 'License\s*No', 'No'], '[A-Z0-9\-/]{4,20}')
            ?? $this->firstMatch('/\b(\d{2,3}[-\/]\d{4,8})\b/u', $text);

        $categories = $this->extractCategories($text);

        return [
            'license_number' => $licenseNumber,
            'full_name' => $names['full_name'] ?? null,
            'date_of_birth' => $this->extractDate($text, ['Date\s+de\s+naissance', 'N[ée]\s+le', 'Date\s+of\s+birth']),
            'categories' => $categories,
            'issue_date' => $this->extractDate($text, ['Date\s+de\s+d[ée]livrance', 'Issued', 'D[ée]livr[ée]\s+le']),
            'expiry_date' => $this->extractDate($text, ['Valable\s+jusqu', 'Expiry', 'Expir']),
        ];
    }

    /** @return array<string, mixed> */
    private function parseCarteGrise(string $text): array
    {
        return [
            'registration_number' => $this->labelValue($text, ['Immatriculation', 'N°\s*d[\'’]?immatriculation', 'Registration'], '[A-Z0-9\-\s]{4,20}')
                ?? $this->firstMatch('/\b(\d{1,6}\s*[-|]\s*[A-Z]{1,3}\s*[-|]\s*\d{1,3})\b/u', $text),
            'vin_number' => $this->firstMatch('/\b([A-HJ-NPR-Z0-9]{17})\b/u', $text)
                ?? $this->labelValue($text, ['VIN', 'Ch[aâ]ssis', 'N°\s*ch[aâ]ssis'], '[A-Z0-9]{6,20}'),
            'brand' => $this->labelValue($text, ['Marque', 'Make', 'Brand'], '[A-Za-z\-]+'),
            'model' => $this->labelValue($text, ['Mod[èe]le', 'Model', 'Type'], '[A-Za-z0-9\-\s]+'),
            'fuel_type' => $this->labelValue($text, ['Carburant', 'Energie', 'Fuel'], '[A-Za-z]+'),
            'first_registration_date' => $this->extractDate($text, [
                'Date\s+de\s+1[èe]?re?\s+mise\s+en\s+circulation',
                'Premi[èe]re\s+mise\s+en\s+circulation',
                'First\s+registration',
            ]),
            'owner_name' => $this->labelValue($text, ['Propri[ée]taire', 'Nom\s+du\s+propri[ée]taire', 'Owner'], '.+'),
        ];
    }

    // ---------------------------------------------------------------------
    // Helpers
    // ---------------------------------------------------------------------

    private function normalize(string $text): string
    {
        // Collapse exotic whitespace, normalize line endings, drop control chars.
        $text = str_replace(["\r\n", "\r"], "\n", $text);
        $text = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', ' ', $text) ?? $text;

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
     * @param  list<string>  $labels  Regex-safe labels (without anchoring).
     */
    private function labelValue(string $text, array $labels, string $valuePattern): ?string
    {
        foreach ($labels as $label) {
            $pattern = '/'.$label.'\s*[:\-]?\s*(?P<v>'.$valuePattern.')/iu';
            if (preg_match($pattern, $text, $m)) {
                $value = trim($m['v']);
                // Trim trailing words that look like another label
                $value = preg_replace('/\s{2,}.*$/u', '', $value) ?? $value;

                return $value !== '' ? $value : null;
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $labels
     */
    private function extractDate(string $text, array $labels): ?string
    {
        $pattern = '(?P<d>\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2})';
        foreach ($labels as $label) {
            if (preg_match('/'.$label.'\s*[:\-]?\s*'.$pattern.'/iu', $text, $m)) {
                return $this->canonicalizeDate($m['d']);
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
            return sprintf('%04d-%02d-%02d', (int) $parts[2], (int) $parts[1], (int) $parts[0]);
        }
        if (strlen($parts[0]) === 4) {
            return sprintf('%04d-%02d-%02d', (int) $parts[0], (int) $parts[1], (int) $parts[2]);
        }
        if (strlen($parts[2]) === 2) {
            $year = (int) $parts[2];
            $year += $year < 50 ? 2000 : 1900;

            return sprintf('%04d-%02d-%02d', $year, (int) $parts[1], (int) $parts[0]);
        }

        return null;
    }

    /** @return array{first_name?: string, last_name?: string, full_name?: string} */
    private function extractNames(string $text): array
    {
        $out = [];
        if (preg_match('/(?:Nom|Surname|Last\s*Name)\s*[:\-]?\s*(?P<v>[A-ZÉÈÊÀÂÎÔÛÇ\'\-\s]{2,})/u', $text, $m)) {
            $out['last_name'] = $this->cleanName($m['v']);
        }
        if (preg_match('/(?:Pr[ée]nom|Given\s*Names?|First\s*Name)\s*[:\-]?\s*(?P<v>[A-ZÉÈÊÀÂÎÔÛÇ\'\-\s]{2,})/u', $text, $m)) {
            $out['first_name'] = $this->cleanName($m['v']);
        }
        if (isset($out['first_name']) || isset($out['last_name'])) {
            $out['full_name'] = trim(($out['first_name'] ?? '').' '.($out['last_name'] ?? ''));
        }

        return $out;
    }

    private function cleanName(string $value): string
    {
        $value = preg_replace('/\s{2,}.*$/u', '', $value) ?? $value;

        return trim(preg_replace('/[^A-ZÉÈÊÀÂÎÔÛÇ\'\-\s]/u', '', mb_strtoupper($value)) ?? $value);
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
