<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Un compte peut porter plusieurs rôles. C'est le plus fort qui décide : un
 * ADMIN relié en second rôle à AGENT_COMMERCIAL restait bloqué, parce que la
 * résolution prenait le premier rôle venu.
 */
class MultiRoleAccessTest extends TestCase
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

    /** @param array<int, string> $codes */
    private function makeUserWithRoles(array $codes): User
    {
        $user = User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Multi rôles',
            'email' => 'multi.'.Str::random(6).'@test.com',
            'password' => Hash::make('password'),
            // Comme en production : le rôle vient des rôles liés, pas de la colonne.
            'role' => '',
            'company_id' => $this->companyId,
        ]);

        foreach ($codes as $code) {
            $roleId = DB::table('roles')->where('code', $code)->value('id');
            if (! $roleId) {
                // roles.id est un auto-incrément, pas un uuid.
                $roleId = DB::table('roles')->insertGetId([
                    'code' => $code,
                    'name' => $code,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            DB::table('user_roles')->insert(['user_id' => $user->id, 'role_id' => $roleId]);
        }

        return $user->fresh();
    }

    public function test_the_strongest_role_wins_whatever_the_row_order(): void
    {
        // AGENT_COMMERCIAL inséré en premier : c'est lui que renvoyait l'ancien
        // code, et le compte se retrouvait déclassé.
        $user = $this->makeUserWithRoles(['AGENT_COMMERCIAL', 'ADMIN', 'COMPTABLE']);

        $this->assertSame('ADMIN', $user->primaryRoleCode());
    }

    public function test_an_admin_among_several_roles_keeps_every_permission(): void
    {
        $user = $this->makeUserWithRoles(['AGENT_COMMERCIAL', 'ADMIN']);

        $this->assertTrue($user->hasPermission('sub_rentals.payments'));
        $this->assertTrue($user->hasPermission('vehicles.delete'));
    }

    public function test_a_role_that_is_not_admin_stays_bounded(): void
    {
        $user = $this->makeUserWithRoles(['AGENT_COMMERCIAL']);

        $this->assertSame('AGENT_COMMERCIAL', $user->primaryRoleCode());
        $this->assertFalse($user->hasPermission('sub_rentals.payments'));
    }

    public function test_the_middleware_lets_a_multi_role_admin_through(): void
    {
        $user = $this->makeUserWithRoles(['AGENT_COMMERCIAL', 'ADMIN']);

        // Route réelle protégée par permission:sub_rentals.payments.
        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/sub-rentals/'.Str::uuid().'/payments')
            ->assertStatus(404); // passé la permission, le contrat n'existe pas
    }

    public function test_the_middleware_still_refuses_a_role_without_the_right(): void
    {
        $user = $this->makeUserWithRoles(['AGENT_COMMERCIAL']);

        $this->actingAs($user, 'sanctum')
            ->getJson('/api/v1/sub-rentals/'.Str::uuid().'/payments')
            ->assertStatus(403);
    }
}
