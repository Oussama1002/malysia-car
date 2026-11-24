<?php

namespace Database\Seeders;

use App\Models\BankAccount;
use App\Models\Company;
use App\Models\Contract;
use App\Models\Customer;
use App\Models\CustomerIndividualProfile;
use App\Models\Expense;
use App\Models\ExpenseSupplier;
use App\Models\FixedCharge;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\User;
use App\Models\Vehicle;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Seeder that lights up the finance modules with a minimal, recognisable
 * dataset so the FINANCE_TEST_PLAN.md cases have something to click on.
 *
 * Idempotent: every row is created via firstOrCreate on a stable key; running
 * it twice does not duplicate anything. Every seeded row carries the marker
 * `[TEST DATA]` in `notes` (where the column exists) so you can find and
 * remove it later with a single query if needed.
 *
 * Run with: php artisan db:seed --class=FinanceTestDataSeeder
 */
class FinanceTestDataSeeder extends Seeder
{
    private const MARKER = '[TEST DATA] Finance QA seeder';

    public function run(): void
    {
        $company = Company::query()->first();
        if (! $company) {
            $this->command?->warn('No Company row found — run the base seeders first. Aborting.');

            return;
        }

        $admin = User::query()
            ->whereHas('roles', fn ($q) => $q->where('code', 'ADMIN'))
            ->first();
        if (! $admin) {
            $this->command?->warn('No ADMIN user found — create one before seeding. Aborting.');

            return;
        }

        DB::transaction(function () use ($company, $admin) {
            $customer = $this->seedCustomer($company);
            $vehicle = $this->seedVehicle($company);
            $contract = $this->seedContract($company, $customer, $vehicle, $admin);
            $bank = $this->seedBankAccount($company);
            $this->seedExtraBankAccounts($company);

            $this->seedPayments($company, $customer, $contract, $bank, $admin);
            $this->seedInvoices($company, $customer, $contract, $admin);
            $this->seedFixedCharge($company, $admin);
            $this->seedExpense($company, $vehicle, $admin);

            $this->command?->info('Finance test data seeded. Marker: '.self::MARKER);
        });
    }

    private function seedCustomer(Company $company): Customer
    {
        $customer = Customer::firstOrCreate(
            ['company_id' => $company->id, 'customer_code' => 'CL-TEST-FIN-001'],
            [
                'id' => (string) Str::uuid(),
                'customer_type' => 'PARTICULIER',
                'status' => 'active',
                'risk_level' => 'normal',
                'is_blacklisted' => false,
                'preferred_language' => 'fr',
                'source_channel' => 'seeder',
            ]
        );

        CustomerIndividualProfile::firstOrCreate(
            ['customer_id' => $customer->id],
            [
                'first_name' => 'Test Finance',
                'last_name' => 'Dupont',
                'gender' => 'M',
                'nationality' => 'MA',
                'national_id_number' => 'TEST000001',
                'driving_license_number' => 'DL-TEST-001',
            ]
        );

        return $customer;
    }

    private function seedVehicle(Company $company): Vehicle
    {
        $brand = VehicleBrand::query()->first();
        $model = $brand ? VehicleModel::query()->where('brand_id', $brand->id)->first() : null;

        return Vehicle::firstOrCreate(
            ['registration_number' => 'TEST-FIN-00001'],
            [
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'vehicle_code' => 'V-TEST-FIN-001',
                'brand_id' => $brand?->id,
                'model_id' => $model?->id,
                'brand_name' => $brand?->name ?? 'Test',
                'model_name' => $model?->name ?? 'Finance',
                'year' => 2024,
                'color' => 'Blanc',
                'fuel_type' => 'diesel',
                'transmission' => 'manual',
                'mileage_current' => 10000,
                'status' => 'AVAILABLE',
                'availability_status' => 'available',
                'daily_rental_price' => 300.00,
                'monthly_rental_price' => 7500.00,
                'acquisition_type' => 'PURCHASE',
                'purchase_price' => 180000.00,
                'notes' => self::MARKER,
            ]
        );
    }

    private function seedContract(Company $company, Customer $customer, Vehicle $vehicle, User $admin): Contract
    {
        return Contract::firstOrCreate(
            ['company_id' => $company->id, 'contract_number' => 'CT-TEST-FIN-001'],
            [
                'id' => (string) Str::uuid(),
                'contract_type' => 'LOCATION_COURTE',
                'customer_id' => $customer->id,
                'vehicle_id' => $vehicle->id,
                'status' => 'active',
                'legal_status' => 'ok',
                'signature_status' => 'signed',
                'start_date' => now()->subDays(5)->toDateString(),
                'end_date' => now()->addDays(10)->toDateString(),
                'duration_months' => 1,
                'currency_code' => 'MAD',
                'base_amount' => 4500.00,
                'deposit_amount' => 3000.00,
                'allowed_km' => 2000,
                'excess_km_rate' => 2.00,
                'insurance_included' => true,
                'maintenance_included' => false,
                'activation_date' => now()->subDays(5),
                'signed_at' => now()->subDays(5),
                'created_by' => $admin->id,
                'approved_by' => $admin->id,
                'notes' => self::MARKER,
            ]
        );
    }

    private function seedBankAccount(Company $company): BankAccount
    {
        return BankAccount::firstOrCreate(
            ['company_id' => $company->id, 'account_name' => 'Banque Test QA'],
            [
                'id' => (string) Str::uuid(),
                'bank_name' => 'Attijariwafa Bank',
                'account_number' => '007810001234567890123456',
                'iban' => 'MA64007810001234567890123456',
                'swift_code' => 'BCMAMAMC',
                'currency_code' => 'MAD',
                'opening_balance' => 50000.00,
                'current_balance' => 50000.00,
                'is_active' => true,
                'is_primary' => true,
                'notes' => self::MARKER,
            ]
        );
    }

    /**
     * Extra bank accounts so the Trésorerie page has several rows to test:
     * a secondary bank in EUR, a cash register, and an inactive account.
     */
    private function seedExtraBankAccounts(Company $company): void
    {
        BankAccount::firstOrCreate(
            ['company_id' => $company->id, 'account_name' => 'BMCE EUR (TEST)'],
            [
                'id' => (string) Str::uuid(),
                'bank_name' => 'BMCE Bank',
                'account_number' => '011780002345678901234567',
                'iban' => 'MA64011780002345678901234567',
                'swift_code' => 'BMCEMAMC',
                'currency_code' => 'EUR',
                'opening_balance' => 12000.00,
                'current_balance' => 12000.00,
                'is_active' => true,
                'is_primary' => false,
                'notes' => self::MARKER.' — Compte EUR secondaire',
            ]
        );

        BankAccount::firstOrCreate(
            ['company_id' => $company->id, 'account_name' => 'Caisse espèces (TEST)'],
            [
                'id' => (string) Str::uuid(),
                'bank_name' => 'Caisse',
                'account_number' => 'CAISSE-TEST-001',
                'iban' => null,
                'swift_code' => null,
                'currency_code' => 'MAD',
                'opening_balance' => 8000.00,
                'current_balance' => 8000.00,
                'is_active' => true,
                'is_primary' => false,
                'notes' => self::MARKER.' — Caisse espèces agence',
            ]
        );

        BankAccount::firstOrCreate(
            ['company_id' => $company->id, 'account_name' => 'CIH Fermé (TEST)'],
            [
                'id' => (string) Str::uuid(),
                'bank_name' => 'CIH Bank',
                'account_number' => '230150003456789012345678',
                'iban' => 'MA64230150003456789012345678',
                'swift_code' => 'CIHMMAMC',
                'currency_code' => 'MAD',
                'opening_balance' => 0.00,
                'current_balance' => 0.00,
                'is_active' => false,
                'is_primary' => false,
                'notes' => self::MARKER.' — Compte historique inactif',
            ]
        );
    }

    private function seedPayments(
        Company $company,
        Customer $customer,
        Contract $contract,
        BankAccount $bank,
        User $admin,
    ): void {
        // Rent payment — cash, 1 500 MAD
        Payment::firstOrCreate(
            ['payment_number' => 'PAY-TEST-FIN-001'],
            [
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'customer_id' => $customer->id,
                'contract_id' => $contract->id,
                'payment_method' => 'cash',
                'payment_type' => 'rent',
                'payment_direction' => 'incoming',
                'amount' => 1500.00,
                'currency_code' => 'MAD',
                'amount_allocated' => 0,
                'amount_unallocated' => 1500.00,
                'status' => 'received',
                'payment_date' => now()->subDays(3)->toDateString(),
                'received_by_user_id' => $admin->id,
                'notes' => self::MARKER.' — Loyer location',
            ]
        );

        // Franchise d'assurance — cash, 3 000 MAD (backend enum stays `caution`)
        Payment::firstOrCreate(
            ['payment_number' => 'PAY-TEST-FIN-002'],
            [
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'customer_id' => $customer->id,
                'contract_id' => $contract->id,
                'payment_method' => 'cash',
                'payment_type' => 'caution',
                'payment_direction' => 'incoming',
                'amount' => 3000.00,
                'currency_code' => 'MAD',
                'amount_allocated' => 0,
                'amount_unallocated' => 3000.00,
                'status' => 'received',
                'payment_date' => now()->subDays(5)->toDateString(),
                'received_by_user_id' => $admin->id,
                'notes' => self::MARKER.' — Franchise d\'assurance',
            ]
        );

        // Bank transfer — 2 000 MAD (used to test allocation against the invoice)
        Payment::firstOrCreate(
            ['payment_number' => 'PAY-TEST-FIN-003'],
            [
                'id' => (string) Str::uuid(),
                'company_id' => $company->id,
                'customer_id' => $customer->id,
                'contract_id' => $contract->id,
                'bank_account_id' => $bank->id,
                'payment_method' => 'bank_transfer',
                'payment_type' => 'rent',
                'payment_direction' => 'incoming',
                'amount' => 2000.00,
                'currency_code' => 'MAD',
                'amount_allocated' => 0,
                'amount_unallocated' => 2000.00,
                'status' => 'received',
                'payment_date' => now()->subDays(1)->toDateString(),
                'external_reference' => 'TRF-TEST-001',
                'received_by_user_id' => $admin->id,
                'notes' => self::MARKER.' — Virement test',
            ]
        );
    }

    private function seedInvoices(
        Company $company,
        Customer $customer,
        Contract $contract,
        User $admin,
    ): void {
        // Draft invoice
        Invoice::firstOrCreate(
            ['company_id' => $company->id, 'invoice_number' => 'INV-TEST-FIN-DRAFT'],
            [
                'id' => (string) Str::uuid(),
                'invoice_type' => 'contract',
                'customer_id' => $customer->id,
                'contract_id' => $contract->id,
                'issue_date' => now()->toDateString(),
                'due_date' => now()->addDays(15)->toDateString(),
                'currency_code' => 'MAD',
                'subtotal_amount' => 2500.00,
                'tax_amount' => 500.00,
                'discount_amount' => 0,
                'total_amount' => 3000.00,
                'amount_paid' => 0,
                'amount_due' => 3000.00,
                'status' => 'draft',
                'created_by' => $admin->id,
                'notes' => self::MARKER.' — Brouillon à éditer',
            ]
        );

        // Issued invoice
        Invoice::firstOrCreate(
            ['company_id' => $company->id, 'invoice_number' => 'INV-TEST-FIN-ISSUED'],
            [
                'id' => (string) Str::uuid(),
                'invoice_type' => 'contract',
                'customer_id' => $customer->id,
                'contract_id' => $contract->id,
                'issue_date' => now()->subDays(2)->toDateString(),
                'due_date' => now()->addDays(10)->toDateString(),
                'currency_code' => 'MAD',
                'subtotal_amount' => 4500.00,
                'tax_amount' => 900.00,
                'discount_amount' => 0,
                'total_amount' => 5400.00,
                'amount_paid' => 0,
                'amount_due' => 5400.00,
                'status' => 'issued',
                'issued_at' => now()->subDays(2),
                'created_by' => $admin->id,
                'notes' => self::MARKER.' — Facture émise',
            ]
        );
    }

    private function seedFixedCharge(Company $company, User $admin): void
    {
        FixedCharge::firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Loyer locaux (TEST)'],
            [
                'category' => 'rent',
                'amount' => 5000.00,
                'currency_code' => 'MAD',
                'frequency' => 'monthly',
                'start_date' => now()->startOfMonth()->toDateString(),
                'next_due_date' => now()->startOfMonth()->addMonth()->toDateString(),
                'payment_method' => 'bank_transfer',
                'supplier_name' => 'SCI Test Immobilier',
                'status' => 'active',
                'created_by' => $admin->id,
                'notes' => self::MARKER,
            ]
        );
    }

    private function seedExpense(Company $company, Vehicle $vehicle, User $admin): void
    {
        $supplier = ExpenseSupplier::firstOrCreate(
            ['company_id' => $company->id, 'name' => 'Garage Test QA'],
            [
                'id' => (string) Str::uuid(),
                'category' => 'maintenance',
                'phone' => '+212600000000',
                'email' => 'garage.test@example.com',
                'ice' => '000000000000001',
                'status' => 'active',
            ]
        );

        Expense::firstOrCreate(
            ['company_id' => $company->id, 'label' => 'Vidange moteur (TEST)'],
            [
                'id' => (string) Str::uuid(),
                'amount' => 800.00,
                'currency_code' => 'MAD',
                'expense_date' => now()->subDays(2)->toDateString(),
                'due_date' => now()->addDays(5)->toDateString(),
                'category' => 'maintenance',
                'expense_type' => 'operational',
                'status' => 'unpaid',
                'payment_method' => 'bank_transfer',
                'reference' => 'FACT-GRG-TEST-001',
                'vehicle_id' => $vehicle->id,
                'supplier_id' => $supplier->id,
                'created_by' => $admin->id,
                'notes' => self::MARKER,
            ]
        );
    }
}
