<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class AiModuleTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;
    private string $branchId;
    private string $customerId;
    private string $vehicleId;
    private string $creditId;
    private string $invoiceId;
    private string $listingId;
    private string $arrearsId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
        $this->seedCoreAiData();
    }

    public function test_ai_overview_returns_real_data(): void
    {
        $user = $this->makeUser('ADMIN');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/overview');
        $response->assertOk();
        $response->assertJsonPath('data.kpis.maintenance_critical', fn ($v) => is_int($v) || is_float($v));
        $response->assertJsonPath('data.kpis.credit_high_risk', fn ($v) => is_int($v) || is_float($v));
    }

    public function test_maintenance_predictions_generated(): void
    {
        $user = $this->makeUser('ADMIN');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/predictions/maintenance');
        $response->assertOk();
        $response->assertJsonPath('data.total', fn ($v) => $v >= 1);
    }

    public function test_credit_risk_predictions_generated(): void
    {
        $user = $this->makeUser('ADMIN');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/predictions/credit-risk');
        $response->assertOk();
        $response->assertJsonPath('data.total', fn ($v) => $v >= 1);
    }

    public function test_cash_flow_predictions_generated(): void
    {
        $user = $this->makeUser('ADMIN');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/predictions/cash-flow');
        $response->assertOk();
        $response->assertJsonPath('data.total_open_invoices', fn ($v) => $v >= 1);
    }

    public function test_vehicle_pricing_predictions_generated(): void
    {
        $user = $this->makeUser('ADMIN');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/predictions/vehicle-pricing');
        $response->assertOk();
        $response->assertJsonPath('data.total', fn ($v) => $v >= 1);
    }

    public function test_assistant_responds_without_external_llm(): void
    {
        config()->set('ai.provider.enabled', false);
        config()->set('ai.provider.api_key', null);

        $user = $this->makeUser('ADMIN');
        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/ai/assistant/messages', [
            'message' => 'show overdue invoices risk',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.mode', 'rule_based');
        $response->assertJsonPath('data.provider.configured', false);
        $response->assertJsonPath('data.answer', fn ($v) => is_string($v) && $v !== '');
    }

    public function test_unauthorized_role_blocked_from_restricted_ai_route(): void
    {
        $user = $this->makeUser('ANALYSTE_CREDIT');

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/ai/predictions/cash-flow');
        $response->assertForbidden();
    }

    private function makeUser(string $roleCode): User
    {
        $user = User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => "AI {$roleCode}",
            'email' => strtolower($roleCode).'-ai@test.local',
            'password' => Hash::make('password'),
            'role' => $roleCode,
            'company_id' => $this->companyId,
        ]);

        $role = Role::query()->where('code', $roleCode)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    private function seedCoreAiData(): void
    {
        $this->companyId = (string) Str::uuid();
        $this->branchId = (string) Str::uuid();
        $this->customerId = (string) Str::uuid();
        $this->vehicleId = (string) Str::uuid();
        $this->creditId = (string) Str::uuid();
        $this->invoiceId = (string) Str::uuid();
        $this->listingId = (string) Str::uuid();
        $this->arrearsId = (string) Str::uuid();

        DB::table('companies')->insert([
            'id' => $this->companyId,
            'legal_name' => 'AI Test Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('branches')->insert([
            'id' => $this->branchId,
            'company_id' => $this->companyId,
            'code' => 'BR-AI',
            'name' => 'AI Branch',
            'city' => 'Casablanca',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('customers')->insert([
            'id' => $this->customerId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'customer_code' => 'CUST-AI-1',
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'elevated',
            'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('customer_individual_profiles')->insert([
            'customer_id' => $this->customerId,
            'first_name' => 'Ali',
            'last_name' => 'Test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('vehicles')->insert([
            'id' => $this->vehicleId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'vehicle_code' => 'VH-AI-1',
            'registration_number' => '12345-A-99',
            'status' => 'MAINTENANCE',
            'year' => 2018,
            'mileage_current' => 165000,
            'purchase_price' => 220000,
            'insurance_expiry' => now()->subDays(5)->toDateString(),
            'tech_control_expiry' => now()->subDays(2)->toDateString(),
            'vignette_expiry' => now()->addDays(15)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('credit_applications')->insert([
            'id' => $this->creditId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'customer_id' => $this->customerId,
            'vehicle_id' => $this->vehicleId,
            'application_type' => 'AUTO',
            'requested_amount' => 180000,
            'down_payment_amount' => 20000,
            'requested_duration_months' => 48,
            'monthly_income' => 9000,
            'monthly_debt' => 7000,
            'debt_ratio' => 0.7777,
            'scoring_status' => 'pending',
            'decision_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('invoices')->insert([
            'id' => $this->invoiceId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'invoice_number' => 'INV-AI-1',
            'invoice_type' => 'contract',
            'customer_id' => $this->customerId,
            'contract_id' => null,
            'issue_date' => now()->subDays(120)->toDateString(),
            'due_date' => now()->subDays(85)->toDateString(),
            'currency_code' => 'MAD',
            'subtotal_amount' => 90000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 90000,
            'amount_paid' => 10000,
            'amount_due' => 80000,
            'status' => 'overdue',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('used_car_listings')->insert([
            'id' => $this->listingId,
            'vehicle_id' => $this->vehicleId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'listing_code' => 'LIST-AI-1',
            'stage' => 'published',
            'asking_price' => 190000,
            'estimated_value' => 140000,
            'inspection_score' => 6,
            'mileage_at_listing' => 165000,
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('arrears_cases')->insert([
            'id' => $this->arrearsId,
            'company_id' => $this->companyId,
            'branch_id' => $this->branchId,
            'case_number' => 'ARR-AI-1',
            'customer_id' => $this->customerId,
            'contract_id' => null,
            'total_overdue' => 110000,
            'total_recovered' => 5000,
            'overdue_installments_count' => 4,
            'days_overdue' => 95,
            'stage' => 'legal',
            'resolution' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('vehicle_maintenance_events')->insert([
            'vehicle_id' => $this->vehicleId,
            'type' => 'REPAIR',
            'title' => 'Emergency repair',
            'performed_at' => now()->subDays(4)->toDateString(),
            'odometer_km' => 164000,
            'cost_mad' => 3500,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }
}
