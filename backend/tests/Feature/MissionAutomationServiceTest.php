<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\Mission;
use App\Models\Reservation;
use App\Services\MissionAutomationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class MissionAutomationServiceTest extends TestCase
{
    use RefreshDatabase;

    private function makeCompany(): string
    {
        $id = (string) Str::uuid();
        DB::table('companies')->insert([
            'id' => $id,
            'legal_name' => 'Auto Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeCustomer(string $companyId): string
    {
        return (string) Customer::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'customer_code' => 'CUST-' . strtoupper(Str::random(6)),
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => false,
            'preferred_language' => 'fr',
        ])->id;
    }

    private function makeVehicle(string $companyId): string
    {
        $id = (string) Str::uuid();
        DB::table('vehicles')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'registration_number' => 'REG-' . strtoupper(Str::random(7)),
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeReservation(): Reservation
    {
        $companyId = $this->makeCompany();

        return Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'customer_id' => $this->makeCustomer($companyId),
            'vehicle_id' => $this->makeVehicle($companyId),
            'reservation_number' => 'RSV-AUTO-' . strtoupper(Str::random(5)),
            'reservation_type' => 'rental',
            'status' => 'reserved',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(5),
            'pickup_address' => 'Agence Casablanca',
            'delivery_address' => 'Aéroport Mohammed V',
            'created_by' => null,
        ]);
    }

    public function test_reserved_reservation_creates_delivery_and_pickup_missions(): void
    {
        $r = $this->makeReservation();

        app(MissionAutomationService::class)->forReservationReserved($r);

        $missions = Mission::where('auto_source_type', 'reservation')
            ->where('auto_source_id', $r->id)
            ->get();

        $this->assertCount(2, $missions);
        $this->assertEqualsCanonicalizing(
            ['delivery', 'pickup'],
            $missions->pluck('mission_type')->all(),
        );

        $delivery = $missions->firstWhere('mission_type', 'delivery');
        $pickup = $missions->firstWhere('mission_type', 'pickup');

        // Delivery on start date, pickup on end date.
        $this->assertEquals($r->desired_start_at->toDateString(), $delivery->scheduled_start_at->toDateString());
        $this->assertEquals($r->desired_end_at->toDateString(), $pickup->scheduled_start_at->toDateString());

        // Unassigned + pending so they surface in agent + admin views.
        $this->assertNull($delivery->assigned_user_id);
        $this->assertEquals('pending', $delivery->status);

        // Linked to the reservation + vehicle.
        $this->assertEquals($r->id, $delivery->reservation_id);
        $this->assertEquals($r->vehicle_id, $delivery->vehicle_id);
    }

    public function test_automation_is_idempotent(): void
    {
        $r = $this->makeReservation();

        $svc = app(MissionAutomationService::class);
        $svc->forReservationReserved($r);
        $svc->forReservationReserved($r); // second firing must not duplicate

        $this->assertEquals(
            2,
            Mission::where('auto_source_type', 'reservation')->where('auto_source_id', $r->id)->count(),
        );
    }

    public function test_cancelled_mission_does_not_block_recreation(): void
    {
        $r = $this->makeReservation();
        $svc = app(MissionAutomationService::class);
        $svc->forReservationReserved($r);

        // Cancel the delivery mission → re-firing should create a fresh one.
        Mission::where('auto_source_id', $r->id)->where('mission_type', 'delivery')->update(['status' => 'cancelled']);
        $svc->forReservationReserved($r);

        $this->assertEquals(
            1,
            Mission::where('auto_source_id', $r->id)->where('mission_type', 'delivery')->where('status', '!=', 'cancelled')->count(),
        );
    }
}
