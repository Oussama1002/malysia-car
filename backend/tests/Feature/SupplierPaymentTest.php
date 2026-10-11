<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Enregistrer un paiement fournisseur sur une sous-location. */
class SupplierPaymentTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->companyId = (string) Str::uuid();
        DB::table('companies')->insert([
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
            'name' => 'Agent',
            'email' => 'agent.'.Str::random(6).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $this->companyId,
        ]);
    }

    private function makeContract(): string
    {
        $agencyId = (string) Str::uuid();
        DB::table('supplier_agencies')->insert([
            'id' => $agencyId,
            'company_id' => $this->companyId,
            'name' => 'Softnovation',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $id = (string) Str::uuid();
        DB::table('sub_rental_contracts')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'supplier_agency_id' => $agencyId,
            'contract_number' => 'SL-'.strtoupper(Str::random(8)),
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(60)->toDateString(),
            'daily_cost' => 500,
            'total_cost' => 31000,
            'payment_method' => 'cash',
            'payment_status' => 'unpaid',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_a_cash_supplier_payment_is_recorded(): void
    {
        $user = $this->makeUser();
        $contractId = $this->makeContract();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount' => 5000,
                'payment_method' => 'cash',
                'payment_date' => now()->toDateString(),
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.total_paid', 5000);
    }

    public function test_a_cheque_supplier_payment_is_recorded(): void
    {
        $user = $this->makeUser();
        $contractId = $this->makeContract();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount' => 7000,
                'payment_method' => 'cheque',
                'payment_date' => now()->toDateString(),
                'check_number' => '556677',
                'check_bank' => 'CIH Bank',
                'check_date' => now()->toDateString(),
            ])
            ->assertStatus(201);
    }

    public function test_the_same_cheque_is_refused_on_a_supplier_payment(): void
    {
        $user = $this->makeUser();
        $contractId = $this->makeContract();

        $payload = [
            'amount' => 7000,
            'payment_method' => 'cheque',
            'payment_date' => now()->toDateString(),
            'check_number' => '556677',
            'check_bank' => 'CIH Bank',
        ];

        $this->actingAs($user, 'sanctum')->postJson("/api/v1/sub-rentals/{$contractId}/payments", $payload)->assertStatus(201);
        $this->actingAs($user, 'sanctum')->postJson("/api/v1/sub-rentals/{$contractId}/payments", $payload)->assertStatus(422);
    }

    public function test_the_payments_list_totals_what_was_paid(): void
    {
        $user = $this->makeUser();
        $contractId = $this->makeContract();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount' => 6000,
                'payment_method' => 'cash',
                'payment_date' => now()->toDateString(),
            ])
            ->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/sub-rentals/{$contractId}/payments")
            ->assertOk()
            ->assertJsonPath('data.total_paid', 6000)
            ->assertJsonPath('data.remaining_balance', 25000);
    }
}
