<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Payment;
use App\Models\User;
use App\Support\ChequeRegistry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Un chèque rejeté reste dans l'historique du client — l'effacer laissait un
 * trou — mais il ne compte plus dans ce qui a été payé.
 */
class BouncedChequeTest extends TestCase
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
            'name' => 'Comptable',
            'email' => 'comptable.'.Str::random(6).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $this->companyId,
        ]);
    }

    private function makeCustomer(): string
    {
        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'customer_code' => 'CL-'.Str::random(5),
            'customer_type' => 'PARTICULIER',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeChequePayment(User $user, string $customerId): Payment
    {
        $res = $this->actingAs($user, 'sanctum')->postJson('/api/v1/payments', [
            'customer_id' => $customerId,
            'payment_method' => 'check',
            'amount' => 3000,
            'payment_date' => now()->toDateString(),
            'check_number' => '771100',
            'check_bank' => 'CIH Bank',
        ]);
        $res->assertStatus(201);

        return Payment::query()->findOrFail($res->json('data.id'));
    }

    public function test_a_bounced_cheque_stays_in_the_history(): void
    {
        $user = $this->makeUser();
        $payment = $this->makeChequePayment($user, $this->makeCustomer());

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payments/{$payment->id}/cheque-status", [
                'cheque_status' => 'bounced',
                'bounce_reason' => 'Provision insuffisante',
            ])
            ->assertOk();

        $fresh = Payment::query()->find($payment->id);

        $this->assertNotNull($fresh, 'le paiement ne doit pas disparaître');
        $this->assertNull($fresh->deleted_at, 'il ne doit plus être effacé');
        $this->assertSame('reversed', $fresh->status);
        $this->assertSame('bounced', $fresh->cheque_status);
        $this->assertSame('Provision insuffisante', $fresh->cheque_bounce_reason);
    }

    public function test_it_stops_counting_as_money_received(): void
    {
        $user = $this->makeUser();
        $customerId = $this->makeCustomer();
        $payment = $this->makeChequePayment($user, $customerId);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payments/{$payment->id}/cheque-status", ['cheque_status' => 'bounced'])
            ->assertOk();

        $balance = $this->actingAs($user, 'sanctum')
            ->getJson("/api/v1/customers/{$customerId}/balance")
            ->assertOk();

        $this->assertSame(0.0, (float) $balance->json('data.unallocated_payments'));
    }

    public function test_its_cheque_number_becomes_free_again(): void
    {
        $user = $this->makeUser();
        $payment = $this->makeChequePayment($user, $this->makeCustomer());

        $this->assertNotNull(ChequeRegistry::duplicateMessage('771100', 'CIH Bank'));

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/payments/{$payment->id}/cheque-status", ['cheque_status' => 'bounced'])
            ->assertOk();

        $this->assertNull(
            ChequeRegistry::duplicateMessage('771100', 'CIH Bank'),
            'un chèque rejeté doit pouvoir être remplacé par un autre portant le même numéro',
        );
    }
}
