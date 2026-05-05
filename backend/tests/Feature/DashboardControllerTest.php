<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardControllerTest extends TestCase
{
    use RefreshDatabase;

    private function makeAdmin(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Dashboard Admin',
            'email' => 'dash-'.Str::lower(Str::random(8)).'@test.com',
            'password' => Hash::make('password'),
            'role' => 'ADMIN',
        ]);
    }

    private function seedKpiDataset(): void
    {
        $customerId = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $customerId,
            'customer_code' => 'CUST-DASH-1',
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $brandId = (string) Str::uuid();
        \DB::table('vehicle_brands')->insert([
            'id' => $brandId,
            'name' => 'BrandDash'.Str::random(4),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $modelId = (string) Str::uuid();
        \DB::table('vehicle_models')->insert([
            'id' => $modelId,
            'brand_id' => $brandId,
            'name' => 'ModelDash'.Str::random(4),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'registration_number' => 'DASH-'.strtoupper(Str::random(6)),
            'brand_id' => $brandId,
            'model_id' => $modelId,
            'brand_name' => null,
            'model_name' => null,
            'mileage_current' => 150000,
            'status' => 'AVAILABLE',
            'book_value' => 50000,
            'purchase_price' => 60000,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $issue = now()->subDays(5)->toDateString();
        $due = now()->subDays(2)->toDateString();
        $invoiceId = (string) Str::uuid();
        \DB::table('invoices')->insert([
            'id' => $invoiceId,
            'invoice_number' => 'INV-DASH-'.strtoupper(Str::random(6)),
            'invoice_type' => 'contract',
            'customer_id' => $customerId,
            'issue_date' => $issue,
            'due_date' => $due,
            'currency_code' => 'MAD',
            'subtotal_amount' => 1000,
            'tax_amount' => 0,
            'discount_amount' => 0,
            'total_amount' => 1000,
            'amount_paid' => 750,
            'amount_due' => 250,
            'status' => 'issued',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $paymentId = (string) Str::uuid();
        \DB::table('payments')->insert([
            'id' => $paymentId,
            'payment_number' => 'PAY-DASH-'.strtoupper(Str::random(6)),
            'customer_id' => $customerId,
            'payment_method' => 'bank_transfer',
            'payment_direction' => 'incoming',
            'amount' => 750,
            'currency_code' => 'MAD',
            'amount_allocated' => 750,
            'amount_unallocated' => 0,
            'status' => 'allocated',
            'payment_date' => now()->subDay()->toDateString(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \DB::table('payment_allocations')->insert([
            'id' => (string) Str::uuid(),
            'payment_id' => $paymentId,
            'invoice_id' => $invoiceId,
            'amount_allocated' => 750,
            'allocated_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \DB::table('credit_applications')->insert([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'application_type' => 'lease',
            'requested_amount' => 100000,
            'decision_status' => 'draft',
            'scoring_status' => 'pending',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        \DB::table('gps_alerts')->insert([
            'id' => (string) Str::uuid(),
            'vehicle_id' => $vehicleId,
            'gps_device_id' => null,
            'alert_type' => 'speeding',
            'severity' => 'medium',
            'title' => 'Speed',
            'description' => null,
            'triggered_at' => now(),
            'resolved_at' => null,
            'resolved_by' => null,
            'status' => 'open',
            'metadata_json' => null,
            'created_at' => now(),
        ]);

        \DB::table('vehicle_maintenance_events')->insert([
            'vehicle_id' => $vehicleId,
            'type' => 'OIL_CHANGE',
            'title' => 'Vidange',
            'description' => null,
            'performed_at' => now()->subDays(3)->toDateString(),
            'odometer_km' => 149000,
            'vendor' => null,
            'cost_mad' => 450.5,
            'created_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $deviceId = (string) Str::uuid();
        \DB::table('gps_devices')->insert([
            'id' => $deviceId,
            'device_imei' => 'IMEI-'.Str::random(10),
            'status' => 'active',
            'last_seen_at' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    public function test_dashboard_endpoints_return_200_without_sql_errors(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeAdmin();
        $this->seedKpiDataset();

        $from = now()->subDays(60)->toDateString();
        $to = now()->addDay()->toDateString();
        $q = http_build_query(['range' => 'custom', 'from' => $from, 'to' => $to]);

        foreach (['executive', 'finance', 'risk', 'fleet', 'gps'] as $segment) {
            $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/dashboard/{$segment}?{$q}");
            $response->assertOk();
            $this->assertIsArray($response->json('data'), "dashboard {$segment} should return data array");
        }
    }

    public function test_finance_kpis_match_seeded_invoice_and_payment(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeAdmin();
        $this->seedKpiDataset();

        $from = now()->subDays(30)->toDateString();
        $to = now()->addDay()->toDateString();
        $q = http_build_query(['range' => 'custom', 'from' => $from, 'to' => $to]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/dashboard/finance?{$q}");
        $response->assertOk();

        $this->assertEquals(1000.0, (float) $response->json('data.invoiced.total'));
        $this->assertEquals(750.0, (float) $response->json('data.invoiced.paid'));
        $this->assertEquals(750.0, (float) $response->json('data.invoiced.invoice_amount_paid_field'));
        $this->assertEquals(250.0, (float) $response->json('data.invoiced.outstanding'));
        $this->assertEquals(250.0, (float) $response->json('data.overdue.amount'));
        $response->assertJsonPath('data.overdue.count', 1);
    }

    public function test_executive_fleet_value_uses_vehicle_book_or_purchase(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeAdmin();
        $this->seedKpiDataset();

        $from = now()->subDays(30)->toDateString();
        $to = now()->addDay()->toDateString();
        $q = http_build_query(['range' => 'custom', 'from' => $from, 'to' => $to]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/dashboard/executive?{$q}");
        $response->assertOk();
        $this->assertEquals(50000.0, (float) $response->json('data.kpis.fleet_value_mad'));
    }

    public function test_gps_top_speeding_resolves_brand_model_from_joins(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeAdmin();
        $this->seedKpiDataset();

        $from = now()->subDays(7)->toDateString();
        $to = now()->addDay()->toDateString();
        $q = http_build_query(['range' => 'custom', 'from' => $from, 'to' => $to]);

        $response = $this->actingAs($user, 'sanctum')->getJson("/api/v1/dashboard/gps?{$q}");
        $response->assertOk();

        $top = $response->json('data.top_speeding');
        $this->assertNotEmpty($top);
        $this->assertNotEmpty($top[0]['brand_name']);
        $this->assertNotEmpty($top[0]['model_name']);
    }
}
