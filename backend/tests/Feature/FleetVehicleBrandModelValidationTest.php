<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class FleetVehicleBrandModelValidationTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Fleet Admin',
            'email' => 'fleet-'.Str::lower(Str::random(8)).'@test.local',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);
    }

    /** @return array{0: string, 1: string, 2: string, 3: string} brandA, brandB, modelA, modelB */
    private function seedBrandsAndModels(): array
    {
        $brandA = (string) Str::uuid();
        $brandB = (string) Str::uuid();
        \DB::table('vehicle_brands')->insert([
            ['id' => $brandA, 'name' => 'BrandA-'.Str::random(4), 'created_at' => now(), 'updated_at' => now()],
            ['id' => $brandB, 'name' => 'BrandB-'.Str::random(4), 'created_at' => now(), 'updated_at' => now()],
        ]);
        $modelA = (string) Str::uuid();
        $modelB = (string) Str::uuid();
        \DB::table('vehicle_models')->insert([
            ['id' => $modelA, 'brand_id' => $brandA, 'name' => 'ModelA-'.Str::random(4), 'created_at' => now(), 'updated_at' => now()],
            ['id' => $modelB, 'brand_id' => $brandB, 'name' => 'ModelB-'.Str::random(4), 'created_at' => now(), 'updated_at' => now()],
        ]);

        return [$brandA, $brandB, $modelA, $modelB];
    }

    public function test_vehicle_create_rejects_model_not_belonging_to_brand(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        [$brandA, $brandB, $modelA, $modelB] = $this->seedBrandsAndModels();
        $user = $this->admin();

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles', [
            'registration' => 'REG-VAL-'.strtoupper(Str::random(6)),
            'brand_id' => $brandA,
            'model_id' => $modelB,
            'mileage_km' => 1000,
        ]);

        $response->assertStatus(422);
    }

    public function test_vehicle_create_succeeds_with_matching_brand_and_model_uuids(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        [$brandA, , $modelA] = $this->seedBrandsAndModels();
        $user = $this->admin();

        $reg = 'REG-OK-'.strtoupper(Str::random(6));
        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles', [
            'registration' => $reg,
            'brand_id' => $brandA,
            'model_id' => $modelA,
            'mileage_km' => 5000,
        ]);

        $response->assertCreated();
        $this->assertDatabaseHas('vehicles', [
            'registration_number' => $reg,
            'brand_id' => $brandA,
            'model_id' => $modelA,
        ]);
    }

    public function test_vehicle_update_rejects_wrong_model_for_brand(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        [$brandA, $brandB, $modelA, $modelB] = $this->seedBrandsAndModels();
        $user = $this->admin();

        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'registration_number' => 'REG-VEH-'.strtoupper(Str::random(6)),
            'brand_id' => $brandA,
            'model_id' => $modelA,
            'status' => 'AVAILABLE',
            'mileage_current' => 10000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $vehicle = Vehicle::query()->findOrFail($vehicleId);

        $response = $this->actingAs($user, 'sanctum')->putJson('/api/v1/vehicles/'.$vehicle->id, [
            'brand_id' => $brandA,
            'model_id' => $modelB,
        ]);

        $response->assertStatus(422);
    }
}
