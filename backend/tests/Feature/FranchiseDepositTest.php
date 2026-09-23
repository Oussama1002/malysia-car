<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Franchise d'assurance: a guarantee, not an encaissement. It gates the
 * handover and is released once the vehicle comes back fine.
 */
class FranchiseDepositTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->companyId = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $this->companyId,
            'legal_name' => 'DriveFlow Test',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
    }

    private function makeUser(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Agent Test',
            'email' => 'agent.'.Str::random(6).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $this->companyId,
        ]);
    }

    private function makeCustomer(): string
    {
        $id = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'customer_code' => 'CL-'.Str::random(5),
            'customer_type' => 'PARTICULIER',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeVehicle(): string
    {
        $brandId = (string) Str::uuid();
        \DB::table('vehicle_brands')->insert([
            'id' => $brandId, 'name' => 'Dacia '.Str::random(4),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $modelId = (string) Str::uuid();
        \DB::table('vehicle_models')->insert([
            'id' => $modelId, 'brand_id' => $brandId,
            'name' => 'Logan '.Str::random(4), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $id = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'brand_id' => $brandId,
            'model_id' => $modelId,
            'registration_number' => 'A-'.Str::random(6).'-B',
            'status' => 'AVAILABLE',
            'ownership_status' => 'owned',
            'year' => 2022,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    /** @return array{0: Reservation, 1: Contract} */
    private function makeReservationWithFranchise(float $franchise): array
    {
        $reservation = Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'reservation_number' => 'RSV-'.Str::random(6),
            'customer_id' => $this->makeCustomer(),
            'vehicle_id' => $this->makeVehicle(),
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'confirmed',
            'desired_start_at' => now()->toDateTimeString(),
            'desired_end_at' => now()->addDays(3)->toDateTimeString(),
            'estimated_price' => 3000,
        ]);

        $contract = Contract::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'contract_number' => 'CTR-'.Str::random(6),
            'contract_type' => 'LOCATION_COURTE',
            'customer_id' => $reservation->customer_id,
            'vehicle_id' => $reservation->vehicle_id,
            'reservation_id' => $reservation->id,
            'status' => 'active',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(3)->toDateString(),
            'base_amount' => 3000,
            'deposit_amount' => $franchise,
        ]);

        return [$reservation, $contract];
    }

    public function test_handover_is_blocked_while_the_franchise_is_not_collected(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $res = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/handover-pickup", ['odometer' => 45000]);

        $res->assertStatus(422);
        $this->assertStringContainsString('Franchise', (string) $res->json('message'));
        $this->assertSame('confirmed', $reservation->fresh()->status);
    }

    public function test_handover_passes_once_the_franchise_is_held(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/deposits", [
                'amount' => 5000,
                'method' => 'cheque',
                'check_number' => '283359',
                'check_bank' => 'CIH Bank',
            ])
            ->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/handover-pickup", ['odometer' => 45000])
            ->assertStatus(201);

        $this->assertSame('active', $reservation->fresh()->status);
    }

    public function test_handover_is_free_when_the_contract_asks_for_no_franchise(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(0);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/handover-pickup", ['odometer' => 45000])
            ->assertStatus(201);
    }

    public function test_the_franchise_is_released_back_to_the_client(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $deposit = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/deposits", ['amount' => 5000, 'method' => 'cash'])
            ->json('data');

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deposits/{$deposit['id']}/release", [])
            ->assertOk()
            ->assertJsonPath('data.status', ContractDeposit::STATUS_RETURNED);
    }

    public function test_a_franchise_is_settled_once(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $deposit = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/deposits", ['amount' => 5000, 'method' => 'cash'])
            ->json('data');

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/deposits/{$deposit['id']}/release", [])->assertOk();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deposits/{$deposit['id']}/retain", ['notes' => 'Trop tard'])
            ->assertStatus(422);
    }

    public function test_retaining_a_franchise_requires_a_reason(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $deposit = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/deposits", ['amount' => 5000, 'method' => 'cash'])
            ->json('data');

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/deposits/{$deposit['id']}/retain", [])
            ->assertStatus(422);
    }

    public function test_the_franchise_is_not_counted_as_a_payment(): void
    {
        $user = $this->makeUser();
        [$reservation] = $this->makeReservationWithFranchise(5000);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/reservations/{$reservation->id}/deposits", ['amount' => 5000, 'method' => 'cash'])
            ->assertStatus(201);

        $res = $this->actingAs($user, 'sanctum')->getJson("/api/v1/reservations/{$reservation->id}");

        $res->assertOk();
        $this->assertSame(0.0, (float) $res->json('data.totals.paid'));
        $this->assertCount(0, $res->json('data.payments'));
        $this->assertCount(1, $res->json('data.deposits'));
    }
}
