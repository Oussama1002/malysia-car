<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 1 — RBAC / Access Consistency.
 *
 * Verifies that the permission gates declared on `routes/api.php` line up
 * with the role → permission matrix in `RbacSeeder` and with the frontend
 * sidebar matrix in `frontend/domain/appRole.ts`.
 *
 * Strategy:
 *   - Allowed endpoints must NOT return 403 (200, 404, 422 are all fine —
 *     they prove the user passed the permission gate).
 *   - Forbidden endpoints must return 403 with a `required_permission`
 *     payload (signal that `EnsurePermission` rejected the call).
 *
 * Tenant/row-scoping is covered separately by `TenantScopingSecurityTest`.
 */
class RbacAccessConsistencyTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
    }

    private function makeUser(string $email, string $roleCode): User
    {
        $companyId = (string) Str::uuid();
        \DB::table('companies')->insertOrIgnore([
            'id' => $companyId,
            'legal_name' => 'RBAC Test Company',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $user = User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => "RBAC {$roleCode}",
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $roleCode,
            'company_id' => $companyId,
        ]);

        // Attach the user to the Role record so that `User::hasPermission`
        // (which walks user_roles → role_permissions) resolves correctly.
        $role = Role::query()->where('code', $roleCode)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    private function assertAllowed($response, string $msg): void
    {
        $this->assertNotSame(
            403,
            $response->status(),
            "{$msg} — expected NOT 403 (got 403 with body: ".$response->getContent().')'
        );
    }

    private function assertForbidden($response, string $msg): void
    {
        $this->assertSame(403, $response->status(), "{$msg} — expected 403 (got {$response->status()})");
    }

    // -------------------------------------------------------------------------
    // ADMIN — universal bypass
    // -------------------------------------------------------------------------

    public function test_admin_can_list_users(): void
    {
        $user = $this->makeUser('admin@rbac.test', 'ADMIN');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/users');
        $this->assertAllowed($r, 'ADMIN should reach /v1/users');
    }

    public function test_admin_can_list_accounting_journals(): void
    {
        $user = $this->makeUser('admin2@rbac.test', 'ADMIN');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertAllowed($r, 'ADMIN should reach /v1/accounting/journals');
    }

    // -------------------------------------------------------------------------
    // DIRECTEUR — full read access
    // -------------------------------------------------------------------------

    public function test_directeur_can_list_signatures(): void
    {
        $user = $this->makeUser('dir@rbac.test', 'DIRECTEUR');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/signatures/envelopes');
        $this->assertAllowed($r, 'DIRECTEUR should reach /v1/signatures/envelopes');
    }

    // -------------------------------------------------------------------------
    // ANALYSTE_CREDIT — credit + customers + KYC
    // -------------------------------------------------------------------------

    public function test_analyste_credit_can_list_credit_applications(): void
    {
        $user = $this->makeUser('analyste@rbac.test', 'ANALYSTE_CREDIT');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/credit-applications');
        $this->assertAllowed($r, 'ANALYSTE_CREDIT should reach /v1/credit-applications');
    }

    public function test_analyste_credit_cannot_list_users(): void
    {
        $user = $this->makeUser('analyste2@rbac.test', 'ANALYSTE_CREDIT');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/users');
        $this->assertForbidden($r, 'ANALYSTE_CREDIT must NOT reach /v1/users (admin surface)');
    }

    public function test_analyste_credit_cannot_list_accounting_journals(): void
    {
        $user = $this->makeUser('analyste3@rbac.test', 'ANALYSTE_CREDIT');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertForbidden($r, 'ANALYSTE_CREDIT must NOT reach accounting');
    }

    // -------------------------------------------------------------------------
    // AGENT_COMMERCIAL — customers, contracts, signatures (sign/decline)
    // -------------------------------------------------------------------------

    public function test_agent_commercial_can_list_customers(): void
    {
        $user = $this->makeUser('com@rbac.test', 'AGENT_COMMERCIAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/customers');
        $this->assertAllowed($r, 'AGENT_COMMERCIAL should reach /v1/customers');
    }

    public function test_agent_commercial_can_view_signatures(): void
    {
        $user = $this->makeUser('com2@rbac.test', 'AGENT_COMMERCIAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/signatures/envelopes');
        $this->assertAllowed(
            $r,
            'AGENT_COMMERCIAL should reach /v1/signatures/envelopes (signatures.view via $contracts_read)'
        );
    }

    public function test_agent_commercial_cannot_list_accounting_journals(): void
    {
        $user = $this->makeUser('com3@rbac.test', 'AGENT_COMMERCIAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertForbidden($r, 'AGENT_COMMERCIAL must NOT reach accounting');
    }

    // -------------------------------------------------------------------------
    // GESTIONNAIRE_FLOTTE — fleet + GPS only (no customers/finance)
    // -------------------------------------------------------------------------

    public function test_gestionnaire_flotte_can_list_vehicles(): void
    {
        $user = $this->makeUser('flotte@rbac.test', 'GESTIONNAIRE_FLOTTE');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/vehicles');
        $this->assertAllowed($r, 'GESTIONNAIRE_FLOTTE should reach /v1/vehicles');
    }

    public function test_gestionnaire_flotte_cannot_list_customers(): void
    {
        $user = $this->makeUser('flotte2@rbac.test', 'GESTIONNAIRE_FLOTTE');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/customers');
        $this->assertForbidden($r, 'GESTIONNAIRE_FLOTTE must NOT reach /v1/customers');
    }

    // -------------------------------------------------------------------------
    // COMPTABLE — finance, accounting, signatures.view (Phase 1 alignment)
    // -------------------------------------------------------------------------

    public function test_comptable_can_list_accounting_journals(): void
    {
        $user = $this->makeUser('comptable@rbac.test', 'COMPTABLE');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertAllowed($r, 'COMPTABLE should reach /v1/accounting/journals');
    }

    public function test_comptable_can_view_signatures_after_phase1_alignment(): void
    {
        $user = $this->makeUser('comptable2@rbac.test', 'COMPTABLE');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/signatures/envelopes');
        $this->assertAllowed(
            $r,
            'COMPTABLE should reach /v1/signatures/envelopes (signatures.view added in Phase 1)'
        );
    }

    public function test_comptable_cannot_list_vehicles(): void
    {
        $user = $this->makeUser('comptable3@rbac.test', 'COMPTABLE');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/vehicles');
        $this->assertForbidden($r, 'COMPTABLE must NOT reach /v1/vehicles (no fleet permissions)');
    }

    // -------------------------------------------------------------------------
    // CONTENTIEUX — arrears, legal, signatures.view (Phase 1 alignment)
    // -------------------------------------------------------------------------

    public function test_contentieux_can_list_arrears_cases(): void
    {
        $user = $this->makeUser('cont@rbac.test', 'CONTENTIEUX');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/arrears/cases');
        $this->assertAllowed($r, 'CONTENTIEUX should reach /v1/arrears/cases');
    }

    public function test_contentieux_can_view_signatures_after_phase1_alignment(): void
    {
        $user = $this->makeUser('cont2@rbac.test', 'CONTENTIEUX');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/signatures/envelopes');
        $this->assertAllowed(
            $r,
            'CONTENTIEUX should reach /v1/signatures/envelopes (signatures.view added in Phase 1)'
        );
    }

    public function test_contentieux_cannot_list_accounting_journals(): void
    {
        $user = $this->makeUser('cont3@rbac.test', 'CONTENTIEUX');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertForbidden($r, 'CONTENTIEUX must NOT reach accounting');
    }

    // -------------------------------------------------------------------------
    // AGENT_LIVRAISON — fleet read + missions; no customers/finance
    // -------------------------------------------------------------------------

    public function test_agent_livraison_cannot_list_customers(): void
    {
        $user = $this->makeUser('liv@rbac.test', 'AGENT_LIVRAISON');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/customers');
        $this->assertForbidden($r, 'AGENT_LIVRAISON must NOT reach /v1/customers');
    }

    public function test_agent_livraison_cannot_list_accounting_journals(): void
    {
        $user = $this->makeUser('liv2@rbac.test', 'AGENT_LIVRAISON');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertForbidden($r, 'AGENT_LIVRAISON must NOT reach accounting');
    }

    // -------------------------------------------------------------------------
    // CLIENT_PORTAL — own contracts + own signatures only
    // -------------------------------------------------------------------------

    public function test_client_portal_can_view_signatures(): void
    {
        $user = $this->makeUser('client@rbac.test', 'CLIENT_PORTAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/signatures/envelopes');
        $this->assertAllowed(
            $r,
            'CLIENT_PORTAL should reach /v1/signatures/envelopes (own envelopes; row-scoping applies inside the controller)'
        );
    }

    public function test_client_portal_cannot_list_users(): void
    {
        $user = $this->makeUser('client2@rbac.test', 'CLIENT_PORTAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/users');
        $this->assertForbidden($r, 'CLIENT_PORTAL must NOT reach /v1/users');
    }

    public function test_client_portal_cannot_list_accounting_journals(): void
    {
        $user = $this->makeUser('client3@rbac.test', 'CLIENT_PORTAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/accounting/journals');
        $this->assertForbidden($r, 'CLIENT_PORTAL must NOT reach accounting');
    }

    public function test_client_portal_cannot_list_customers(): void
    {
        $user = $this->makeUser('client4@rbac.test', 'CLIENT_PORTAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/customers');
        $this->assertForbidden($r, 'CLIENT_PORTAL must NOT see the customer directory');
    }

    public function test_client_portal_cannot_list_arrears_cases(): void
    {
        $user = $this->makeUser('client5@rbac.test', 'CLIENT_PORTAL');
        $r = $this->actingAs($user, 'sanctum')->getJson('/api/v1/arrears/cases');
        $this->assertForbidden($r, 'CLIENT_PORTAL must NOT see arrears cases');
    }
}
