<?php

namespace App\Console\Commands;

use App\Models\Vehicle;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Reprise du parc depuis l'export « Imprimer véhicules » de l'ancien système.
 * Le fichier porte l'extension .xls mais c'est un tableau HTML — on le lit tel
 * qu'il est, sans dépendance supplémentaire.
 *
 * La commande est rejouable : un véhicule est reconnu à son immatriculation.
 * Elle complète ce qui manque et ne touche jamais à ce qui a été saisi depuis.
 */
class ImportVehiclesCommand extends Command
{
    protected $signature = 'driveflow:import-vehicles
        {file : Chemin du fichier exporté (.xls/.html)}
        {--dry-run : Afficher ce qui serait fait, sans rien écrire}';

    protected $description = 'Importe les véhicules depuis un export du parc';

    /** Ce que le fichier appelle un carburant, et ce que DriveFlow en garde. */
    private const FUELS = [
        'GASOIL' => 'Diesel',
        'DIESEL' => 'Diesel',
        'ESSENCE' => 'Essence',
        'HYBRIDE' => 'Hybride',
        'ELECTRIQUE' => 'Électrique',
        'ÉLECTRIQUE' => 'Électrique',
    ];

    public function handle(): int
    {
        $path = (string) $this->argument('file');
        if (! is_file($path)) {
            $this->error("Fichier introuvable : {$path}");

            return self::FAILURE;
        }

        $rows = $this->parse(file_get_contents($path) ?: '');
        if ($rows === []) {
            $this->error("Aucune ligne de véhicule reconnue dans ce fichier.");

            return self::FAILURE;
        }

        $this->info(count($rows).' ligne(s) lue(s).');
        $dryRun = (bool) $this->option('dry-run');

        $companyId = DB::table('companies')->orderBy('created_at')->value('id');
        if (! $companyId) {
            $this->error("Aucune société en base : impossible de rattacher les véhicules.");

            return self::FAILURE;
        }

        $created = 0;
        $updated = 0;
        $skipped = 0;

        foreach ($rows as $row) {
            $registration = $row['registration'];
            $existing = Vehicle::query()
                ->withoutGlobalScopes()
                ->where('registration_number', $registration)
                ->first();

            if ($dryRun) {
                $this->line(sprintf(
                    '  %-14s %-12s %-16s %s',
                    $registration,
                    $row['brand'],
                    $row['model'],
                    $existing ? '→ existe déjà' : '→ création',
                ));
                $existing ? $skipped++ : $created++;

                continue;
            }

            [$brandId, $modelId] = $this->resolveBrandAndModel($row['brand'], $row['model']);

            $attributes = array_filter([
                'brand_id' => $brandId,
                'model_id' => $modelId,
                'brand_name' => $row['brand'],
                'model_name' => $row['model'],
                'immat_online' => $row['immat_online'],
                'mise_en_circulation' => $row['first_registered_at'],
                'fiscal_power' => $row['fiscal_power'],
                'fuel_type' => $row['fuel'],
                'year' => $row['year'],
            ], fn ($v) => $v !== null && $v !== '');

            if ($existing) {
                // On complète les trous sans écraser une saisie de l'agence.
                $changed = false;
                foreach ($attributes as $key => $value) {
                    if (blank($existing->{$key})) {
                        $existing->{$key} = $value;
                        $changed = true;
                    }
                }
                if ($changed) {
                    $existing->save();
                    $updated++;
                } else {
                    $skipped++;
                }

                continue;
            }

            Vehicle::query()->create(array_merge($attributes, [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'vehicle_code' => 'VEH-'.strtoupper(Str::random(8)),
                'registration_number' => $registration,
                'status' => 'AVAILABLE',
                'availability_status' => 'available',
                'ownership_status' => 'owned',
                'physical_status' => 'good',
            ]));
            $created++;
        }

        $this->newLine();
        $this->info("Créés : {$created}");
        $this->info("Complétés : {$updated}");
        $this->info("Inchangés : {$skipped}");

        if ($dryRun) {
            $this->comment('Essai à blanc — rien n\'a été écrit.');
        }

        return self::SUCCESS;
    }

    /**
     * L'export est un tableau HTML. On lit l'en-tête pour retrouver les
     * colonnes par leur nom : l'ordre peut changer d'un export à l'autre.
     *
     * @return list<array<string, mixed>>
     */
    private function parse(string $contents): array
    {
        if (! preg_match_all('/<tr[^>]*>(.*?)<\/tr>/is', $contents, $matches)) {
            return [];
        }

        $header = null;
        $rows = [];

        foreach ($matches[1] as $rawRow) {
            $cells = $this->cells($rawRow);
            if ($cells === []) {
                continue;
            }

            if ($header === null) {
                $normalized = array_map(fn ($c) => $this->slug($c), $cells);
                if (in_array('immatriculation', $normalized, true)) {
                    $header = $normalized;
                }

                continue;
            }

            $assoc = [];
            foreach ($header as $i => $key) {
                $assoc[$key] = $cells[$i] ?? '';
            }

            $registration = trim((string) ($assoc['immatriculation'] ?? ''));
            if ($registration === '') {
                continue;
            }

            $date = $this->date($assoc['date_mise_en_circulation'] ?? '');
            $power = (int) preg_replace('/\D/', '', (string) ($assoc['puissance_fiscal'] ?? ''));
            $fuel = strtoupper(trim((string) ($assoc['carburant'] ?? '')));

            $rows[] = [
                'registration' => $registration,
                'immat_online' => trim(str_ireplace('WW', '', (string) ($assoc['immat_www'] ?? ''))) ?: null,
                'brand' => $this->titleCase((string) ($assoc['marque'] ?? '')),
                'model' => $this->titleCase((string) ($assoc['modele'] ?? '')),
                'first_registered_at' => $date,
                'year' => $date ? (int) substr($date, 0, 4) : null,
                'fiscal_power' => $power > 0 ? $power : null,
                'fuel' => self::FUELS[$fuel] ?? ($fuel !== '' ? $this->titleCase($fuel) : null),
            ];
        }

        return $rows;
    }

    /** @return list<string> */
    private function cells(string $row): array
    {
        if (! preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/is', $row, $m)) {
            return [];
        }

        return array_map(function (string $cell) {
            $text = html_entity_decode(strip_tags($cell), ENT_QUOTES | ENT_HTML5, 'UTF-8');

            return trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        }, $m[1]);
    }

    /**
     * « Modèle » → modele. On remplace les accents nous-mêmes : iconv translittère
     * différemment selon la machine (« Mod`ele » sous Windows, « Modele » sous
     * Linux), et l'en-tête ne serait pas reconnu partout.
     */
    private function slug(string $value): string
    {
        $value = strtr($value, [
            'à' => 'a', 'â' => 'a', 'ä' => 'a', 'é' => 'e', 'è' => 'e', 'ê' => 'e',
            'ë' => 'e', 'î' => 'i', 'ï' => 'i', 'ô' => 'o', 'ö' => 'o', 'ù' => 'u',
            'û' => 'u', 'ü' => 'u', 'ç' => 'c',
            'À' => 'A', 'Â' => 'A', 'É' => 'E', 'È' => 'E', 'Ê' => 'E', 'Î' => 'I',
            'Ô' => 'O', 'Ù' => 'U', 'Û' => 'U', 'Ç' => 'C',
        ]);
        $value = strtolower(preg_replace('/[^A-Za-z0-9]+/', '_', $value) ?? $value);

        return trim($value, '_');
    }

    /** 30/09/2025 → 2025-09-30. */
    private function date(string $value): ?string
    {
        if (preg_match('#(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})#', $value, $m)) {
            return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
        }

        return null;
    }

    /** VOLKSWAGEN → Volkswagen, CLIO5 PRO → Clio5 Pro. */
    private function titleCase(string $value): string
    {
        $value = trim(preg_replace('/\s+/u', ' ', $value) ?? $value);

        return $value === '' ? '' : mb_convert_case($value, MB_CASE_TITLE, 'UTF-8');
    }

    /**
     * La marque et le modèle vivent dans leurs propres tables, en UUID. On
     * réutilise l'existant quand il est déjà là — comparaison insensible à la
     * casse, pour ne pas créer « Renault » à côté de « RENAULT ».
     *
     * @return array{0: ?string, 1: ?string}
     */
    private function resolveBrandAndModel(string $brand, string $model): array
    {
        if ($brand === '') {
            return [null, null];
        }

        $brandId = DB::table('vehicle_brands')
            ->whereRaw('UPPER(name) = ?', [mb_strtoupper($brand)])
            ->value('id');

        if (! $brandId) {
            $brandId = (string) Str::uuid();
            DB::table('vehicle_brands')->insert([
                'id' => $brandId,
                'name' => $brand,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        if ($model === '') {
            return [$brandId, null];
        }

        $modelId = DB::table('vehicle_models')
            ->where('brand_id', $brandId)
            ->whereRaw('UPPER(name) = ?', [mb_strtoupper($model)])
            ->value('id');

        if (! $modelId) {
            $modelId = (string) Str::uuid();
            DB::table('vehicle_models')->insert([
                'id' => $modelId,
                'brand_id' => $brandId,
                'name' => $model,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return [$brandId, $modelId];
    }
}
