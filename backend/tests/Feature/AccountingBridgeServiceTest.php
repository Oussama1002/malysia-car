<?php

namespace Tests\Feature;

use App\Models\AccountingEntry;
use App\Models\AccountingJournal;
use App\Models\FiscalYear;
use App\Models\Invoice;
use App\Models\Payment;
use App\Services\AccountingBridgeService;
use App\Services\FiscalYearCloseService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Smoke-test the accounting bridges: an entry is produced for a legitimate
 * source, the lines balance, calling twice is a no-op, and a missing mapping
 * degrades gracefully through trySilently.
 */
class AccountingBridgeServiceTest extends TestCase
{
    use RefreshDatabase;

    private string $companyId;
    private AccountingBridgeService $bridge;

    protected function setUp(): void
    {
        parent::setUp();
        $this->companyId = (string) Str::uuid();
        DB::table('companies')->insert([
            'id' => $this->companyId, 'legal_name' => 'DriveFlow Test',
            'default_currency' => 'MAD', 'default_locale' => 'fr', 'is_active' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->seedPcgMinimum();
        $this->seedMappings();
        $this->bridge = app(AccountingBridgeService::class);
    }

    public function test_invoice_bridge_creates_balanced_posted_entry(): void
    {
        $invoice = $this->makeInvoice(status: 'issued', subtotal: 1000, tax: 200);

        $entry = $this->bridge->fromInvoice($invoice);

        $this->assertSame('posted', $entry->status);
        $this->assertEqualsWithDelta(1200.0, (float) $entry->total_debit, 0.001);
        $this->assertEqualsWithDelta(1200.0, (float) $entry->total_credit, 0.001);
        $this->assertSame(3, $entry->lines->count(), 'client + produit + TVA');
    }

    public function test_calling_invoice_bridge_twice_is_blocked(): void
    {
        $invoice = $this->makeInvoice(status: 'issued');
        $this->bridge->fromInvoice($invoice);

        $this->expectExceptionMessage('already generated');
        $this->bridge->fromInvoice($invoice);
    }

    public function test_payment_bridge_routes_to_cash_or_bank_journal(): void
    {
        $cashPay = $this->makePayment(method: 'cash');
        $bankPay = $this->makePayment(method: 'bank_transfer');

        $cashEntry = $this->bridge->fromPayment($cashPay);
        $bankEntry = $this->bridge->fromPayment($bankPay);

        $this->assertSame('cash', AccountingJournal::find($cashEntry->journal_id)->journal_type);
        $this->assertSame('bank', AccountingJournal::find($bankEntry->journal_id)->journal_type);
    }

    public function test_credit_note_inverts_debit_and_credit(): void
    {
        $invoice = $this->makeInvoice(status: 'issued', subtotal: 500, tax: 100, type: 'credit_note');

        $entry = $this->bridge->fromInvoice($invoice);
        $lines = $entry->lines->keyBy('account_code');

        // Facture normale : 3421 D, 7061 C, 4455 C.
        // Avoir : 3421 C (on rend au client), 7061 D, 4455 D.
        $this->assertEqualsWithDelta(600.0, (float) $lines['3421']->credit, 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $lines['3421']->debit, 0.001);
        $this->assertEqualsWithDelta(500.0, (float) $lines['7061']->debit, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $lines['4455']->debit, 0.001);
    }

    public function test_fiscal_year_close_posts_a_single_balancing_entry(): void
    {
        $this->seedPcgAccount('1191', 'Résultat net', 'equity', 'credit');
        $this->bridge->fromInvoice($this->makeInvoice(status: 'issued', subtotal: 1000, tax: 200));
        $this->bridge->fromInvoice($this->makeInvoice(status: 'issued', subtotal: 500, tax: 100));

        $year = FiscalYear::first();
        $closer = app(FiscalYearCloseService::class);

        $entry = $closer->close($year, null);

        $this->assertSame('posted', $entry->status);
        $this->assertEqualsWithDelta((float) $entry->total_debit, (float) $entry->total_credit, 0.001);
        $this->assertSame('closed', $year->fresh()->status);
        $resultLine = $entry->lines->firstWhere('account_code', FiscalYearCloseService::RESULT_ACCOUNT_CODE);
        $this->assertNotNull($resultLine, 'closing entry doit contenir la ligne 1191');
        $this->assertEqualsWithDelta(1500.0, (float) $resultLine->credit, 0.001, 'tous les produits étant positifs, 1191 est crédité');
    }

    public function test_try_silently_swallows_missing_mapping(): void
    {
        // Mapping utilise le compte client 3421 — on le désactive pour simuler
        // un plan comptable amputé en prod.
        DB::table('accounting_accounts')->where('code', '3421')->delete();
        $invoice = $this->makeInvoice(status: 'issued');

        $result = $this->bridge->trySilently('fromInvoice', $invoice);

        $this->assertNull($result);
        $this->assertSame(0, AccountingEntry::where('source_id', $invoice->id)->count());
    }

    // ----------------------------------------------------------------------
    // Fixtures
    // ----------------------------------------------------------------------

    private function seedPcgMinimum(): void
    {
        $now = now();
        $accounts = [
            ['3421', 'Clients', 'asset', 'debit'],
            ['4455', 'TVA collectée', 'liability', 'credit'],
            ['5141', 'Banque', 'asset', 'debit'],
            ['5161', 'Caisse', 'asset', 'debit'],
            ['7061', 'Produits location', 'income', 'credit'],
            ['7111', 'Vente VO', 'income', 'credit'],
        ];
        foreach ($accounts as [$code, $name, $type, $balance]) {
            $this->seedPcgAccount($code, $name, $type, $balance);
        }

        foreach (['sales' => 'VE', 'bank' => 'BQ', 'cash' => 'CA', 'general' => 'OD'] as $type => $prefix) {
            DB::table('accounting_journals')->insert([
                'id' => (string) Str::uuid(), 'code' => $prefix,
                'name' => "Journal {$type}", 'journal_type' => $type,
                'is_default' => 0, 'is_active' => 1,
                'sequence_prefix' => $prefix, 'sequence_next' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        }

        $fyId = (string) Str::uuid();
        DB::table('fiscal_years')->insert([
            'id' => $fyId, 'company_id' => $this->companyId, 'code' => '2026',
            'start_date' => '2026-01-01', 'end_date' => '2026-12-31', 'status' => 'open',
            'created_at' => $now, 'updated_at' => $now,
        ]);
        DB::table('fiscal_periods')->insert([
            'id' => (string) Str::uuid(), 'fiscal_year_id' => $fyId,
            'period_number' => 1, 'start_date' => '2026-01-01', 'end_date' => '2026-12-31',
            'status' => 'open', 'created_at' => $now, 'updated_at' => $now,
        ]);
    }

    private function seedPcgAccount(string $code, string $name, string $type, string $balance): void
    {
        if (DB::table('accounting_accounts')->where('code', $code)->exists()) return;
        DB::table('accounting_accounts')->insert([
            'id' => (string) Str::uuid(), 'code' => $code, 'name' => $name,
            'account_type' => $type, 'normal_balance' => $balance,
            'is_detail' => 1, 'is_active' => 1, 'allow_direct_posting' => 1,
            'opening_balance' => 0, 'current_balance' => 0, 'currency_code' => 'MAD',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    private function seedMappings(): void
    {
        // No-op: AccountingMappingService supplies default codes when no
        // per-company override row exists, and our seedPcgMinimum() already
        // creates every account the defaults point at.
    }

    private function makeCustomer(): string
    {
        $id = (string) Str::uuid();
        DB::table('customers')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'customer_code' => 'CL-' . Str::random(5), 'customer_type' => 'particulier',
            'status' => 'active', 'risk_level' => 'low', 'is_blacklisted' => 0,
            'preferred_language' => 'fr',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return $id;
    }

    private function makeInvoice(string $status, float $subtotal = 1000, float $tax = 200, string $type = 'rental'): Invoice
    {
        $id = (string) Str::uuid();
        DB::table('invoices')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'invoice_number' => 'FA-' . Str::random(5), 'invoice_type' => $type,
            'customer_id' => $this->makeCustomer(),
            'issue_date' => '2026-06-15', 'due_date' => '2026-07-15',
            'currency_code' => 'MAD',
            'subtotal_amount' => $subtotal, 'tax_amount' => $tax, 'discount_amount' => 0,
            'total_amount' => $subtotal + $tax, 'amount_paid' => 0, 'amount_due' => $subtotal + $tax,
            'status' => $status,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return Invoice::find($id);
    }

    private function makePayment(string $method, float $amount = 500): Payment
    {
        $id = (string) Str::uuid();
        DB::table('payments')->insert([
            'id' => $id, 'company_id' => $this->companyId,
            'payment_number' => 'PAY-' . Str::random(5),
            'customer_id' => $this->makeCustomer(),
            'payment_method' => $method, 'payment_type' => 'paiement_location',
            'payment_direction' => 'incoming',
            'amount' => $amount, 'currency_code' => 'MAD',
            'amount_allocated' => 0, 'amount_unallocated' => $amount,
            'status' => 'completed', 'payment_date' => '2026-06-15',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        return Payment::find($id);
    }
}
