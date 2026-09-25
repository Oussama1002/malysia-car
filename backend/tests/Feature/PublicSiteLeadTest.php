<?php

namespace Tests\Feature;

use App\Models\WebsiteLead;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Le site public dépose une demande dans DriveFlow. Personne n'est authentifié
 * de l'autre côté : la porte doit rester étroite.
 */
class PublicSiteLeadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('companies')->insert([
            'id' => (string) Str::uuid(), 'legal_name' => 'Malysia Car',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_a_visitor_can_leave_a_reservation_request(): void
    {
        $res = $this->postJson('/api/v1/public/site/reservation-requests', [
            'full_name' => 'Sara Boutama',
            'phone' => '0612345678',
            'email' => 'sara@example.com',
            'vehicle_label' => 'Dacia Logan',
            'pickup_at' => now()->addDays(2)->toDateTimeString(),
            'return_at' => now()->addDays(5)->toDateTimeString(),
            'message' => 'Je souhaite une livraison à l\'aéroport.',
        ]);

        $res->assertStatus(201);
        $this->assertNotEmpty($res->json('data.reference'));

        $lead = WebsiteLead::query()->first();
        $this->assertSame('Sara Boutama', $lead->full_name);
        $this->assertSame('new', $lead->status);
        $this->assertNotNull($lead->company_id, 'la demande doit être rattachée à l\'agence');
    }

    public function test_a_request_without_a_phone_is_refused(): void
    {
        $this->postJson('/api/v1/public/site/reservation-requests', [
            'full_name' => 'Sans téléphone',
        ])->assertStatus(422);

        $this->assertSame(0, WebsiteLead::query()->count());
    }

    public function test_a_return_before_the_pickup_is_refused(): void
    {
        $this->postJson('/api/v1/public/site/reservation-requests', [
            'full_name' => 'Dates inversées',
            'phone' => '0600000000',
            'pickup_at' => now()->addDays(5)->toDateTimeString(),
            'return_at' => now()->addDays(2)->toDateTimeString(),
        ])->assertStatus(422);
    }

    public function test_a_bot_filling_the_honeypot_is_refused(): void
    {
        $this->postJson('/api/v1/public/site/reservation-requests', [
            'full_name' => 'Robot',
            'phone' => '0600000000',
            'website' => 'http://spam.example',
        ])->assertStatus(422);

        $this->assertSame(0, WebsiteLead::query()->count());
    }

    public function test_the_public_fleet_never_exposes_internal_figures(): void
    {
        $res = $this->getJson('/api/v1/public/site/vehicles')->assertOk();

        foreach ($res->json('data') ?? [] as $vehicle) {
            $this->assertArrayNotHasKey('purchase_price', $vehicle);
            $this->assertArrayNotHasKey('book_value', $vehicle);
            $this->assertArrayNotHasKey('insurance_deductible', $vehicle);
        }
    }
}
