<?php

namespace Tests\Feature;

use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 4 — Audit Module Completion.
 *
 * Two concerns:
 *   1. Critical actions that lacked audit logs at the start of the phase
 *      (notably blacklist add/remove on customers) now write a row to
 *      `audit_logs` with the right shape (legal_significance, action label,
 *      before/after payload).
 *   2. The audit endpoints (`/v1/audit`, `/v1/audit/export.csv`,
 *      `/v1/entities/.../audit`) honour the role matrix:
 *      ADMIN/DIRECTEUR/COMPTABLE/CONTENTIEUX can read, AGENT_COMMERCIAL
 *      cannot, and only ADMIN/DIRECTEUR can export CSV.
 */
class AuditModuleCompletionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
    }

    private function makeCompany(): string
    {
        $id = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $id,
            'legal_name' => 'Audit Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeUser(string $email, string $roleCode, string $companyId): User
    {
        $user = User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Audit '.$roleCode,
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $roleCode,
            'company_id' => $companyId,
        ]);

        $role = Role::query()->where('code', $roleCode)->first();
        if ($role) {
            $user->roles()->attach($role->id);
        }

        return $user;
    }

    private function makeCustomer(string $companyId): Customer
    {
        return Customer::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'customer_code' => 'CUST-'.strtoupper(Str::random(6)),
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => false,
            'preferred_language' => 'fr',
        ]);
    }

    // -------------------------------------------------------------------------
    // 1. Critical action coverage — blacklist add/remove
    // -------------------------------------------------------------------------

    public function test_blacklist_add_writes_legal_audit_log(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('admin@audit.test', 'ADMIN', $company);
        $customer = $this->makeCustomer($company);

        $response = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/customers/'.$customer->id.'/blacklist', [
                'reason' => 'Fraud suspected',
                'severity' => 'high',
            ]);

        $response->assertStatus(200);

        $log = AuditLog::query()
            ->where('entity_id', $customer->id)
            ->where('action_type', 'blacklist_added')
            ->first();

        $this->assertNotNull($log, 'Expected an audit_logs row for blacklist_added');
        $this->assertTrue((bool) $log->legal_significance, 'blacklist_added must be flagged legal');
        $this->assertSame('customers', $log->module_name);
        $this->assertSame((string) $admin->id, (string) $log->user_id);
        $this->assertEquals(['is_blacklisted' => false], $log->before_data);
        $this->assertSame('Fraud suspected', $log->after_data['reason'] ?? null);
        $this->assertSame('high', $log->after_data['severity'] ?? null);
    }

    public function test_blacklist_remove_writes_legal_audit_log(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('admin2@audit.test', 'ADMIN', $company);
        $customer = $this->makeCustomer($company);

        // Pre-blacklist via the same controller so the relation row exists.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/customers/'.$customer->id.'/blacklist', [
                'reason' => 'Initial flag',
            ])->assertStatus(200);

        $this->actingAs($admin, 'sanctum')
            ->deleteJson('/api/v1/customers/'.$customer->id.'/blacklist', [
                'removal_reason' => 'Cleared after settlement',
            ])->assertStatus(200);

        $log = AuditLog::query()
            ->where('entity_id', $customer->id)
            ->where('action_type', 'blacklist_removed')
            ->first();

        $this->assertNotNull($log, 'Expected an audit_logs row for blacklist_removed');
        $this->assertTrue((bool) $log->legal_significance);
        $this->assertSame('Cleared after settlement', $log->after_data['removal_reason'] ?? null);
    }

    public function test_customer_note_create_writes_audit_log(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('admin3@audit.test', 'ADMIN', $company);
        $customer = $this->makeCustomer($company);

        $r = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/customers/'.$customer->id.'/notes', [
                'note_type' => 'risk',
                'note_text' => 'Probable fraud — escalate to contentieux.',
            ]);
        $r->assertStatus(201);

        $log = AuditLog::query()
            ->where('module_name', 'customers')
            ->where('action_type', 'created')
            ->orderByDesc('created_at')
            ->first();

        $this->assertNotNull($log, 'Note create should produce an audit row');
        // Risk-flagged notes must be marked legally significant.
        $this->assertTrue((bool) $log->legal_significance);
    }

    public function test_customer_bank_account_create_writes_legal_audit_log(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('admin4@audit.test', 'ADMIN', $company);
        $customer = $this->makeCustomer($company);

        $r = $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/customers/'.$customer->id.'/bank-accounts', [
                'bank_name' => 'Attijariwafa',
                'iban' => 'MA64011519000000123456789012',
            ]);
        $r->assertStatus(201);

        $log = AuditLog::query()
            ->where('module_name', 'customers')
            ->where('action_type', 'created')
            ->orderByDesc('created_at')
            ->first();

        $this->assertNotNull($log, 'Bank account create should produce an audit row');
        $this->assertTrue((bool) $log->legal_significance, 'Bank account changes are legally significant');
    }

    // -------------------------------------------------------------------------
    // 2. Role-based access on /v1/audit
    // -------------------------------------------------------------------------

    public function test_admin_can_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('admin5@audit.test', 'ADMIN', $company);

        $r = $this->actingAs($admin, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(200);
    }

    public function test_directeur_can_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('dir@audit.test', 'DIRECTEUR', $company);

        $r = $this->actingAs($u, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(200);
    }

    public function test_comptable_can_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('comptable@audit.test', 'COMPTABLE', $company);

        $r = $this->actingAs($u, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(200);
    }

    public function test_contentieux_can_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('cont@audit.test', 'CONTENTIEUX', $company);

        $r = $this->actingAs($u, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(200);
    }

    public function test_agent_commercial_cannot_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('com@audit.test', 'AGENT_COMMERCIAL', $company);

        $r = $this->actingAs($u, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(403);
    }

    public function test_gestionnaire_flotte_cannot_read_audit_logs(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('flotte@audit.test', 'GESTIONNAIRE_FLOTTE', $company);

        $r = $this->actingAs($u, 'sanctum')->getJson('/api/v1/audit');
        $r->assertStatus(403);
    }

    // -------------------------------------------------------------------------
    // 3. CSV export — restricted to ADMIN/DIRECTEUR
    // -------------------------------------------------------------------------

    public function test_admin_can_export_audit_csv(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('expadmin@audit.test', 'ADMIN', $company);

        $r = $this->actingAs($admin, 'sanctum')->get('/api/v1/audit/export.csv');
        $r->assertStatus(200);
        $r->assertHeader('content-type', 'text/csv; charset=UTF-8');
    }

    public function test_comptable_cannot_export_audit_csv(): void
    {
        $company = $this->makeCompany();
        $u = $this->makeUser('expcomp@audit.test', 'COMPTABLE', $company);

        // COMPTABLE has audit.view but not audit.export.
        $r = $this->actingAs($u, 'sanctum')->get('/api/v1/audit/export.csv');
        $r->assertStatus(403);
    }

    // -------------------------------------------------------------------------
    // 4. Entity audit timeline endpoint
    // -------------------------------------------------------------------------

    public function test_entity_audit_endpoint_returns_logs_for_customer(): void
    {
        $company = $this->makeCompany();
        $admin = $this->makeUser('entityaudit@audit.test', 'ADMIN', $company);
        $customer = $this->makeCustomer($company);

        // Generate one audit row.
        $this->actingAs($admin, 'sanctum')
            ->postJson('/api/v1/customers/'.$customer->id.'/blacklist', [
                'reason' => 'Audit timeline test',
            ])->assertStatus(200);

        $r = $this->actingAs($admin, 'sanctum')
            ->getJson('/api/v1/entities/customer/'.$customer->id.'/audit');
        $r->assertStatus(200);

        $payload = $r->json('data') ?? $r->json();
        $this->assertNotEmpty($payload, 'Entity audit timeline should return at least one row');
    }
}
