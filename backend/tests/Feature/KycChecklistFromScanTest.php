<?php

namespace Tests\Feature;

use App\Models\CustomerKycCase;
use App\Models\CustomerKycDocument;
use App\Models\ReaderDocument;
use App\Services\DocumentReader\DocumentReaderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * La CIN et le permis scannés à la saisie du client sont les pièces que la
 * checklist KYC réclame : elle doit les montrer, pas les redemander.
 */
class KycChecklistFromScanTest extends TestCase
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
    }

    private function makeCustomer(): string
    {
        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'customer_code' => 'CL-'.Str::random(5), 'customer_type' => 'PARTICULIER',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function makeReaderDocument(string $type): ReaderDocument
    {
        return ReaderDocument::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'file_path' => 'reader/'.Str::random(8).'.jpg',
            'file_name' => $type.'.jpg',
            'mime_type' => 'image/jpeg',
            'file_size' => 12345,
            'document_type' => $type,
            'status' => 'extracted',
        ]);
    }

    public function test_a_scanned_cin_fills_its_checklist_line(): void
    {
        $customerId = $this->makeCustomer();
        $case = CustomerKycCase::query()->create([
            'customer_id' => $customerId, 'kyc_status' => 'pending', 'verification_level' => 'basic',
        ]);

        app(DocumentReaderService::class)->link($this->makeReaderDocument('cin'), 'customer', $customerId);

        $doc = CustomerKycDocument::query()->where('kyc_case_id', $case->id)->first();
        $this->assertNotNull($doc);
        $this->assertSame('cin', $doc->document_type);
        $this->assertSame('pending', $doc->verification_status);
    }

    public function test_a_scanned_licence_lands_on_the_licence_line(): void
    {
        $customerId = $this->makeCustomer();
        CustomerKycCase::query()->create([
            'customer_id' => $customerId, 'kyc_status' => 'pending', 'verification_level' => 'basic',
        ]);

        app(DocumentReaderService::class)->link($this->makeReaderDocument('driving_license'), 'customer', $customerId);

        $this->assertSame(
            'driving_license',
            CustomerKycDocument::query()->first()?->document_type,
        );
    }

    public function test_the_same_file_is_not_listed_twice(): void
    {
        $customerId = $this->makeCustomer();
        CustomerKycCase::query()->create([
            'customer_id' => $customerId, 'kyc_status' => 'pending', 'verification_level' => 'basic',
        ]);
        $document = $this->makeReaderDocument('cin');

        app(DocumentReaderService::class)->link($document, 'customer', $customerId);
        app(DocumentReaderService::class)->link($document, 'customer', $customerId);

        $this->assertSame(1, CustomerKycDocument::query()->count());
    }

    public function test_a_carte_grise_has_nothing_to_do_with_the_client_checklist(): void
    {
        $customerId = $this->makeCustomer();
        CustomerKycCase::query()->create([
            'customer_id' => $customerId, 'kyc_status' => 'pending', 'verification_level' => 'basic',
        ]);

        app(DocumentReaderService::class)->link($this->makeReaderDocument('vehicle_registration'), 'customer', $customerId);

        $this->assertSame(0, CustomerKycDocument::query()->count());
    }
}
