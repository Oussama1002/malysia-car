<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Additional foreign keys and indexes for tenant-scoped finance / VO / signatures.
 * Idempotent: safe on MySQL and SQLite (guards + duplicate FK detection on SQLite).
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->addCriticalFks();
        $this->addPerformanceIndexes();
    }

    public function down(): void
    {
        // additive migration — no destructive down
    }

    private function addCriticalFks(): void
    {
        $this->addFk('used_car_listings', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('used_car_listings', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('used_car_listings', 'branch_id', 'branches', 'id', 'nullOnDelete');

        $this->addFk('used_car_valuations', 'listing_id', 'used_car_listings', 'id', 'cascadeOnDelete');

        $this->addFk('used_car_sales', 'listing_id', 'used_car_listings', 'id', 'cascadeOnDelete');
        $this->addFk('used_car_sales', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('used_car_sales', 'buyer_customer_id', 'customers', 'id', 'restrictOnDelete');
        $this->addFk('used_car_sales', 'invoice_id', 'invoices', 'id', 'nullOnDelete');
        $this->addFk('used_car_sales', 'contract_id', 'contracts', 'id', 'nullOnDelete');

        $this->addFk('vehicle_ownership_transfers', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('vehicle_ownership_transfers', 'sale_id', 'used_car_sales', 'id', 'nullOnDelete');
        $this->addFk('vehicle_ownership_transfers', 'to_customer_id', 'customers', 'id', 'nullOnDelete');

        $this->addFk('invoices', 'sale_id', 'used_car_sales', 'id', 'nullOnDelete');

        $this->addFk('payment_allocations', 'contract_installment_id', 'contract_installments', 'id', 'nullOnDelete');

        if (Schema::hasTable('signature_events') && Schema::hasColumn('signature_events', 'signer_id')) {
            $this->addFk('signature_events', 'signer_id', 'signature_signers', 'id', 'nullOnDelete');
        }
    }

    private function addPerformanceIndexes(): void
    {
        $this->addIndex('vehicles', ['created_at'], 'vehicles_created_at_idx');
        $this->addIndex('customers', ['created_at'], 'customers_created_at_idx');
        $this->addIndex('invoices', ['created_at'], 'invoices_created_at_idx');
        $this->addIndex('payments', ['created_at'], 'payments_created_at_idx');
        $this->addIndex('contracts', ['created_at'], 'contracts_created_at_idx');
        $this->addIndex('used_car_listings', ['created_at'], 'used_car_listings_created_at_idx');

        if (Schema::hasTable('entity_attachments') && Schema::hasColumn('entity_attachments', 'created_at')) {
            $this->addIndex('entity_attachments', ['created_at'], 'entity_attachments_created_at_idx');
        }
    }

    private function addFk(string $table, string $column, string $refTable, string $refColumn, string $onDelete): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasTable($refTable) || ! Schema::hasColumn($table, $column)) {
            return;
        }
        if ($this->foreignKeyExists($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($column, $refTable, $refColumn, $onDelete): void {
            $fk = $blueprint->foreign($column)->references($refColumn)->on($refTable);
            if ($onDelete === 'cascadeOnDelete') {
                $fk->cascadeOnDelete();
            } elseif ($onDelete === 'nullOnDelete') {
                $fk->nullOnDelete();
            } elseif ($onDelete === 'restrictOnDelete') {
                $fk->restrictOnDelete();
            } else {
                $fk->restrictOnDelete();
            }
        });
    }

    private function addIndex(string $table, array $columns, string $name): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }
        foreach ($columns as $column) {
            if (! Schema::hasColumn($table, $column)) {
                return;
            }
        }
        if ($this->indexExists($table, $name)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($columns, $name): void {
            $blueprint->index($columns, $name);
        });
    }

    private function foreignKeyExists(string $table, string $column): bool
    {
        $driver = DB::getDriverName();
        if ($driver === 'sqlite') {
            $rows = DB::select('PRAGMA foreign_key_list('.str_replace('`', '``', $table).')');
            foreach ($rows as $row) {
                if (($row->from ?? null) === $column) {
                    return true;
                }
            }

            return false;
        }

        if ($driver === 'mysql') {
            $result = DB::selectOne(
                'SELECT COUNT(*) AS c FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?
                   AND REFERENCED_TABLE_NAME IS NOT NULL',
                [$table, $column]
            );

            return ((int) ($result->c ?? 0)) > 0;
        }

        return false;
    }

    private function indexExists(string $table, string $name): bool
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            $result = DB::selectOne(
                'SELECT COUNT(*) AS c FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND INDEX_NAME = ?',
                [$table, $name]
            );

            return ((int) ($result->c ?? 0)) > 0;
        }

        if ($driver === 'sqlite') {
            $rows = DB::select("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name = ? AND name = ?", [$table, $name]);

            return count($rows) > 0;
        }

        return false;
    }
};
