<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use App\Services\VehicleCostService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class MaintenanceSchemaAlignmentTest extends TestCase
{
    use RefreshDatabase;

    private function seedCompanyAndVehicle(): array
    {
        $companyId = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $companyId,
            'legal_name' => 'Maint Test Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'company_id' => $companyId,
            'registration_number' => 'REG-MNT-'.strtoupper(Str::random(6)),
            'status' => 'AVAILABLE',
            'mileage_current' => 12000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return [$companyId, $vehicleId];
    }

    private function admin(string $companyId): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Maint Admin',
            'email' => 'maint-'.Str::random(6).'@test.local',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
            'company_id' => $companyId,
            'branch_id' => null,
        ]);
    }

    public function test_create_maintenance_event_persists_cost_mad_and_performed_at(): void
    {
        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $payload = [
            'title' => 'Vidange',
            'type' => 'OIL_CHANGE',
            'performed_at' => now()->toDateString(),
            'cost_mad' => 275.5,
            'odometer_km' => 11980,
            'vendor' => 'Garage Central',
        ];

        $response = $this->actingAs($user, 'sanctum')
            ->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', $payload);

        $response->assertCreated();

        $row = \DB::table('vehicle_maintenance_events')
            ->where('vehicle_id', $vehicleId)
            ->first();

        $this->assertNotNull($row);
        $this->assertSame('OIL_CHANGE', $row->type);
        $this->assertSame(now()->toDateString(), \Carbon\Carbon::parse((string) $row->performed_at)->toDateString());
        $this->assertEqualsWithDelta(275.5, (float) $row->cost_mad, 0.001);
        $this->assertSame(11980, (int) $row->odometer_km);
        $this->assertSame('Garage Central', $row->vendor);
    }

    public function test_vehicle_cost_summary_sums_cost_mad(): void
    {
        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Pneus',
            'type' => 'TIRES',
            'performed_at' => now()->toDateString(),
            'cost_mad' => 100,
        ])->assertCreated();

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Freins',
            'type' => 'BRAKES',
            'performed_at' => now()->toDateString(),
            'cost_mad' => 40,
        ])->assertCreated();

        $vehicle = \App\Models\Vehicle::query()->findOrFail($vehicleId);
        $summary = app(VehicleCostService::class)->summary($vehicle);

        $this->assertSame(140.0, $summary['costs']['maintenance']);
    }

    public function test_dashboard_fleet_includes_maintenance_cost_from_events(): void
    {
        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Contrôle',
            'type' => 'TECH_CONTROL',
            'performed_at' => now()->toDateString(),
            'cost_mad' => 300,
        ])->assertCreated();

        $fleet = $this->actingAs($user, 'sanctum')->getJson('/api/v1/dashboard/fleet');

        $fleet->assertOk();
        $this->assertSame(300.0, (float) $fleet->json('data.maintenance_cost_period'));
    }

    public function test_legacy_payload_keys_are_mapped_to_canonical_columns(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Legacy',
            'event_type' => 'FILTER',
            'completed_date' => '2026-01-15',
            'cost_amount' => 88,
            'mileage_at_service' => 50000,
            'vendor_name' => 'Legacy SA',
        ]);

        $response->assertCreated();

        $row = \DB::table('vehicle_maintenance_events')->where('vehicle_id', $vehicleId)->first();
        $this->assertSame('FILTER', $row->type);
        $this->assertSame('2026-01-15', \Carbon\Carbon::parse((string) $row->performed_at)->toDateString());
        $this->assertEqualsWithDelta(88.0, (float) $row->cost_mad, 0.001);
        $this->assertSame(50000, (int) $row->odometer_km);
        $this->assertSame('Legacy SA', $row->vendor);
    }

    public function test_cost_mad_negative_is_rejected(): void
    {
        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Bad',
            'cost_mad' => -1,
        ]);

        $response->assertStatus(422);
    }

    public function test_legacy_event_date_and_cost_keys_map_to_canonical_columns(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/vehicles/'.$vehicleId.'/maintenance-events', [
            'title' => 'Legacy date/cost',
            'event_type' => 'BATTERY',
            'event_date' => '2026-03-20',
            'cost' => 199.25,
        ]);

        $response->assertCreated();

        $row = \DB::table('vehicle_maintenance_events')->where('vehicle_id', $vehicleId)->orderByDesc('id')->first();
        $this->assertSame('BATTERY', $row->type);
        $this->assertSame('2026-03-20', \Carbon\Carbon::parse((string) $row->performed_at)->toDateString());
        $this->assertEqualsWithDelta(199.25, (float) $row->cost_mad, 0.001);
    }

    public function test_maintenance_alerts_endpoint_returns_monthly_cost_total_without_sql_errors(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);

        [$companyId, $vehicleId] = $this->seedCompanyAndVehicle();
        $user = $this->admin($companyId);

        \DB::table('vehicle_maintenance_events')->insert([
            'vehicle_id' => $vehicleId,
            'type' => 'OIL_CHANGE',
            'title' => 'A',
            'performed_at' => now()->startOfMonth()->addDays(2)->toDateString(),
            'cost_mad' => 50,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        \DB::table('vehicle_maintenance_events')->insert([
            'vehicle_id' => $vehicleId,
            'type' => 'TIRES',
            'title' => 'B',
            'performed_at' => now()->startOfMonth()->addDays(10)->toDateString(),
            'cost_mad' => 75.5,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/v1/maintenance/alerts');
        $response->assertOk();
        $this->assertEqualsWithDelta(125.5, (float) $response->json('data.monthlyMaintenanceCost'), 0.001);
    }
}
