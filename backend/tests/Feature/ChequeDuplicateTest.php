<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Payment;
use App\Models\User;
use App\Support\ChequeRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/** A physical cheque is cashed once, wherever it is entered. */
class ChequeDuplicateTest extends TestCase
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
            'name' => 'Agent',
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

    private function payload(string $customerId, array $overrides = []): array
    {
        return array_merge([
            'customer_id' => $customerId,
            'payment_method' => 'check',
            'amount' => 5000,
            'payment_date' => now()->toDateString(),
            'check_number' => '283359',
            'check_bank' => 'CIH Bank',
        ], $overrides);
    }

    public function test_the_same_cheque_cannot_be_paid_twice(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', $this->payload($customer))->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer))
            ->assertStatus(422)
            ->assertJsonPath('errors.check_number.0', fn ($m) => str_contains((string) $m, 'déjà enregistré'));

        $this->assertSame(1, Payment::query()->where('check_number', '283359')->count());
    }

    /** The hole that let a cheque through: the bank typed only once. */
    public function test_a_missing_bank_on_one_side_is_still_the_same_cheque(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer, ['check_bank' => null]))
            ->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer, ['check_bank' => 'CIH Bank']))
            ->assertStatus(422);
    }

    public function test_a_different_bank_is_a_different_cheque(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', $this->payload($customer))->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer, ['check_bank' => 'Al Barid Bank']))
            ->assertStatus(201);
    }

    public function test_another_number_goes_through(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', $this->payload($customer))->assertStatus(201);
        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer, ['check_number' => '283360']))
            ->assertStatus(201);
    }

    /** Le même chèque sur une autre réservation reste le même chèque. */
    public function test_the_same_cheque_on_another_reservation_is_refused(): void
    {
        $user = $this->makeUser();
        $first = $this->makeCustomer();
        $second = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', $this->payload($first))->assertStatus(201);

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($second))
            ->assertStatus(422);
    }

    /** Zéros de tête, espaces, casse : c'est le même numéro imprimé. */
    public function test_the_number_is_compared_as_a_human_reads_it(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/payments', $this->payload($customer, ['check_number' => '283359']))
            ->assertStatus(201);

        foreach (['0283359', '283 359', ' 283359 ', '00283359'] as $variant) {
            $this->actingAs($user, 'sanctum')
                ->postJson('/api/v1/payments', $this->payload($customer, ['check_number' => $variant]))
                ->assertStatus(422, 'variante acceptée à tort : '.$variant);
        }
    }

    public function test_the_registry_spans_the_franchise_and_the_supplier_payment(): void
    {
        $user = $this->makeUser();
        $customer = $this->makeCustomer();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', $this->payload($customer))->assertStatus(201);

        // Entered as a client payment, so neither a franchise nor a supplier
        // payment may reuse it.
        $this->assertNotNull(ChequeRegistry::duplicateMessage('283359', 'CIH Bank'));
        $this->assertNotNull(ChequeRegistry::duplicateMessage('283359', null));
        $this->assertNull(ChequeRegistry::duplicateMessage('999999', 'CIH Bank'));
    }
}
