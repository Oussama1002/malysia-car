<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\Expense;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Tout ce qui sort de la caisse arrive dans les Dépenses. */
class ExpenseFeedTest extends TestCase
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

    private function makeVehicle(): string
    {
        $brandId = (string) Str::uuid();
        DB::table('vehicle_brands')->insert([
            'id' => $brandId, 'name' => 'Dacia '.Str::random(4), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $modelId = (string) Str::uuid();
        DB::table('vehicle_models')->insert([
            'id' => $modelId, 'brand_id' => $brandId, 'name' => 'Logan '.Str::random(4),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $id = (string) Str::uuid();
        DB::table('vehicles')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'brand_id' => $brandId,
            'model_id' => $modelId,
            'registration_number' => 'A-'.Str::random(6).'-B',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeSubRentalContract(string $vehicleId): string
    {
        $agencyId = (string) Str::uuid();
        DB::table('supplier_agencies')->insert([
            'id' => $agencyId, 'company_id' => $this->companyId, 'name' => 'Softnovation',
            'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $id = (string) Str::uuid();
        DB::table('sub_rental_contracts')->insert([
            'id' => $id,
            'company_id' => $this->companyId,
            'supplier_agency_id' => $agencyId,
            'vehicle_id' => $vehicleId,
            'contract_number' => 'SL-TEST01',
            'start_date' => now()->toDateString(),
            'end_date' => now()->addDays(30)->toDateString(),
            'daily_cost' => 500,
            'total_cost' => 15000,
            'payment_method' => 'cash',
            'payment_status' => 'unpaid',
            'status' => 'active',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_a_supplier_payment_becomes_an_expense(): void
    {
        $user = $this->makeUser();
        $vehicleId = $this->makeVehicle();
        $contractId = $this->makeSubRentalContract($vehicleId);

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                'amount' => 4000,
                'payment_method' => 'cash',
                'payment_date' => now()->toDateString(),
            ])
            ->assertStatus(201);

        $expense = Expense::query()->where('source_type', 'sub_rental_payment')->first();

        $this->assertNotNull($expense, 'le paiement fournisseur n’apparaît pas dans les dépenses');
        $this->assertSame('sous-location', $expense->category);
        $this->assertSame(4000.0, (float) $expense->amount);
        $this->assertSame($vehicleId, $expense->vehicle_id);
        $this->assertSame('paid', $expense->status);
    }

    public function test_a_maintenance_event_with_a_cost_becomes_an_expense(): void
    {
        $user = $this->makeUser();
        $vehicleId = $this->makeVehicle();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/vehicles/{$vehicleId}/maintenance-events", [
                'type' => 'OIL_CHANGE',
                'title' => 'Vidange huile moteur',
                'performed_at' => now()->toDateString(),
                'cost_mad' => 850,
                'vendor' => 'Garage Atlas',
            ])
            ->assertStatus(201);

        $expense = Expense::query()->where('source_type', 'maintenance_event')->first();

        $this->assertNotNull($expense, 'l’entretien n’apparaît pas dans les dépenses');
        $this->assertSame('entretien', $expense->category);
        $this->assertSame(850.0, (float) $expense->amount);
        $this->assertStringContainsString('Vidange', (string) $expense->label);
    }

    public function test_a_maintenance_event_without_a_cost_creates_nothing(): void
    {
        $user = $this->makeUser();
        $vehicleId = $this->makeVehicle();

        $this->actingAs($user, 'sanctum')
            ->postJson("/api/v1/vehicles/{$vehicleId}/maintenance-events", [
                'type' => 'INSPECTION',
                'title' => 'Contrôle visuel',
                'performed_at' => now()->toDateString(),
            ])
            ->assertStatus(201);

        $this->assertSame(0, Expense::query()->where('source_type', 'maintenance_event')->count());
    }

    public function test_the_same_payment_never_lands_twice(): void
    {
        $user = $this->makeUser();
        $vehicleId = $this->makeVehicle();
        $contractId = $this->makeSubRentalContract($vehicleId);

        foreach ([1000, 2000] as $amount) {
            $this->actingAs($user, 'sanctum')
                ->postJson("/api/v1/sub-rentals/{$contractId}/payments", [
                    'amount' => $amount,
                    'payment_method' => 'cash',
                    'payment_date' => now()->toDateString(),
                ])
                ->assertStatus(201);
        }

        // Deux paiements distincts : deux dépenses, pas quatre.
        $this->assertSame(2, Expense::query()->where('source_type', 'sub_rental_payment')->count());
    }
}
