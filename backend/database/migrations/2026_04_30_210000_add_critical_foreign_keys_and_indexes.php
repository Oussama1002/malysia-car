<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $this->addCriticalFks();
        $this->addMissingIndexes();
    }

    public function down(): void
    {
        // Intentionally no-op: this hardening migration is additive and safe.
    }

    private function addCriticalFks(): void
    {
        $this->addFk('contracts', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('contracts', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('contracts', 'customer_id', 'customers', 'id', 'cascadeOnDelete');
        $this->addFk('contracts', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('contracts', 'credit_application_id', 'credit_applications', 'id', 'nullOnDelete');

        $this->addFk('contract_installments', 'contract_id', 'contracts', 'id', 'cascadeOnDelete');
        $this->addFk('credit_applications', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('credit_applications', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('credit_applications', 'customer_id', 'customers', 'id', 'cascadeOnDelete');
        $this->addFk('credit_applications', 'vehicle_id', 'vehicles', 'id', 'nullOnDelete');

        $this->addFk('reservations', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('reservations', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('reservations', 'customer_id', 'customers', 'id', 'cascadeOnDelete');
        $this->addFk('reservations', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');

        $this->addFk('missions', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('missions', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('missions', 'reservation_id', 'reservations', 'id', 'nullOnDelete');
        $this->addFk('missions', 'contract_id', 'contracts', 'id', 'nullOnDelete');
        $this->addFk('missions', 'vehicle_id', 'vehicles', 'id', 'nullOnDelete');

        $this->addFk('mission_checklist_items', 'mission_id', 'missions', 'id', 'cascadeOnDelete');
        $this->addFk('gps_devices', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('gps_positions', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('gps_positions', 'gps_device_id', 'gps_devices', 'id', 'cascadeOnDelete');
        $this->addFk('gps_alerts', 'vehicle_id', 'vehicles', 'id', 'cascadeOnDelete');
        $this->addFk('gps_alerts', 'gps_device_id', 'gps_devices', 'id', 'nullOnDelete');

        $this->addFk('invoices', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('invoices', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('invoices', 'customer_id', 'customers', 'id', 'cascadeOnDelete');
        $this->addFk('invoices', 'contract_id', 'contracts', 'id', 'nullOnDelete');

        $this->addFk('payments', 'company_id', 'companies', 'id', 'nullOnDelete');
        $this->addFk('payments', 'branch_id', 'branches', 'id', 'nullOnDelete');
        $this->addFk('payments', 'customer_id', 'customers', 'id', 'cascadeOnDelete');

        $this->addFk('payment_allocations', 'payment_id', 'payments', 'id', 'cascadeOnDelete');
        $this->addFk('payment_allocations', 'invoice_id', 'invoices', 'id', 'nullOnDelete');
    }

    private function addMissingIndexes(): void
    {
        $this->addIndex('contracts', ['status'], 'contracts_status_idx');
        $this->addIndex('contract_installments', ['installment_status', 'due_date'], 'contract_installments_status_due_idx');
        $this->addIndex('credit_applications', ['decision_status', 'scoring_status'], 'credit_apps_decision_scoring_idx');
        $this->addIndex('reservations', ['status', 'desired_start_at'], 'reservations_status_start_idx');
        $this->addIndex('missions', ['status', 'scheduled_start_at'], 'missions_status_sched_idx');
        $this->addIndex('invoices', ['status', 'due_date'], 'invoices_status_due_idx');
        $this->addIndex('payments', ['status', 'payment_date'], 'payments_status_date_idx');
        $this->addIndex('app_notifications', ['status', 'scheduled_at'], 'app_notifications_status_sched_idx');
        $this->addIndex('signature_envelopes', ['status', 'sent_at'], 'signature_envelopes_status_sent_idx');
        $this->addIndex('signature_signers', ['envelope_id', 'status'], 'signature_signers_env_status_idx');
        $this->addIndex('signature_events', ['envelope_id', 'occurred_at'], 'signature_events_env_occurred_idx');
    }

    private function addFk(string $table, string $column, string $refTable, string $refColumn, string $onDelete): void
    {
        if (! Schema::hasTable($table) || ! Schema::hasTable($refTable) || ! Schema::hasColumn($table, $column)) {
            return;
        }
        if ($this->foreignAlreadyExists($table, $column)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($column, $refTable, $refColumn, $onDelete): void {
            $fk = $blueprint->foreign($column)->references($refColumn)->on($refTable);
            if ($onDelete === 'cascadeOnDelete') {
                $fk->cascadeOnDelete();
            } elseif ($onDelete === 'nullOnDelete') {
                $fk->nullOnDelete();
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
        if ($this->indexAlreadyExists($table, $name)) {
            return;
        }

        Schema::table($table, function (Blueprint $blueprint) use ($columns, $name): void {
            $blueprint->index($columns, $name);
        });
    }

    private function foreignAlreadyExists(string $table, string $column): bool
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            $result = DB::selectOne(
                "SELECT COUNT(*) AS c
                 FROM information_schema.KEY_COLUMN_USAGE
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND COLUMN_NAME = ?
                   AND REFERENCED_TABLE_NAME IS NOT NULL",
                [$table, $column]
            );

            return ((int) ($result->c ?? 0)) > 0;
        }

        return false;
    }

    private function indexAlreadyExists(string $table, string $indexName): bool
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            $result = DB::selectOne(
                "SELECT COUNT(*) AS c
                 FROM information_schema.STATISTICS
                 WHERE TABLE_SCHEMA = DATABASE()
                   AND TABLE_NAME = ?
                   AND INDEX_NAME = ?",
                [$table, $indexName]
            );

            return ((int) ($result->c ?? 0)) > 0;
        }

        return false;
    }
};

