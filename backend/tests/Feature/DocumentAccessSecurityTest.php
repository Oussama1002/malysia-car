<?php

namespace Tests\Feature;

use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Models\EntityAttachment;
use App\Models\File;
use App\Models\Mission;
use App\Models\MissionPhoto;
use App\Models\Role;
use App\Models\User;
use App\Models\VehicleDocument;
use Database\Seeders\RbacSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class DocumentAccessSecurityTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RbacSeeder::class);
    }

    private function attachRole(User $user, string $roleCode): void
    {
        $role = Role::query()->where('code', $roleCode)->firstOrFail();
        $user->roles()->syncWithoutDetaching([$role->id]);
    }

    private function makeCompany(string $id): void
    {
        \DB::table('companies')->insert([
            'id' => $id,
            'legal_name' => 'Co '.$id,
            'country_code' => 'MA',
            'default_currency' => 'MAD',
            'default_locale' => 'fr',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeBranch(string $id, string $companyId): void
    {
        \DB::table('branches')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'code' => 'B-'.substr($id, 0, 8),
            'name' => 'Branch',
            'country_code' => 'MA',
            'is_active' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeUser(string $email, string $role, string $companyId, ?string $branchId = null, ?string $customerId = null): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'U',
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $role,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'customer_id' => $customerId,
        ]);
    }

    private function makeCustomer(string $companyId, ?string $branchId = null): string
    {
        $id = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $id,
            'company_id' => $companyId,
            'branch_id' => $branchId,
            'customer_code' => 'C-'.strtoupper(Str::random(6)),
            'customer_type' => 'PARTICULIER',
            'status' => 'active',
            'risk_level' => 'normal',
            'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $id;
    }

    public function test_user_from_another_company_cannot_download_attachment(): void
    {
        Storage::fake('local');
        $companyA = (string) Str::uuid();
        $companyB = (string) Str::uuid();
        $this->makeCompany($companyA);
        $this->makeCompany($companyB);
        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'company_id' => $companyA,
            'branch_id' => null,
            'registration_number' => 'REG-A',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $file = File::query()->create([
            'company_id' => $companyA,
            'branch_id' => null,
            'original_name' => 'x.pdf',
            'stored_name' => 'x.pdf',
            'storage_disk' => 'local',
            'storage_path' => 't/x.pdf',
            'mime_type' => 'application/pdf',
            'extension' => 'pdf',
            'file_size' => 4,
            'checksum_sha256' => null,
            'uploaded_by' => null,
            'is_public' => false,
            'created_at' => now(),
        ]);
        Storage::disk('local')->put('t/x.pdf', '%PDF');

        $attachment = EntityAttachment::query()->create([
            'entity_type' => 'vehicle',
            'entity_id' => $vehicleId,
            'file_id' => $file->id,
            'category' => 'general',
            'title' => 'x',
            'visibility' => 'internal',
            'status' => 'active',
        ]);

        $userB = $this->makeUser('b@doc.test', 'GESTIONNAIRE_FLOTTE', $companyB);
        $this->attachRole($userB, 'GESTIONNAIRE_FLOTTE');

        $this->actingAs($userB, 'sanctum')
            ->get('/api/v1/documents/att-'.$attachment->id.'/download')
            ->assertStatus(403);
    }

    public function test_branch_user_cannot_download_other_branch_attachment(): void
    {
        Storage::fake('local');
        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $b1 = (string) Str::uuid();
        $b2 = (string) Str::uuid();
        $this->makeBranch($b1, $company);
        $this->makeBranch($b2, $company);

        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'company_id' => $company,
            'branch_id' => $b1,
            'registration_number' => 'REG-BR',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $file = File::query()->create([
            'company_id' => $company,
            'branch_id' => $b1,
            'original_name' => 'y.pdf',
            'stored_name' => 'y.pdf',
            'storage_disk' => 'local',
            'storage_path' => 't/y.pdf',
            'mime_type' => 'application/pdf',
            'extension' => 'pdf',
            'file_size' => 4,
            'checksum_sha256' => null,
            'uploaded_by' => null,
            'is_public' => false,
            'created_at' => now(),
        ]);
        Storage::disk('local')->put('t/y.pdf', '%PDF');

        $attachment = EntityAttachment::query()->create([
            'entity_type' => 'vehicle',
            'entity_id' => $vehicleId,
            'file_id' => $file->id,
            'category' => 'general',
            'title' => 'y',
            'visibility' => 'internal',
            'status' => 'active',
        ]);

        $user = $this->makeUser('br@doc.test', 'GESTIONNAIRE_FLOTTE', $company, $b2);
        $this->attachRole($user, 'GESTIONNAIRE_FLOTTE');

        $this->actingAs($user, 'sanctum')
            ->get('/api/v1/documents/att-'.$attachment->id.'/download')
            ->assertStatus(403);
    }

    public function test_client_portal_cannot_download_another_customers_kyc(): void
    {
        Storage::fake('local');
        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $custA = $this->makeCustomer($company);
        $custB = $this->makeCustomer($company);
        $portal = $this->makeUser('portal@doc.test', 'CLIENT_PORTAL', $company, null, $custA);
        $this->attachRole($portal, 'CLIENT_PORTAL');

        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $custB,
            'kyc_status' => 'pending',
            'verification_level' => 'basic',
        ]);
        Storage::disk('local')->put('kyc/other.pdf', '%PDF');
        $doc = CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'cin',
            'file_path' => 'kyc/other.pdf',
            'file_name' => 'other.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->actingAs($portal, 'sanctum')
            ->get('/api/v1/documents/kyc-'.$doc->id.'/download')
            ->assertStatus(403);
    }

    public function test_comptable_cannot_download_kyc_without_kyc_permission(): void
    {
        Storage::fake('local');
        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $cust = $this->makeCustomer($company);
        $user = $this->makeUser('cpt@doc.test', 'COMPTABLE', $company);
        $this->attachRole($user, 'COMPTABLE');

        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $cust,
            'kyc_status' => 'pending',
            'verification_level' => 'basic',
        ]);
        Storage::disk('local')->put('kyc/cin.pdf', '%PDF');
        $doc = CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'cin',
            'file_path' => 'kyc/cin.pdf',
            'file_name' => 'cin.pdf',
            'mime_type' => 'application/pdf',
        ]);

        $this->actingAs($user, 'sanctum')
            ->get('/api/v1/documents/kyc-'.$doc->id.'/download')
            ->assertStatus(403);
    }

    public function test_gestionnaire_flotte_can_download_vehicle_document(): void
    {
        Storage::fake('local');
        $company = (string) Str::uuid();
        $this->makeCompany($company);
        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'company_id' => $company,
            'branch_id' => null,
            'registration_number' => 'REG-V',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $path = 'vehicle-documents/'.$vehicleId.'/doc.pdf';
        Storage::disk('local')->put($path, '%PDF');
        $vd = VehicleDocument::query()->create([
            'vehicle_id' => $vehicleId,
            'type' => 'assurance',
            'original_filename' => 'doc.pdf',
            'mime_type' => 'application/pdf',
            'size_bytes' => 4,
            'storage_disk' => 'local',
            'storage_path' => $path,
            'uploaded_by' => null,
        ]);

        $user = $this->makeUser('gf@doc.test', 'GESTIONNAIRE_FLOTTE', $company);
        $this->attachRole($user, 'GESTIONNAIRE_FLOTTE');

        $this->actingAs($user, 'sanctum')
            ->get('/api/v1/documents/veh-'.$vd->id.'/download')
            ->assertOk();
    }

    public function test_agent_livraison_can_download_assigned_mission_photo(): void
    {
        Storage::fake('local');
        $company = (string) Str::uuid();
        $this->makeCompany($company);

        // `id` is not in User::$fillable, so `User::create(['id' => ...])`
        // silently lets HasUuids overwrite the primary key with a fresh
        // ordered UUID. Build the model and run the role attach + the mission
        // setup *after* the real id is known, so `assigned_user_id` and the
        // user_roles pivot both point at the same row.
        $agent = $this->makeUser('liv@doc.test', 'AGENT_LIVRAISON', $company);
        $this->attachRole($agent, 'AGENT_LIVRAISON');
        $agentId = (string) $agent->id;

        $missionId = (string) Str::uuid();
        Mission::query()->create([
            'id' => $missionId,
            'company_id' => $company,
            'branch_id' => null,
            'mission_type' => 'delivery',
            'status' => 'planned',
            'assigned_user_id' => $agentId,
        ]);
        $path = 'mission-photos/'.$missionId.'/p.jpg';
        Storage::disk('local')->put($path, 'jpg-bytes');
        $photoId = (string) Str::uuid();
        MissionPhoto::query()->create([
            'id' => $photoId,
            'mission_id' => $missionId,
            'original_filename' => 'p.jpg',
            'mime_type' => 'image/jpeg',
            'size_bytes' => 8,
            'storage_disk' => 'local',
            'storage_path' => $path,
            'uploaded_by' => $agentId,
        ]);

        $this->actingAs($agent, 'sanctum')
            ->get('/api/v1/documents/mph-'.$photoId.'/download')
            ->assertOk();
    }

    public function test_denied_access_writes_audit_row(): void
    {
        Storage::fake('local');
        $companyA = (string) Str::uuid();
        $companyB = (string) Str::uuid();
        $this->makeCompany($companyA);
        $this->makeCompany($companyB);
        $vehicleId = (string) Str::uuid();
        \DB::table('vehicles')->insert([
            'id' => $vehicleId,
            'company_id' => $companyA,
            'branch_id' => null,
            'registration_number' => 'REG-Z',
            'status' => 'AVAILABLE',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $file = File::query()->create([
            'company_id' => $companyA,
            'branch_id' => null,
            'original_name' => 'z.pdf',
            'stored_name' => 'z.pdf',
            'storage_disk' => 'local',
            'storage_path' => 't/z.pdf',
            'mime_type' => 'application/pdf',
            'extension' => 'pdf',
            'file_size' => 4,
            'checksum_sha256' => null,
            'uploaded_by' => null,
            'is_public' => false,
            'created_at' => now(),
        ]);
        Storage::disk('local')->put('t/z.pdf', '%PDF');

        $attachment = EntityAttachment::query()->create([
            'entity_type' => 'vehicle',
            'entity_id' => $vehicleId,
            'file_id' => $file->id,
            'category' => 'general',
            'title' => 'z',
            'visibility' => 'internal',
            'status' => 'active',
        ]);

        $userB = $this->makeUser('audit@doc.test', 'GESTIONNAIRE_FLOTTE', $companyB);
        $this->attachRole($userB, 'GESTIONNAIRE_FLOTTE');

        $this->actingAs($userB, 'sanctum')
            ->get('/api/v1/documents/att-'.$attachment->id.'/download')
            ->assertStatus(403);

        $this->assertDatabaseHas('audit_logs', [
            'action_type' => 'document_access_denied',
            'user_id' => $userB->id,
        ]);
    }
}
