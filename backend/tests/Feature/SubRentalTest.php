<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\SubRentalContract;
use App\Models\SupplierAgency;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class SubRentalTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;
    private string $branchId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->companyId = (string) Str::uuid();
        $this->branchId  = (string) Str::uuid();
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function makeUser(string $role): User
    {
        return User::query()->create([
            'id'         => (string) Str::uuid(),
            'name'       => 'Test User',
            'email'      => strtolower($role) . '.' . Str::random(6) . '@test.com',
            'password'   => Hash::make('password'),
            'role'       => $role,
            'company_id' => $this->companyId,
            'branch_id'  => $this->branchId,
        ]);
    }

    private function makeAgency(array $overrides = []): string
    {
        $id = (string) Str::uuid();
        \DB::table('supplier_agencies')->insert(array_merge([
            'id'         => $id,
            'company_id' => $this->companyId,
            'branch_id'  => $this->branchId,
            'name'       => 'Agence Test ' . Str::random(4),
            'status'     => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));
        return $id;
    }

    private function makeBrand(string $name = 'Peugeot'): string
    {
        $id = (string) Str::uuid();
        \DB::table('vehicle_brands')->insert([
            'id'         => $id,
            'company_id' => $this->companyId,
            'name'       => $name,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        return $id;
    }

    private function makeModel(string $brandId, string $name = '208'): string
    {
        $id = (string) Str::uuid();
        \DB::table('vehicle_models')->insert([
            'id'              => $id,
            'company_id'      => $this->companyId,
            'vehicle_brand_id'=> $brandId,
            'name'            => $name,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);
        return $id;
    }

    private function makeVehicle(array $overrides = []): string
    {
        $brandId  = $this->makeBrand();
        $modelId  = $this->makeModel($brandId);
        $id       = (string) Str::uuid();
        \DB::table('vehicles')->insert(array_merge([
            'id'                  => $id,
            'company_id'          => $this->companyId,
            'branch_id'           => $this->branchId,
            'vehicle_brand_id'    => $brandId,
            'vehicle_model_id'    => $modelId,
            'registration_number' => 'A-' . rand(10000, 99999) . '-B',
            'availability_status' => 'available',
            'ownership_status'    => 'owned',
            'year'                => 2022,
            'color'               => 'Blanc',
            'created_at'          => now(),
            'updated_at'          => now(),
        ], $overrides));
        return $id;
    }

    private function makeContract(string $agencyId, array $overrides = []): string
    {
        $id = (string) Str::uuid();
        \DB::table('sub_rental_contracts')->insert(array_merge([
            'id'                  => $id,
            'company_id'          => $this->companyId,
            'branch_id'           => $this->branchId,
            'supplier_agency_id'  => $agencyId,
            'contract_number'     => 'SL-' . strtoupper(Str::random(8)),
            'start_date'          => now()->toDateString(),
            'end_date'            => now()->addDays(30)->toDateString(),
            'daily_cost'          => 200.00,
            'total_cost'          => 6000.00,
            'payment_method'      => 'cash',
            'payment_status'      => 'unpaid',
            'status'              => 'draft',
            'created_at'          => now(),
            'updated_at'          => now(),
        ], $overrides));
        return $id;
    }

    // ── supplier agencies ─────────────────────────────────────────────────────

    public function test_create_supplier_agency(): void
    {
        $admin = $this->makeUser('ADMIN');

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/supplier-agencies', [
                'name'           => 'AutoMaroc Fès',
                'contact_person' => 'Mohamed Alaoui',
                'phone'          => '0661234567',
                'email'          => 'contact@automaroc.ma',
                'city'           => 'Fès',
                'status'         => 'active',
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.name', 'AutoMaroc Fès')
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('supplier_agencies', [
            'name'       => 'AutoMaroc Fès',
            'company_id' => $this->companyId,
        ]);
    }

    public function test_list_supplier_agencies(): void
    {
        $admin = $this->makeUser('ADMIN');
        $this->makeAgency(['name' => 'Agence Alpha']);
        $this->makeAgency(['name' => 'Agence Beta']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/supplier-agencies');

        $res->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_cannot_delete_agency_with_active_contracts(): void
    {
        $admin    = $this->makeUser('ADMIN');
        $agencyId = $this->makeAgency();
        $this->makeContract($agencyId, ['status' => 'active']);

        $res = $this->actingAs($admin, 'sanctum')
            ->deleteJson("/api/v1/supplier-agencies/{$agencyId}");

        $res->assertStatus(422);
        $this->assertDatabaseHas('supplier_agencies', ['id' => $agencyId]);
    }

    // ── sub-rental contracts ──────────────────────────────────────────────────

    public function test_create_sub_rental_with_external_vehicle_identity(): void
    {
        $admin    = $this->makeUser('ADMIN');
        $agencyId = $this->makeAgency();

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/sub-rentals', [
                'supplier_agency_id'       => $agencyId,
                'start_date'               => now()->toDateString(),
                'end_date'                 => now()->addDays(10)->toDateString(),
                'daily_cost'               => 300,
                'payment_method'           => 'cash',
                'external_vehicle_identity'=> [
                    'registration_number' => 'B-99999-A',
                    'brand_name'          => 'Renault',
                    'model_name'          => 'Clio',
                    'year'                => 2021,
                    'color'               => 'Rouge',
                ],
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('data.status', 'draft');

        $this->assertDatabaseHas('sub_rental_contracts', [
            'supplier_agency_id' => $agencyId,
            'status'             => 'draft',
            'daily_cost'         => 300,
        ]);
    }

    public function test_activate_contract_creates_sub_rented_vehicle(): void
    {
        $admin    = $this->makeUser('ADMIN');
        $agencyId = $this->makeAgency();

        $contractId = (string) Str::uuid();
        \DB::table('sub_rental_contracts')->insert([
            'id'                         => $contractId,
            'company_id'                 => $this->companyId,
            'branch_id'                  => $this->branchId,
            'supplier_agency_id'         => $agencyId,
            'contract_number'            => 'SL-TEST0001',
            'start_date'                 => now()->toDateString(),
            'end_date'                   => now()->addDays(30)->toDateString(),
            'daily_cost'                 => 200,
            'total_cost'                 => 6000,
            'payment_method'             => 'cash',
            'payment_status'             => 'unpaid',
            'status'                     => 'draft',
            'external_vehicle_identity'  => json_encode([
                'registration_number' => 'C-55555-D',
                'brand_name'          => 'Toyota',
                'model_name'          => 'Yaris',
                'year'                => 2023,
            ]),
            'created_at'                 => now(),
            'updated_at'                 => now(),
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/activate");

        $res->assertStatus(200)
            ->assertJsonPath('data.status', 'active');

        $this->assertDatabaseHas('sub_rental_contracts', [
            'id'     => $contractId,
            'status' => 'active',
        ]);

        // A vehicle should have been created with ownership_status = sub_rented
        $this->assertDatabaseHas('vehicles', [
            'registration_number' => 'C-55555-D',
            'ownership_status'    => 'sub_rented',
        ]);
    }

    public function test_activate_contract_with_linked_vehicle_marks_it_sub_rented(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $vehicleId  = $this->makeVehicle();
        $contractId = $this->makeContract($agencyId, ['vehicle_id' => $vehicleId]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/activate");

        $res->assertStatus(200);

        $this->assertDatabaseHas('vehicles', [
            'id'               => $vehicleId,
            'ownership_status' => 'sub_rented',
        ]);
    }

    public function test_cannot_activate_contract_for_blacklisted_agency(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency(['status' => 'blacklisted']);
        $contractId = $this->makeContract($agencyId);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/activate");

        $res->assertStatus(422);

        $this->assertDatabaseHas('sub_rental_contracts', [
            'id'     => $contractId,
            'status' => 'draft',
        ]);
    }

    public function test_add_payment_and_payment_status_updates(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, ['status' => 'active', 'total_cost' => 2000]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount'         => 1000,
                'payment_method' => 'cash',
                'payment_date'   => now()->toDateString(),
            ]);

        $res->assertStatus(201)
            ->assertJsonPath('payment_status', 'partial');

        $this->assertDatabaseHas('sub_rental_payments', [
            'sub_rental_contract_id' => $contractId,
            'amount'                 => 1000,
        ]);
        $this->assertDatabaseHas('sub_rental_contracts', [
            'id'             => $contractId,
            'payment_status' => 'partial',
        ]);
    }

    public function test_full_payment_marks_contract_paid(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, ['status' => 'active', 'total_cost' => 500]);

        $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount'         => 500,
                'payment_method' => 'bank_transfer',
                'payment_date'   => now()->toDateString(),
            ])->assertStatus(201)->assertJsonPath('payment_status', 'paid');

        $this->assertDatabaseHas('sub_rental_contracts', [
            'id'             => $contractId,
            'payment_status' => 'paid',
        ]);
    }

    public function test_profitability_endpoint_returns_correct_structure(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, [
            'status'     => 'active',
            'daily_cost' => 200,
            'total_cost' => 2000,
            'start_date' => now()->toDateString(),
            'end_date'   => now()->addDays(10)->toDateString(),
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson("/api/v1/sub-rentals/{$contractId}/profitability");

        $res->assertStatus(200)
            ->assertJsonStructure(['data' => [
                'supplier_cost',
                'customer_revenue',
                'margin',
                'margin_percentage',
                'total_paid',
                'remaining_balance',
                'days_count',
                'daily_cost',
            ]]);

        $this->assertEquals(2000, $res->json('data.supplier_cost'));
    }

    public function test_return_to_supplier_resets_vehicle_ownership(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $vehicleId  = $this->makeVehicle(['ownership_status' => 'sub_rented', 'availability_status' => 'available']);
        $contractId = $this->makeContract($agencyId, [
            'status'     => 'active',
            'vehicle_id' => $vehicleId,
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/return", [
                'return_date'        => now()->toDateString(),
                'odometer_km'        => 45000,
                'fuel_level'         => 'full',
                'condition_notes'    => 'Bon état',
                'signed_by_supplier' => true,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('data.status', 'returned');

        $this->assertDatabaseHas('vehicles', [
            'id'               => $vehicleId,
            'ownership_status' => 'owned',
        ]);

        $this->assertDatabaseHas('sub_rental_return_reports', [
            'sub_rental_contract_id' => $contractId,
        ]);
    }

    public function test_dashboard_returns_expected_keys(): void
    {
        $admin = $this->makeUser('ADMIN');

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/sub-rentals/dashboard');

        $res->assertStatus(200)
            ->assertJsonStructure(['data' => [
                'active_sub_rentals',
                'due_soon',
                'overdue',
                'monthly_supplier_cost',
                'total_margin',
            ]]);
    }

    public function test_cannot_close_unpaid_contract_without_force(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, [
            'status'         => 'returned',
            'payment_status' => 'unpaid',
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/close", [
                'force_close' => false,
            ]);

        $res->assertStatus(422);

        $this->assertDatabaseHas('sub_rental_contracts', [
            'id'     => $contractId,
            'status' => 'returned',
        ]);
    }

    public function test_can_force_close_unpaid_contract_as_admin(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, [
            'status'         => 'returned',
            'payment_status' => 'unpaid',
        ]);

        $res = $this->actingAs($admin, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/close", [
                'force_close' => true,
            ]);

        $res->assertStatus(200)
            ->assertJsonPath('data.status', 'closed');
    }

    public function test_update_blocked_on_non_draft_contract(): void
    {
        $admin      = $this->makeUser('ADMIN');
        $agencyId   = $this->makeAgency();
        $contractId = $this->makeContract($agencyId, ['status' => 'active']);

        $res = $this->actingAs($admin, 'sanctum')
            ->patchJson("/api/v1/sub-rentals/{$contractId}", [
                'daily_cost' => 999,
            ]);

        $res->assertStatus(422);
    }

    public function test_list_sub_rentals_filters_by_status(): void
    {
        $admin    = $this->makeUser('ADMIN');
        $agencyId = $this->makeAgency();
        $this->makeContract($agencyId, ['status' => 'active']);
        $this->makeContract($agencyId, ['status' => 'active']);
        $this->makeContract($agencyId, ['status' => 'draft']);

        $res = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/sub-rentals?status=active');

        $res->assertStatus(200);
        $data = $res->json('data');
        $this->assertCount(2, $data);
        foreach ($data as $item) {
            $this->assertEquals('active', $item['status']);
        }
    }
}
