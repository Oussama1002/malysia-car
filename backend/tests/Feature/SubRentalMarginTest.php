<?php

namespace Tests\Feature;

use App\Models\Reservation;
use App\Models\SubRentalContract;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Le tableau de bord sous-location affichait « marge = -coût » : le chiffre
 * d'affaires ne comptait que les locations terminées ET entièrement contenues
 * dans la période fournisseur, donc jamais celle qui roule.
 */
class SubRentalMarginTest extends TestCase
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
            'status' => 'AVAILABLE', 'ownership_status' => 'sub_rented', 'year' => 2022,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeAgency(): string
    {
        $id = (string) Str::uuid();
        DB::table('supplier_agencies')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'name' => 'Agence '.Str::random(4), 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeContract(string $vehicleId, float $cost, string $start, string $end): SubRentalContract
    {
        return SubRentalContract::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'supplier_agency_id' => $this->makeAgency(),
            'vehicle_id' => $vehicleId,
            'contract_number' => 'SL-'.Str::random(6),
            'start_date' => $start,
            'end_date' => $end,
            'daily_cost' => 500,
            'total_cost' => $cost,
            'status' => 'active',
        ]);
    }

    public function test_a_running_rental_counts_towards_the_revenue(): void
    {
        $vehicleId = $this->makeVehicle();
        $contract = $this->makeContract($vehicleId, 31000, now()->subDays(10)->toDateString(), now()->addDays(20)->toDateString());

        Reservation::query()->create([
            'id' => (string) Str::uuid(), 'company_id' => $this->companyId,
            'reservation_number' => 'RSV-'.Str::random(6),
            'customer_id' => $this->makeCustomer(), 'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL', 'status' => 'active',
            'desired_start_at' => now()->subDays(3)->toDateTimeString(),
            'desired_end_at' => now()->addDays(4)->toDateTimeString(),
            'estimated_price' => 40000,
        ]);

        $this->assertSame(40000.0, $contract->customerReservationsRevenue());
        $this->assertSame(9000.0, $contract->margin());
    }

    public function test_a_cancelled_rental_brings_nothing(): void
    {
        $vehicleId = $this->makeVehicle();
        $contract = $this->makeContract($vehicleId, 10000, now()->subDays(5)->toDateString(), now()->addDays(5)->toDateString());

        Reservation::query()->create([
            'id' => (string) Str::uuid(), 'company_id' => $this->companyId,
            'reservation_number' => 'RSV-'.Str::random(6),
            'customer_id' => $this->makeCustomer(), 'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL', 'status' => 'cancelled',
            'desired_start_at' => now()->subDays(2)->toDateTimeString(),
            'desired_end_at' => now()->addDays(2)->toDateTimeString(),
            'estimated_price' => 8000,
        ]);

        $this->assertSame(0.0, $contract->customerReservationsRevenue());
    }

    public function test_the_monthly_cost_is_only_the_part_that_falls_in_the_month(): void
    {
        // 10 jours à cheval : 5 en fin de mois précédent, 5 dans celui-ci.
        $start = now()->startOfMonth()->subDays(5);
        $end = now()->startOfMonth()->addDays(4);
        $contract = $this->makeContract($this->makeVehicle(), 10000, $start->toDateString(), $end->toDateString());

        $this->assertSame(
            5000.0,
            $contract->costForPeriod(now()->startOfMonth(), now()->endOfMonth()),
        );
    }
}
