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

/**
 * Scanner deux fois la même CIN ne doit pas créer un second client : le scan
 * dit tout de suite que la fiche existe.
 */
class CustomerLookupTest extends TestCase
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
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
    }

    private function makeUser(): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(), 'name' => 'Agent',
            'email' => 'agent.'.Str::random(6).'@test.com',
            'password' => Hash::make('password'), 'role' => 'ADMIN',
            'company_id' => $this->companyId,
        ]);
    }

    private function makeCustomer(string $cin, ?string $license = null): string
    {
        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'customer_code' => 'CL-00042', 'customer_type' => 'PARTICULIER',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('customer_individual_profiles')->insert([
            'customer_id' => $id,
            'first_name' => 'Oussama', 'last_name' => 'El Hadi',
            'national_id_number' => $cin,
            'driving_license_number' => $license,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_it_names_the_client_behind_a_known_cin(): void
    {
        $user = $this->makeUser();
        $customerId = $this->makeCustomer('BV819234');

        $res = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/customers/lookup?national_id_number=bv+819234')
            ->assertOk();

        $this->assertSame($customerId, $res->json('data.id'));
        $this->assertSame('Oussama El Hadi', $res->json('data.name'));
        $this->assertSame('cin', $res->json('data.matched_on'));
    }

    public function test_it_also_recognises_a_licence_number(): void
    {
        $user = $this->makeUser();
        $this->makeCustomer('AA111222', '13/456789');

        $res = $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/customers/lookup?driving_license_number=13%2F456789')
            ->assertOk();

        $this->assertSame('permis', $res->json('data.matched_on'));
    }

    public function test_an_unknown_document_returns_nothing(): void
    {
        $user = $this->makeUser();
        $this->makeCustomer('BV819234');

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/customers/lookup?national_id_number=ZZ999999')
            ->assertOk()
            ->assertJsonPath('data', null);
    }
}
