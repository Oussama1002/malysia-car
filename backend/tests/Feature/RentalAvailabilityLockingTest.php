<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class RentalAvailabilityLockingTest extends TestCase
{
    use RefreshDatabase;

    private function seedUser(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Rental Lock Test',
            'email' => 'rent-lock-'.Str::lower(Str::random(8)).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);
    }

    private function seedCustomer(): string
    {
        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id,
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

    private function seedVehicle(string $status = 'AVAILABLE', string $availabilityStatus = 'available'): string
    {
        $id = (string) Str::uuid();
        DB::table('vehicles')->insert([
            'id' => $id,
            'registration_number' => 'TEST-'.strtoupper(Str::random(8)),
            'status' => $status,
            'availability_status' => $availabilityStatus,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_non_overlapping_reservations_allowed(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $c1 = $this->seedCustomer();
        $c2 = $this->seedCustomer();
        $vehicleId = $this->seedVehicle();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/reservations', [
            'customer_id' => $c1,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'desired_start_at' => now()->addDay()->toISOString(),
            'desired_end_at' => now()->addDays(2)->toISOString(),
        ])->assertStatus(201);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/reservations', [
            'customer_id' => $c2,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'desired_start_at' => now()->addDays(3)->toISOString(),
            'desired_end_at' => now()->addDays(5)->toISOString(),
        ])->assertStatus(201);

        $this->assertSame(2, Reservation::query()->where('vehicle_id', $vehicleId)->count());
    }

    public function test_cannot_reserve_vehicle_in_maintenance_status(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $customerId = $this->seedCustomer();
        $vehicleId = $this->seedVehicle('MAINTENANCE');

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/reservations', [
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'desired_start_at' => now()->addDay()->toISOString(),
            'desired_end_at' => now()->addDays(2)->toISOString(),
        ])->assertStatus(422)
            ->assertJsonPath('errors.rental.0', 'vehicle_status_unavailable');
    }

    public function test_availability_endpoint_reports_conflict(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $customerId = $this->seedCustomer();
        $vehicleId = $this->seedVehicle();

        Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'reservation_number' => 'RSV-OVR-001',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'reserved',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(3),
        ]);

        $start = now()->addDays(2)->toISOString();
        $end = now()->addDays(4)->toISOString();

        $this->actingAs($user, 'sanctum')->getJson('/api/v1/rentals/availability?'.http_build_query([
            'vehicle_id' => $vehicleId,
            'start_at' => $start,
            'end_at' => $end,
        ]))->assertOk()
            ->assertJsonPath('data.available', false)
            ->assertJsonPath('data.reasons.0', 'overlapping_reservation');
    }

    public function test_confirm_rechecks_overlap_under_lock(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $c1 = $this->seedCustomer();
        $c2 = $this->seedCustomer();
        $vehicleId = $this->seedVehicle();

        $r1 = Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'reservation_number' => 'RSV-A-001',
            'customer_id' => $c1,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'reserved',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(3),
        ]);

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/reservations/{$r1->id}/confirm", [])->assertOk();

        $r2 = Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'reservation_number' => 'RSV-B-002',
            'customer_id' => $c2,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'reserved',
            'desired_start_at' => now()->addDays(2),
            'desired_end_at' => now()->addDays(4),
        ]);

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/reservations/{$r2->id}/confirm", [])
            ->assertStatus(422)
            ->assertJsonPath('errors.rental.0', 'overlapping_reservation');
    }

    public function test_cannot_activate_contract_when_reservation_blocks_vehicle(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $customerId = $this->seedCustomer();
        $vehicleId = $this->seedVehicle();

        Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'reservation_number' => 'RSV-BLK-CTR',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'confirmed',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(10),
        ]);

        $contractId = (string) Str::uuid();
        DB::table('contracts')->insert([
            'id' => $contractId,
            'contract_number' => 'CTR-'.strtoupper(Str::random(8)),
            'contract_type' => 'lease',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'status' => 'approved',
            'currency_code' => 'MAD',
            'payment_method' => 'bank_transfer',
            'start_date' => now()->addDays(2)->toDateString(),
            'end_date' => now()->addMonths(6)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/contracts/{$contractId}/activate", [])
            ->assertStatus(422)
            ->assertJsonPath('errors.rental.0', 'overlapping_reservation');
    }

    public function test_can_activate_contract_when_no_rental_conflict(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->seedUser();
        $customerId = $this->seedCustomer();
        $vehicleId = $this->seedVehicle();

        $contractId = (string) Str::uuid();
        DB::table('contracts')->insert([
            'id' => $contractId,
            'contract_number' => 'CTR-'.strtoupper(Str::random(8)),
            'contract_type' => 'lease',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'status' => 'approved',
            'currency_code' => 'MAD',
            'payment_method' => 'bank_transfer',
            'start_date' => now()->addDays(30)->toDateString(),
            'end_date' => now()->addMonths(12)->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/contracts/{$contractId}/activate", [])
            ->assertOk();
    }
}
