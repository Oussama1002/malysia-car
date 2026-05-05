<?php

namespace App\Console\Commands;

use App\Models\Company;
use App\Services\AccountingMappingService;
use Database\Seeders\FiscalYearSeeder;
use Database\Seeders\MoroccanAccountingJournalsSeeder;
use Database\Seeders\MoroccanChartOfAccountsSeeder;
use Database\Seeders\MoroccanTaxesSeeder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Schema;

class SeedAccountingCommand extends Command
{
    protected $signature = 'driveflow:seed-accounting {--company=}';
    protected $description = 'Seed Moroccan accounting base setup';

    public function handle(AccountingMappingService $mappings): int
    {
        $companyId = $this->option('company') ? (string) $this->option('company') : null;
        $requiresCompany = Schema::hasColumn('accounting_journals', 'journal_code')
            || Schema::hasColumn('taxes', 'tax_code')
            || Schema::hasColumn('fiscal_years', 'year_label');
        if ($requiresCompany && !$companyId) {
            $this->error('Cette base requiert --company pour seed journals/taxes/fiscal year.');
            return self::FAILURE;
        }
        if ($companyId && !Company::query()->where('id', $companyId)->exists()) {
            $this->error("Societe introuvable: {$companyId}");
            return self::FAILURE;
        }

        (new MoroccanChartOfAccountsSeeder())->run();
        (new MoroccanAccountingJournalsSeeder())->run($companyId);
        (new MoroccanTaxesSeeder())->run($companyId);
        (new FiscalYearSeeder())->run($companyId);
        $mappings->saveMappings($companyId, AccountingMappingService::defaults());

        $this->info('Socle comptable marocain installe.');
        if ($companyId) {
            $this->info("Mappings initialises pour societe: {$companyId}");
        }

        return self::SUCCESS;
    }
}
