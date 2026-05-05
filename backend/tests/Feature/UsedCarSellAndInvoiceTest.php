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

class UsedCarSellAndInvoiceTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $role = 'ADMIN'): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'VO Test',
            'email' => 'vo-'.Str::lower(Str::random(6)).'@test.com',
            'password' => Hash::make('password'),
            'role' => $role,
        ]);
    }

    private function makeCustomer(): string
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

    private function makeVehicleAndListing(): array
    {
        $vehicleId = (string) Str::uuid();
        DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'registration_number' => 'VO-'.strtoupper(Str::random(6)),
            'status' => 'active',
            'availability_status' => 'for_sale',
            'purchase_price' => 80000,
            'book_value' => 70000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $listingId = (string) Str::uuid();
        DB::table('used_car_listings')->insert([
            'id' => $listingId,
            'vehicle_id' => $vehicleId,
            'listing_code' => 'VO-'.strtoupper(Str::random(8)),
            'stage' => 'published',
            'asking_price' => 120000,
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$vehicleId, $listingId];
    }

    public function test_sell_and_invoice_creates_invoice_and_payment_allocation(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('ADMIN');
        $buyerId = $this->makeCustomer();
        [, $listingId] = $this->makeVehicleAndListing();

        $response = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/used-cars/listings/{$listingId}/sell-and-invoice", [
                'buyer_customer_id' => $buyerId,
                'sale_price' => 130000,
                'discount_amount' => 5000,
                'vat_mode' => 'standard',
                'vat_rate' => 20,
                'payment_method' => 'bank_transfer',
                'amount_paid' => 20000,
            ]);

        $response->assertStatus(201);
        $this->assertDatabaseHas('used_car_sales', ['listing_id' => $listingId, 'invoice_id' => $response->json('data.sale.invoice_id')]);
        $this->assertDatabaseHas('invoices', ['id' => $response->json('data.sale.invoice_id'), 'invoice_type' => 'sale']);
        $this->assertDatabaseHas('payments', ['customer_id' => $buyerId]);
        $this->assertDatabaseHas('payment_allocations', ['invoice_id' => $response->json('data.sale.invoice_id')]);
    }

    public function test_sell_and_invoice_rejects_vehicle_with_active_contract(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('ADMIN');
        $buyerId = $this->makeCustomer();
        [$vehicleId, $listingId] = $this->makeVehicleAndListing();

        DB::table('contracts')->insert([
            'id' => (string) Str::uuid(),
            'contract_number' => 'CTR-'.strtoupper(Str::random(8)),
            'contract_type' => 'lease',
            'customer_id' => $buyerId,
            'vehicle_id' => $vehicleId,
            'status' => 'active',
            'currency_code' => 'MAD',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/used-cars/listings/{$listingId}/sell-and-invoice", [
                'buyer_customer_id' => $buyerId,
                'sale_price' => 100000,
                'payment_method' => 'cash',
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Vehicle has an active contract and cannot be sold.');
    }

    public function test_transfer_completion_blocked_when_invoice_unpaid(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('ADMIN');
        $buyerId = $this->makeCustomer();
        [, $listingId] = $this->makeVehicleAndListing();

        $saleResponse = $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/used-cars/listings/{$listingId}/sell-and-invoice", [
                'buyer_customer_id' => $buyerId,
                'sale_price' => 120000,
                'payment_method' => 'bank_transfer',
                'amount_paid' => 0,
            ])
            ->assertStatus(201);

        $transferId = $saleResponse->json('data.transfer.id');
        $response = $this->actingAs($user, 'sanctum')
            ->putJson("/api/v1/vehicle-ownership-transfers/{$transferId}", [
                'transfer_status' => 'completed',
            ]);

        $response->assertStatus(422);
        $response->assertJsonPath('message', 'Cannot complete transfer while sale invoice is unpaid.');
    }
}

