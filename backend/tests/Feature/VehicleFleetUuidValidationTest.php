<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class VehicleFleetUuidValidationTest extends TestCase
{
    use RefreshDatabase;

    private function seedBrandAndModels(): array
    {
        $brandId = (string) Str::uuid();
        \DB::table('vehicle_brands')->insert([
            'id' => $brandId,
            'name' => 'FleetBrand-'.Str::random(4),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $modelA = (string) Str::uuid();
        $modelB = (string) Str::uuid();
        \DB::table('vehicle_models')->insert([
            [
                'id' => $modelA,
                'brand_id' => $brandId,
                'name' => 'Model-A',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'id' => $modelB,
                'brand_id' => $brandId,
                'name' => 'Model-B',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);

        return [$brandId, $modelA, $modelB];
    }

    private function adminUser(string $companyId): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Fleet Admin',
            'email' => 'fleet-'.Str::random(6).'@test.local',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $companyId,
            'branch_id' => null,
        ]);
    }

    public function test_store_vehicle_accepts_uuid_brand_and_model_ids(): void
    {
        $companyId = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $companyId,
            'legal_name' => 'Fleet Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        [$brandId, $modelA] = $this->seedBrandAndModels();
        $user = $this->adminUser($companyId);

        $registration = '99999-Z-'.random_int(10, 99);
        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles', [
            'registration' => $registration,
            'brand_id' => $brandId,
            'model_id' => $modelA,
            'year' => 2024,
        ]);

        $response->assertCreated();
        $vehicleId = $response->json('data.id');
        $this->assertNotEmpty($vehicleId);

        $row = \DB::table('vehicles')->where('id', $vehicleId)->first();
        $this->assertSame($brandId, $row->brand_id);
        $this->assertSame($modelA, $row->model_id);
    }

    public function test_store_vehicle_rejects_integer_brand_id(): void
    {
        $companyId = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $companyId,
            'legal_name' => 'Fleet Co 2',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        [$brandId, $modelA] = $this->seedBrandAndModels();
        $user = $this->adminUser($companyId);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles', [
            'registration' => '88888-Y-'.random_int(10, 99),
            'brand_id' => 1,
            'model_id' => $modelA,
            'year' => 2024,
        ]);

        $response->assertStatus(422);
    }

    public function test_update_vehicle_accepts_uuid_model_change(): void
    {
        $companyId = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $companyId,
            'legal_name' => 'Fleet Co 3',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        [$brandId, $modelA, $modelB] = $this->seedBrandAndModels();
        $user = $this->adminUser($companyId);

        $create = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles', [
            'registration' => '77777-X-'.random_int(10, 99),
            'brand_id' => $brandId,
            'model_id' => $modelA,
        ]);
        $create->assertCreated();
        $vehicleId = $create->json('data.id');

        $update = $this->actingAs($user, 'sanctum')->putJson('/api/v1/vehicles/'.$vehicleId, [
            'model_id' => $modelB,
        ]);

        $update->assertOk();
        $this->assertSame($modelB, \DB::table('vehicles')->where('id', $vehicleId)->value('model_id'));
    }
}
