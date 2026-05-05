<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Customer;
use App\Models\Mission;
use App\Models\MissionPhoto;
use App\Models\Reservation;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Phase 3 — Mobile Ops module.
 *
 * Asserts the row-scoping rules of `MobileOpsController`:
 *   - AGENT_LIVRAISON can only access their assigned missions
 *   - CLIENT_PORTAL only sees their own customer-safe tracking
 *   - Mission lifecycle events leave audit trail rows
 */
class MobileOpsControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
    }

    /* ═════════════════════════════════════════════════════════════════════
       Helpers
       ════════════════════════════════════════════════════════════════════ */

    private function makeCompany(): string
    {
        $id = (string) Str::uuid();
        \DB::table('companies')->insert([
            'id' => $id,
            'legal_name' => 'MobileOps Co',
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeUser(string $email, string $role, string $companyId, ?string $customerId = null): User
    {
        $user = User::query()->create([
            'name' => 'U '.$role,
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $role,
            'company_id' => $companyId,
            'customer_id' => $customerId,
        ]);
        $r = Role::query()->where('code', $role)->first();
        if ($r) {
            $user->roles()->attach($r->id);
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

    private function makeVehicle(string $companyId): string
    {
        $id = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'registration_number' => 'REG-'.strtoupper(Str::random(7)),
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeReservation(string $companyId, string $customerId, string $vehicleId): Reservation
    {
        return Reservation::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'customer_id' => $customerId,
            'vehicle_id' => $vehicleId,
            'reservation_number' => 'RES-'.strtoupper(Str::random(6)),
            'reservation_type' => 'rental',
            'status' => 'confirmed',
            'desired_start_at' => now()->addDay(),
            'desired_end_at' => now()->addDays(3),
            'created_by' => null,
        ]);
    }

    private function makeMission(string $companyId, ?string $assignedUserId = null, ?string $reservationId = null): Mission
    {
        return Mission::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $companyId,
            'reservation_id' => $reservationId,
            'mission_type' => 'delivery',
            'status' => 'planned',
            'assigned_user_id' => $assignedUserId,
        ]);
    }

    /* ═════════════════════════════════════════════════════════════════════
       AGENT_LIVRAISON access scoping
       ════════════════════════════════════════════════════════════════════ */

    public function test_agent_livraison_can_open_assigned_mission(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $agent->id);

        $r = $this->actingAs($agent, 'sanctum')->getJson('/api/v1/mobile-ops/missions/'.$mission->id);
        $r->assertStatus(200);
        $this->assertSame($mission->id, $r->json('data.id'));
    }

    public function test_agent_livraison_cannot_open_unassigned_mission(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent2@mobileops.test', 'AGENT_LIVRAISON', $company);
        $otherAgent = $this->makeUser('agent3@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $otherAgent->id);

        $r = $this->actingAs($agent, 'sanctum')->getJson('/api/v1/mobile-ops/missions/'.$mission->id);
        // 404 — never 403 (we don't leak the mission's existence to non-assignees)
        $r->assertStatus(404);
    }

    public function test_my_missions_returns_only_assigned_for_agent_livraison(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent4@mobileops.test', 'AGENT_LIVRAISON', $company);
        $other = $this->makeUser('agent5@mobileops.test', 'AGENT_LIVRAISON', $company);

        $this->makeMission($company, (string) $agent->id);
        $this->makeMission($company, (string) $agent->id);
        $this->makeMission($company, (string) $other->id);

        $r = $this->actingAs($agent, 'sanctum')->getJson('/api/v1/mobile-ops/my-missions');
        $r->assertStatus(200);
        $this->assertCount(2, $r->json('data'));
    }

    public function test_agent_livraison_can_download_assigned_mission_photo(): void
    {
        Storage::fake('local');
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent6@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $agent->id);

        $path = 'mission-photos/'.$mission->id.'/p.jpg';
        Storage::disk('local')->put($path, 'fake-jpg');
        $photo = MissionPhoto::query()->create([
            'id' => (string) Str::uuid(),
            'mission_id' => $mission->id,
            'original_filename' => 'p.jpg',
            'mime_type' => 'image/jpeg',
            'size_bytes' => 8,
            'storage_disk' => 'local',
            'storage_path' => $path,
            'uploaded_by' => $agent->id,
        ]);

        $r = $this->actingAs($agent, 'sanctum')
            ->get('/api/v1/documents/mph-'.$photo->id.'/download');
        $r->assertOk();
    }

    /* ═════════════════════════════════════════════════════════════════════
       Mission lifecycle — start, complete, audit
       ════════════════════════════════════════════════════════════════════ */

    public function test_start_transitions_status_and_writes_audit_log(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent7@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $agent->id);

        $r = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/mobile-ops/missions/'.$mission->id.'/start');
        $r->assertStatus(200);

        $mission->refresh();
        $this->assertSame('in_progress', $mission->status);
        $this->assertNotNull($mission->actual_start_at);

        $log = AuditLog::query()
            ->where('entity_id', $mission->id)
            ->where('action_type', 'status_changed')
            ->whereJsonContains('after_data->status', 'in_progress')
            ->first();
        $this->assertNotNull($log, 'mission start should leave an audit row');
    }

    public function test_complete_writes_audit_log(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent8@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $agent->id);
        $mission->status = 'in_progress';
        $mission->save();

        $r = $this->actingAs($agent, 'sanctum')
            ->postJson('/api/v1/mobile-ops/missions/'.$mission->id.'/complete', [
                'status' => 'completed',
                'notes' => 'Livré sans incident.',
            ]);
        $r->assertStatus(200);

        $log = AuditLog::query()
            ->where('entity_id', $mission->id)
            ->where('action_type', 'status_changed')
            ->whereJsonContains('after_data->status', 'completed')
            ->first();
        $this->assertNotNull($log, 'mission complete should leave an audit row');
    }

    public function test_customer_signature_marks_mission_and_writes_legal_audit(): void
    {
        Storage::fake('local');
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent9@mobileops.test', 'AGENT_LIVRAISON', $company);
        $mission = $this->makeMission($company, (string) $agent->id);

        $r = $this->actingAs($agent, 'sanctum')
            ->post('/api/v1/mobile-ops/missions/'.$mission->id.'/customer-signature', [
                // create() avoids the GD requirement of image() — the controller
                // only validates by mimes:png,jpg,jpeg,svg,pdf, not by content.
                'file' => UploadedFile::fake()->create('sig.png', 30, 'image/png'),
                'signed_by_name' => 'Mr Client',
            ]);
        $r->assertStatus(201);

        $mission->refresh();
        $this->assertNotNull($mission->customer_signature_file_id);

        $log = AuditLog::query()
            ->where('entity_id', $mission->id)
            ->where('action_type', 'customer_signature_captured')
            ->first();
        $this->assertNotNull($log);
        $this->assertTrue((bool) $log->legal_significance);
    }

    /* ═════════════════════════════════════════════════════════════════════
       CLIENT_PORTAL access — own tracking only, no internal mission detail
       ════════════════════════════════════════════════════════════════════ */

    public function test_client_portal_sees_only_own_tracking(): void
    {
        $company = $this->makeCompany();
        $myCustomer = $this->makeCustomer($company);
        $otherCustomer = $this->makeCustomer($company);
        $vehicle = $this->makeVehicle($company);

        $myReservation = $this->makeReservation($company, $myCustomer->id, $vehicle);
        $otherReservation = $this->makeReservation($company, $otherCustomer->id, $vehicle);
        $this->makeMission($company, null, $myReservation->id);
        $this->makeMission($company, null, $otherReservation->id);

        $portalUser = $this->makeUser('portal@mobileops.test', 'CLIENT_PORTAL', $company, $myCustomer->id);

        $r = $this->actingAs($portalUser, 'sanctum')
            ->getJson('/api/v1/mobile-ops/customer-tracking');
        $r->assertStatus(200);

        $rows = $r->json('data');
        $this->assertNotEmpty($rows);
        // Every row must belong to my customer's reservations only.
        foreach ($rows as $row) {
            $this->assertSame($myReservation->id, $row['reservation_id']);
        }
    }

    public function test_client_portal_cannot_open_internal_mission_detail(): void
    {
        $company = $this->makeCompany();
        $customer = $this->makeCustomer($company);
        $portalUser = $this->makeUser('portal2@mobileops.test', 'CLIENT_PORTAL', $company, $customer->id);
        $mission = $this->makeMission($company);

        $r = $this->actingAs($portalUser, 'sanctum')
            ->getJson('/api/v1/mobile-ops/missions/'.$mission->id);

        // CLIENT_PORTAL lacks `missions.view`; the route middleware should
        // reject before reaching the controller. 403 is correct here — the
        // mission detail surface is *internal* and not part of their world.
        $r->assertStatus(403);
    }

    public function test_client_portal_cannot_list_my_missions(): void
    {
        $company = $this->makeCompany();
        $customer = $this->makeCustomer($company);
        $portalUser = $this->makeUser('portal3@mobileops.test', 'CLIENT_PORTAL', $company, $customer->id);

        $r = $this->actingAs($portalUser, 'sanctum')
            ->getJson('/api/v1/mobile-ops/my-missions');
        $r->assertStatus(403);
    }

    /* ═════════════════════════════════════════════════════════════════════
       GESTIONNAIRE_FLOTTE — full visibility
       ════════════════════════════════════════════════════════════════════ */

    public function test_gestionnaire_flotte_sees_active_missions_for_monitoring(): void
    {
        $company = $this->makeCompany();
        $agent = $this->makeUser('agent10@mobileops.test', 'AGENT_LIVRAISON', $company);
        $manager = $this->makeUser('manager@mobileops.test', 'GESTIONNAIRE_FLOTTE', $company);

        $this->makeMission($company, (string) $agent->id); // planned
        $m2 = $this->makeMission($company, (string) $agent->id);
        $m2->status = 'in_progress';
        $m2->save();
        $m3 = $this->makeMission($company, (string) $agent->id);
        $m3->status = 'completed';
        $m3->save();

        $r = $this->actingAs($manager, 'sanctum')->getJson('/api/v1/mobile-ops/my-missions');
        $r->assertStatus(200);
        // Default monitoring view excludes completed/failed.
        $statuses = array_column($r->json('data'), 'status');
        $this->assertContains('planned', $statuses);
        $this->assertContains('in_progress', $statuses);
        $this->assertNotContains('completed', $statuses);
    }
}
