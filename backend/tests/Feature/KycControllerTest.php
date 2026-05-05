<?php

namespace Tests\Feature;

use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Models\User;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

class KycControllerTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(string $email, string $role): User
    {
        return User::query()->create([
            'id' => (string) Str::uuid(),
            'name' => 'Test',
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => $role,
        ]);
    }

    private function makeCustomer(): string
    {
        $id = (string) Str::uuid();
        \DB::table('customers')->insert([
            'id' => $id,
            'customer_code' => 'CUST-'.strtoupper(Str::random(6)),
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

    public function test_upload_kyc_document(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        Storage::fake('local');
        $user = $this->makeUser('upload@test.com', 'ANALYSTE_CREDIT');
        $customerId = $this->makeCustomer();
        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'kyc_status' => 'pending',
            'verification_level' => 'basic',
        ]);

        $response = $this->actingAs($user, 'sanctum')->post('/api/v1/kyc-cases/'.$kycCase->id.'/documents', [
            'document_type' => 'cin',
            'file' => UploadedFile::fake()->create('cin.pdf', 120, 'application/pdf'),
        ]);

        $response->assertStatus(201);
        $kycCase->refresh();
        $this->assertSame('in_review', $kycCase->kyc_status);
        $this->assertDatabaseHas('customer_kyc_documents', ['kyc_case_id' => $kycCase->id, 'document_type' => 'cin']);
    }

    public function test_verify_kyc_document(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('verify@test.com', 'ANALYSTE_CREDIT');
        $customerId = $this->makeCustomer();
        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'kyc_status' => 'in_review',
            'verification_level' => 'basic',
        ]);
        $document = CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'cin',
            'verification_status' => 'pending',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/kyc-documents/'.$document->id.'/verify', [
            'verification_status' => 'verified',
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('customer_kyc_documents', ['id' => $document->id, 'verification_status' => 'verified']);
    }

    public function test_approve_kyc_case(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('approve@test.com', 'ANALYSTE_CREDIT');
        $customerId = $this->makeCustomer();
        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'kyc_status' => 'in_review',
            'verification_level' => 'basic',
        ]);
        CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'cin',
            'verification_status' => 'verified',
        ]);
        CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'proof_of_address',
            'verification_status' => 'verified',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/kyc-cases/'.$kycCase->id.'/approve', [
            'risk_score' => 72,
        ]);

        $response->assertOk();
        $this->assertDatabaseHas('customer_kyc_cases', ['id' => $kycCase->id, 'kyc_status' => 'approved']);
    }

    public function test_reject_kyc_case_requires_reason(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('reject@test.com', 'ANALYSTE_CREDIT');
        $customerId = $this->makeCustomer();
        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'kyc_status' => 'in_review',
            'verification_level' => 'basic',
        ]);

        $bad = $this->actingAs($user, 'sanctum')->postJson('/api/v1/kyc-cases/'.$kycCase->id.'/reject', []);
        $bad->assertStatus(422);

        $ok = $this->actingAs($user, 'sanctum')->postJson('/api/v1/kyc-cases/'.$kycCase->id.'/reject', [
            'reason' => 'Document mismatch',
        ]);
        $ok->assertOk();
        $this->assertDatabaseHas('customer_kyc_cases', ['id' => $kycCase->id, 'kyc_status' => 'rejected']);
    }

    public function test_unauthorized_role_cannot_approve_kyc(): void
    {
        $this->withoutMiddleware([EnsurePermission::class, EnsureRole::class]);
        $user = $this->makeUser('agent@test.com', 'AGENT_COMMERCIAL');
        $customerId = $this->makeCustomer();
        $kycCase = CustomerKycCase::query()->create([
            'id' => (string) Str::uuid(),
            'customer_id' => $customerId,
            'kyc_status' => 'in_review',
            'verification_level' => 'basic',
        ]);
        CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'cin',
            'verification_status' => 'verified',
        ]);
        CustomerKycDocument::query()->create([
            'id' => (string) Str::uuid(),
            'kyc_case_id' => $kycCase->id,
            'document_type' => 'proof_of_address',
            'verification_status' => 'verified',
        ]);

        $response = $this->actingAs($user, 'sanctum')->postJson('/api/v1/kyc-cases/'.$kycCase->id.'/approve', []);

        $response->assertStatus(403);
    }
}

