<?php

namespace Tests\Feature;

use App\Models\Vehicle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Reprise du parc depuis l'export de l'ancien système : le fichier s'appelle
 * .xls mais c'est un tableau HTML. L'import doit être rejouable sans créer de
 * doublon ni écraser ce que l'agence a saisi depuis.
 */
class ImportVehiclesTest extends TestCase
{
    use RefreshDatabase;

    private string $path;

    protected function setUp(): void
    {
        parent::setUp();
        DB::table('companies')->insert([
            'id' => (string) Str::uuid(), 'legal_name' => 'Malysia Car',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->path = sys_get_temp_dir().DIRECTORY_SEPARATOR.'parc_'.Str::random(6).'.xls';
        file_put_contents($this->path, <<<'HTML'
        <html><body><table>
          <tr><td>Immatriculation</td><td>Immat www</td><td>Marque</td><td>Modèle</td>
              <td>Date mise en circulation</td><td>Puissance fiscal</td><td>Carburant</td></tr>
          <tr><td>11692-Y-6</td><td>670037 WW</td><td>VOLKSWAGEN</td><td>TOUAREG PRO</td>
              <td>30/09/2025</td><td>12</td><td>GASOIL</td></tr>
          <tr><td>13229-T-6</td><td>721340 WW</td><td>RENAULT</td><td>CLIO5 PRO</td>
              <td>03/10/2025</td><td>6</td><td>ESSENCE</td></tr>
          <tr><td>98836-T-6</td><td>559604</td><td>DACIA</td><td>LOGAN PRO</td>
              <td>29/04/2025</td><td>6</td><td></td></tr>
        </table></body></html>
        HTML);
    }

    protected function tearDown(): void
    {
        @unlink($this->path);
        parent::tearDown();
    }

    public function test_it_imports_the_fleet_with_its_details(): void
    {
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();

        $this->assertSame(3, Vehicle::query()->withoutGlobalScopes()->count());

        $vw = Vehicle::query()->withoutGlobalScopes()->where('registration_number', '11692-Y-6')->first();
        $this->assertSame('Volkswagen', $vw->brand_name);
        $this->assertSame('Touareg Pro', $vw->model_name);
        $this->assertSame('Diesel', $vw->fuel_type);
        $this->assertSame(12, (int) $vw->fiscal_power);
        $this->assertSame('2025-09-30', $vw->mise_en_circulation?->toDateString());
        $this->assertSame('670037', $vw->immat_online);
        $this->assertSame(2025, (int) $vw->year);
        $this->assertSame('AVAILABLE', $vw->status);
    }

    public function test_an_empty_fuel_stays_empty_rather_than_invented(): void
    {
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();

        $this->assertNull(
            Vehicle::query()->withoutGlobalScopes()->where('registration_number', '98836-T-6')->value('fuel_type'),
        );
    }

    public function test_running_it_twice_creates_no_duplicate(): void
    {
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();

        $this->assertSame(3, Vehicle::query()->withoutGlobalScopes()->count());
        $this->assertSame(3, DB::table('vehicle_models')->count());
    }

    public function test_it_never_overwrites_what_the_agency_entered(): void
    {
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();

        $vehicle = Vehicle::query()->withoutGlobalScopes()->where('registration_number', '13229-T-6')->first();
        $vehicle->fuel_type = 'Essence sans plomb';
        $vehicle->daily_rental_price = 350;
        $vehicle->save();

        $this->artisan('driveflow:import-vehicles', ['file' => $this->path])->assertSuccessful();

        $vehicle->refresh();
        $this->assertSame('Essence sans plomb', $vehicle->fuel_type);
        $this->assertSame(350.0, (float) $vehicle->daily_rental_price);
    }

    public function test_a_dry_run_writes_nothing(): void
    {
        $this->artisan('driveflow:import-vehicles', ['file' => $this->path, '--dry-run' => true])
            ->assertSuccessful();

        $this->assertSame(0, Vehicle::query()->withoutGlobalScopes()->count());
    }
}
