<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class TenantScopingSecurityTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $email, string $role, string $companyId, ?string $branchId = null, ?string $customerId = null): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Tenant User',
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $role,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'customer_id' => $customerId,
        ]);
    }

    private function makeCustomer(string $companyId, ?string $branchId = null): string
    {
        $id = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'customer_code' => 'CUST-'.strtoupper(Str::random(6)),
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeCompany(string $companyId): void
    {
        \DB::table('companies')->insert([
            'id' => $companyId,
            'legal_name' => 'Tenant Company',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeVehicle(string $companyId, ?string $branchId = null): string
    {
        $id = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'registration_number' => 'REG-'.strtoupper(Str::random(7)),
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeContract(string $companyId, ?string $branchId, string $customerId, string $vehicleId): string
    {
        $id = (string) Str::uuid();
        \DB::table('contracts')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'contract_number' => 'CTR-'.strtoupper(Str::random(8)),
            'contract_type' => 'LLD',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'status' => 'active',
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_user_from_company_a_cannot_access_company_b_customer(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        $companyA = (string) Str::uuid();
        $companyB = (string) Str::uuid();
        $this->makeCompany($companyA);
        $this->makeCompany($companyB);
        $userA = $this->makeUser('a@tenant.test', 'AGENT_COMMERCIAL', $companyA);
        $customerB = $this->makeCustomer($companyB);

        $response = $this->actingAs($userA, 'sanctum')->getJson('/api/v1/customers/'.$customerB);
        $response->assertStatus(404);
    }

    public function test_branch_user_cannot_access_other_branch_vehicle(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $branchA = (string) Str::uuid();
        $branchB = (string) Str::uuid();
        $user = $this->makeUser('branch@tenant.test', 'AGENT_COMMERCIAL', $company, $branchA);
        $vehicleInBranchB = $this->makeVehicle($company, $branchB);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/vehicles/'.$vehicleInBranchB);
        $response->assertStatus(404);
    }

    public function test_client_portal_cannot_access_another_customer_contract(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $customer1 = $this->makeCustomer($company, null);
        $customer2 = $this->makeCustomer($company, null);
        $vehicle1 = $this->makeVehicle($company, null);
        $vehicle2 = $this->makeVehicle($company, null);
        $contractForCustomer2 = $this->makeContract($company, null, $customer2, $vehicle2);
        $clientPortalUser = $this->makeUser('client@tenant.test', 'CLIENT_PORTAL', $company, null, $customer1);

        $response = $this->actingAs($clientPortalUser, 'sanctum')->getJson('/api/v1/contracts/'.$contractForCustomer2);
        $response->assertStatus(404);

        // sanity: own-customer contract is accessible
        $ownContract = $this->makeContract($company, null, $customer1, $vehicle1);
        $own = $this->actingAs($clientPortalUser, 'sanctum')->getJson('/api/v1/contracts/'.$ownContract);
        $own->assertStatus(200);
    }
}

