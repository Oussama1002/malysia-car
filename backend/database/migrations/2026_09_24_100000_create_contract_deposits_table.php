<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Franchise d'assurance held as a guarantee — never an encaissement.
 *
 * It was recorded as a Payment of type "caution", so it landed in revenue and
 * in the customer balance. It lives on its own now: collected before the
 * vehicle is handed over, released back to the client once the return photos
 * show the vehicle is fine.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('contract_deposits')) {
            Schema::create('contract_deposits', function (Blueprint $table) {
                $table->uuid('id')->primary();
                $table->uuid('company_id')->nullable()->index();
                $table->uuid('branch_id')->nullable()->index();
                $table->uuid('contract_id')->nullable()->index();
                $table->uuid('reservation_id')->nullable()->index();
                $table->uuid('customer_id')->nullable()->index();

                $table->decimal('amount', 12, 2);
                $table->string('method', 30)->default('cheque'); // cash, cheque, bank_transfer, card, other
                $table->string('check_number', 60)->nullable();
                $table->string('check_bank', 160)->nullable();
                $table->date('check_date')->nullable();

                // held → returned (rendue au client) | retained (gardée par l'agence)
                $table->string('status', 20)->default('held')->index();
                $table->text('notes')->nullable();

                $table->uuid('collected_by')->nullable();
                $table->timestamp('collected_at')->nullable();
                $table->uuid('settled_by')->nullable();
                $table->timestamp('settled_at')->nullable();
                $table->text('settlement_notes')->nullable();

                // Set when the row came from a legacy payment of type "caution".
                $table->uuid('source_payment_id')->nullable()->index();

                $table->timestamps();
                $table->softDeletes();
            });
        }

        // Carry the cautions already recorded as payments over to the new table.
        // The payments stay for the audit trail; the code stops counting type
        // "caution" as an encaissement.
        if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'payment_type')) {
            $already = DB::table('contract_deposits')->whereNotNull('source_payment_id')->pluck('source_payment_id')->all();

            DB::table('payments')
                ->where('payment_type', 'caution')
                ->when($already !== [], fn ($q) => $q->whereNotIn('id', $already))
                ->orderBy('id')
                ->chunkById(200, function ($payments) {
                    $rows = [];
                    foreach ($payments as $p) {
                        $rows[] = [
                            'id' => (string) Str::uuid(),
                            'company_id' => $p->company_id ?? null,
                            'branch_id' => $p->branch_id ?? null,
                            'contract_id' => $p->contract_id ?? null,
                            'reservation_id' => $p->reservation_id ?? null,
                            'customer_id' => $p->customer_id ?? null,
                            'amount' => $p->amount ?? 0,
                            'method' => $this->mapMethod($p->payment_method ?? 'other'),
                            'check_number' => $p->check_number ?? null,
                            'check_bank' => $p->check_bank ?? null,
                            'check_date' => $p->check_date ?? null,
                            'status' => 'held',
                            'notes' => 'Reprise du paiement '.($p->payment_number ?? $p->id).' (type caution).',
                            'collected_by' => $p->created_by ?? null,
                            'collected_at' => $p->payment_date ?? $p->created_at ?? now(),
                            'source_payment_id' => $p->id,
                            'created_at' => now(),
                            'updated_at' => now(),
                        ];
                    }
                    if ($rows !== []) {
                        DB::table('contract_deposits')->insert($rows);
                    }
                });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('contract_deposits');
    }

    private function mapMethod(string $paymentMethod): string
    {
        return match ($paymentMethod) {
            'check', 'cheque' => 'cheque',
            'cash', 'especes' => 'cash',
            'bank_transfer', 'virement' => 'bank_transfer',
            'card', 'carte' => 'card',
            default => 'other',
        };
    }
};
