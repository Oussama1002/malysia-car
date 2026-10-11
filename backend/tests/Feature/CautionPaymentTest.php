<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Contract;
use App\Models\ContractDeposit;
use App\Models\Reservation;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Une caution saisie depuis Paiements doit se retrouver dans les franchises :
 * c'est la même garantie, saisie à un autre endroit.
 */
class CautionPaymentTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->companyId = (string) Str::uuid();
        DB::table('companies')->insert([
            'id' => $this->companyId, 'legal_name' => 'DriveFlow Test',
            'created_at' => now(), 'updated_at' => now(),
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
        DB::table('customers')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'customer_code' => 'CL-'.Str::random(5), 'customer_type' => 'PARTICULIER',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeVehicle(): string
    {
        $id = (string) Str::uuid();
        DB::table('vehicles')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'registration_number' => 'A-'.Str::random(6).'-B',
            'status' => 'AVAILABLE', 'ownership_status' => 'owned', 'year' => 2022,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_a_caution_payment_is_recorded_as_a_franchise(): void
    {
        $user = $this->makeUser();
        $customerId = $this->makeCustomer();
        $vehicleId = $this->makeVehicle();

        $reservation = Reservation::query()->create([
            'id' => (string) Str::uuid(), 'company_id' => $this->companyId,
            'reservation_number' => 'RSV-'.Str::random(6),
            'customer_id' => $customerId, 'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL', 'status' => 'confirmed',
            'desired_start_at' => now()->toDateTimeString(),
            'desired_end_at' => now()->addDays(3)->toDateTimeString(),
            'estimated_price' => 3000,
        ]);
        $contract = Contract::query()->create([
            'id' => (string) Str::uuid(), 'company_id' => $this->companyId,
            'contract_number' => 'CTR-'.Str::random(6), 'contract_type' => 'LOCATION_COURTE',
            'customer_id' => $customerId, 'vehicle_id' => $vehicleId,
            'reservation_id' => $reservation->id, 'status' => 'active',
            'start_date' => now()->toDateString(), 'end_date' => now()->addDays(3)->toDateString(),
            'base_amount' => 3000, 'deposit_amount' => 5000,
        ]);

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', [
            'customer_id' => $customerId,
            'contract_id' => $contract->id,
            'reservation_id' => $reservation->id,
            'payment_method' => 'cash',
            'payment_type' => 'caution',
            'amount' => 5000,
            'payment_date' => now()->toDateString(),
        ]);

        $res->assertStatus(201);

        $deposit = ContractDeposit::query()->where('reservation_id', $reservation->id)->first();
        $this->assertNotNull($deposit, 'la caution doit apparaître dans les franchises');
        $this->assertSame('held', $deposit->status);
        $this->assertSame(5000.0, (float) $deposit->amount);
        $this->assertSame($res->json('data.id'), $deposit->source_payment_id);
    }

    public function test_a_caution_is_not_allocated_to_an_invoice(): void
    {
        $user = $this->makeUser();
        $customerId = $this->makeCustomer();

        $res = $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', [
            'customer_id' => $customerId,
            'payment_method' => 'cash',
            'payment_type' => 'caution',
            'amount' => 4000,
            'payment_date' => now()->toDateString(),
        ]);

        $res->assertStatus(201);
        $this->assertSame(0.0, (float) $res->json('data.amount_allocated'));
    }
}
