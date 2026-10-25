<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Models\Branch;
use App\Models\Vehicle;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use DOMDocument;
use DOMXPath;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

class ImportVehiclesXlsCommand extends Command
{
    protected $signature = 'vehicles:import-xls {path} {--company=} {--branch=} {--dry-run}';

    protected $description = 'Import vehicles from the legacy HTML-based .xls export (Immatriculation, Immat www, Marque, Modèle, Date mise en circulation, Puissance fiscal, Carburant).';

    public function handle(): int
    {
        $path = $this->argument('path');
        if (! is_file($path)) {
            $this->error("File not found: $path");
            return self::FAILURE;
        }

        $companyId = $this->option('company');
        if (! $companyId) {
            $companyId = optional(Company::query()->orderBy('created_at')->first())->id;
        }
        if (! $companyId) {
            $this->error('No company found. Pass --company=<uuid>.');
            return self::FAILURE;
        }

        $branchId = $this->option('branch');
        if (! $branchId) {
            $branchId = optional(Branch::query()->where('company_id', $companyId)->orderBy('created_at')->first())->id;
        }

        $html = file_get_contents($path);
        $html = preg_replace('/^\xEF\xBB\xBF/', '', $html);

        $dom = new DOMDocument();
        libxml_use_internal_errors(true);
        $dom->loadHTML('<?xml encoding="UTF-8">' . $html);
        libxml_clear_errors();

        $xpath = new DOMXPath($dom);
        $rows = $xpath->query('//table//tr');

        $dryRun = (bool) $this->option('dry-run');
        $imported = 0;
        $skipped = 0;
        $failed = 0;

        foreach ($rows as $row) {
            $cells = $xpath->query('.//td', $row);
            if ($cells->length < 7) {
                continue;
            }
            $values = [];
            for ($i = 0; $i < $cells->length; $i++) {
                $values[] = $this->cleanCell($cells->item($i)->textContent);
            }

            [$immatriculation, $immatWww, $marque, $modele, $miseEnCirc, $puissanceFiscale, $carburant] = array_pad($values, 7, null);

            if ($immatriculation === '' || $immatriculation === null) {
                continue;
            }

            if (Vehicle::query()->withTrashed()->where('registration_number', $immatriculation)->exists()) {
                $skipped++;
                $this->line("skip existing: $immatriculation");
                continue;
            }

            $brandId = null;
            $modelId = null;
            if ($marque !== '' && ! $dryRun) {
                $brand = VehicleBrand::query()->firstOrCreate(
                    ['name' => $marque],
                    ['id' => (string) Str::uuid()]
                );
                $brandId = $brand->id;

                if ($modele !== '') {
                    $model = VehicleModel::query()->firstOrCreate(
                        ['brand_id' => $brandId, 'name' => $modele],
                        ['id' => (string) Str::uuid()]
                    );
                    $modelId = $model->id;
                }
            }

            $data = [
                'id' => (string) Str::uuid(),
                'company_id' => $companyId,
                'branch_id' => $branchId,
                'registration_number' => $immatriculation,
                'immat_online' => $immatWww ?: null,
                'brand_id' => $brandId,
                'model_id' => $modelId,
                'brand_name' => $marque ?: null,
                'model_name' => $modele ?: null,
                'mise_en_circulation' => $this->parseDate($miseEnCirc),
                'fiscal_power' => is_numeric($puissanceFiscale) ? (int) $puissanceFiscale : null,
                'fuel_type' => $this->mapFuel($carburant),
                'status' => 'AVAILABLE',
                'availability_status' => 'available',
            ];

            if ($dryRun) {
                $this->line("would import: $immatriculation / $marque $modele");
                $imported++;
                continue;
            }

            try {
                Vehicle::query()->create($data);
                $imported++;
                $this->line("imported: $immatriculation");
            } catch (\Throwable $e) {
                $failed++;
                $this->warn("failed $immatriculation: " . $e->getMessage());
            }
        }

        $this->info("Done. imported=$imported skipped=$skipped failed=$failed");
        return self::SUCCESS;
    }

    private function cleanCell(string $text): string
    {
        $text = str_replace("\xC2\xA0", ' ', $text);
        $text = preg_replace('/\s+/u', ' ', $text);
        return trim($text);
    }

    private function parseDate(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        try {
            return Carbon::createFromFormat('d/m/Y', $value)->toDateString();
        } catch (\Throwable $e) {
            return null;
        }
    }

    private function mapFuel(?string $value): ?string
    {
        if (! $value) {
            return null;
        }
        $v = strtoupper(trim($value));
        return match ($v) {
            'GASOIL', 'DIESEL' => 'DIESEL',
            'ESSENCE', 'PETROL' => 'PETROL',
            'HYBRIDE', 'HYBRID' => 'HYBRID',
            'ELECTRIQUE', 'ELECTRIC' => 'ELECTRIC',
            default => $v,
        };
    }
}
