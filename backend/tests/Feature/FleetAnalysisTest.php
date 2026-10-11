<?php

namespace Tests\Feature;

use App\Services\FleetAnalysisService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Les compteurs du parc et le CA doivent refléter la réalité. */
class FleetAnalysisTest extends TestCase
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
    }

    private function makeVehicle(array $overrides = []): string
    {
        $brandId = (string) Str::uuid();
        DB::table('vehicle_brands')->insert([
            'id' => $brandId, 'name' => 'Dacia '.Str::random(5), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $modelId = (string) Str::uuid();
        DB::table('vehicle_models')->insert([
            'id' => $modelId, 'brand_id' => $brandId, 'name' => 'Logan '.Str::random(5),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $id = (string) Str::uuid();
        DB::table('vehicles')->insert(array_merge([
            'id' => $id,
            'company_id' => $this->companyId,
            'brand_id' => $brandId,
            'model_id' => $modelId,
            'registration_number' => 'A-'.Str::random(6).'-B',
            'status' => 'AVAILABLE',
            'ownership_status' => 'owned',
            'created_at' => now(),
            'updated_at' => now(),
        ], $overrides));

        return $id;
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

    public function test_the_counters_follow_the_real_state_of_the_fleet(): void
    {
        $free = $this->makeVehicle();
        $busy = $this->makeVehicle();
        $subRented = $this->makeVehicle(['ownership_status' => 'sub_rented']);
        $garage = $this->makeVehicle(['status' => 'MAINTENANCE']);

        DB::table('reservations')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'reservation_number' => 'RSV-0001',
            'customer_id' => $this->makeCustomer(),
            'vehicle_id' => $busy,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'active',
            'desired_start_at' => now()->subDay(),
            'desired_end_at' => now()->addDays(3),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $kpis = app(FleetAnalysisService::class)->analyze($this->companyId)['kpis'];

        $this->assertSame(4, $kpis['totalVehicles']);
        $this->assertSame(1, $kpis['rentedVehiclesApprox'], 'la voiture en location doit être comptée');
        $this->assertSame(1, $kpis['vehiclesInMaintenance']);
        $this->assertSame(1, $kpis['subRentedVehicles'], 'la sous-location doit être comptée');
        $this->assertSame(2, $kpis['availableVehicles'], 'restent la libre et la sous-louée');
        $this->assertSame(25.0, $kpis['utilizationRatePct'], '1 véhicule sur 4');
        $this->assertNotSame($free, $garage);
        $this->assertNotSame($subRented, $busy);
    }

    public function test_the_revenue_counts_the_payments_received(): void
    {
        $vehicleId = $this->makeVehicle();
        $customerId = $this->makeCustomer();

        $reservationId = (string) Str::uuid();
        DB::table('reservations')->insert([
            'id' => $reservationId,
            'company_id' => $this->companyId,
            'reservation_number' => 'RSV-0002',
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_type' => 'SHORT_RENTAL',
            'status' => 'active',
            'desired_start_at' => now(),
            'desired_end_at' => now()->addDays(3),
            'estimated_price' => 3000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        foreach ([['PAY-1', 1200, 'paiement_location'], ['PAY-2', 800, null], ['PAY-3', 5000, 'caution']] as [$number, $amount, $type]) {
            DB::table('payments')->insert([
                'id' => (string) Str::uuid(),
                'company_id' => $this->companyId,
                'payment_number' => $number,
                'customer_id' => $customerId,
                'reservation_id' => $reservationId,
                'payment_method' => 'cash',
                'payment_type' => $type,
                'payment_direction' => 'incoming',
                'amount' => $amount,
                'currency_code' => 'MAD',
                'amount_allocated' => 0,
                'amount_unallocated' => $amount,
                'status' => 'received',
                'payment_date' => now()->toDateString(),
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        $rows = app(FleetAnalysisService::class)->analyze($this->companyId)['vehicles'];
        $row = collect($rows)->firstWhere('vehicleId', $vehicleId);

        // 1 200 + 800 encaissés ; la caution de 5 000 est une garantie.
        $this->assertSame(2000.0, (float) $row['revenue']);
    }

    public function test_each_row_carries_the_brand_the_model_and_the_photo(): void
    {
        $vehicleId = $this->makeVehicle();

        $rows = app(FleetAnalysisService::class)->analyze($this->companyId)['vehicles'];
        $row = collect($rows)->firstWhere('vehicleId', $vehicleId);

        $this->assertStringStartsWith('Dacia', (string) $row['brand']);
        $this->assertStringStartsWith('Logan', (string) $row['model']);
        $this->assertArrayHasKey('photoUrl', $row);
    }
}
