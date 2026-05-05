<?php

namespace Tests\Feature;

use App\Models\Reservation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class ReservationAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_rejects_overlapping_reservation_for_same_vehicle(): void
    {
        $this->withoutMiddleware();
        $user = User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Test User',
            'email' => 'test@example.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);

        $customerId = (string) Str::uuid();
        $vehicleId = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $customerId,
            'customer_code' => 'CUST-TEST-1',
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'registration_number' => 'TEST-12345',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'reservation_number' => 'RSV-TEST-001',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'reserved',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(3),
        ]);

        $vehicleId = Reservation::query()->firstOrFail()->vehicle_id;

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/reservations', [
            'customer_id' => (string) Str::uuid(),
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'desired_start_at' => now()->addDays(2)->toISOString(),
            'desired_end_at' => now()->addDays(4)->toISOString(),
        ]);

        $response->assertStatus(422);
        $response->assertJsonPath('errors.vehicle_id.0', 'Another reservation overlaps this period.');
        $response->assertJsonPath('errors.rental.0', 'overlapping_reservation');
    }
}

