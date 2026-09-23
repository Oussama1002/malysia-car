<?php

namespace Tests\Feature;

use App\Models\Invoice;
use App\Models\InvoiceLine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/** The VAT appears inside the amount already invoiced — no total moves. */
class InvoiceVatBackfillTest extends TestCase
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
        DB::table('company_settings')->insert([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'payload' => json_encode(['invoicing' => ['default_tva_pct' => 20]]),
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function makeInvoice(float $total): Invoice
    {
        $customerId = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $customerId,
            'company_id' => $this->companyId,
            'customer_code' => 'CL-'.Str::random(5),
            'customer_type' => 'PARTICULIER',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $invoice = Invoice::query()->create([
            'id' => (string) Str::uuid(),
            'company_id' => $this->companyId,
            'invoice_number' => 'FAC-'.Str::random(4),
            'invoice_type' => 'service',
            'customer_id' => $customerId,
            'issue_date' => now()->toDateString(),
            'due_date' => now()->addDays(7)->toDateString(),
            'currency_code' => 'MAD',
            'status' => 'issued',
        ]);

        InvoiceLine::query()->create([
            'id' => (string) Str::uuid(),
            'invoice_id' => $invoice->id,
            'position' => 1,
            'line_type' => 'service',
            'description' => 'Location',
            'quantity' => 1,
            'unit_price' => $total,
            'discount_amount' => 0,
            'tax_rate' => 0,
            'tax_amount' => 0,
            'line_total' => $total,
        ]);

        $invoice->refresh();
        $invoice->recalculateTotals();
        $invoice->save();

        return $invoice->fresh();
    }

    public function test_the_backfill_splits_the_vat_without_moving_the_total(): void
    {
        $invoice = $this->makeInvoice(43450);
        $this->assertSame(0.0, (float) $invoice->tax_amount);

        $this->artisan('invoices:backfill-vat')->assertSuccessful();

        $invoice->refresh();
        // 43 450 TTC à 20 % → 7 241,67 de TVA, total inchangé.
        $this->assertSame(43450.0, (float) $invoice->total_amount);
        $this->assertSame(7241.67, (float) $invoice->tax_amount);
        $this->assertSame(36208.33, (float) $invoice->subtotal_amount);
    }

    /** Personne n'a enregistré les Paramètres : le taux affiché s'applique quand même. */
    public function test_the_default_rate_applies_without_a_saved_settings_row(): void
    {
        DB::table('company_settings')->delete();
        \App\Support\CompanyDefaults::flush();

        $invoice = $this->makeInvoice(1200);
        $this->artisan('invoices:backfill-vat')->assertSuccessful();

        $invoice->refresh();
        $this->assertSame(1200.0, (float) $invoice->total_amount);
        $this->assertSame(200.0, (float) $invoice->tax_amount);
    }

    public function test_the_dry_run_writes_nothing(): void
    {
        $invoice = $this->makeInvoice(1200);

        $this->artisan('invoices:backfill-vat --dry-run')->assertSuccessful();

        $this->assertSame(0.0, (float) $invoice->fresh()->tax_amount);
    }

    public function test_an_invoice_that_already_carries_vat_is_left_alone(): void
    {
        $invoice = $this->makeInvoice(1200);
        $this->artisan('invoices:backfill-vat')->assertSuccessful();
        $first = (float) $invoice->fresh()->tax_amount;

        $this->artisan('invoices:backfill-vat')->assertSuccessful();

        $this->assertSame($first, (float) $invoice->fresh()->tax_amount);
    }
}
