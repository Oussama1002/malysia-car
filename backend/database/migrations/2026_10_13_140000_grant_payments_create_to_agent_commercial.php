<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Agents commerciaux signent les contrats et collectent le premier
 * encaissement (loyer + franchise d'assurance) depuis l'étape Paiement
 * du wizard. Sans `payments.create` leurs POST vers /v1/payments
 * reviennent en 403, et les écrans « Paiements reçus » du contrat
 * et de la réservation restent vides.
 *
 * Idempotent : on insère la paire role_permission seulement si
 * elle n'existe pas déjà. Rollback = retire ces mêmes paires.
 */
return new class extends Migration {
    private const CODES = ['payments.create', 'payments.allocate'];

    public function up(): void
    {
        $roleId = DB::table('roles')->where('code', 'AGENT_COMMERCIAL')->value('id');
        if (!$roleId) {
            return;
        }
        foreach (self::CODES as $code) {
            $permId = DB::table('permissions')->where('code', $code)->value('id');
            if (!$permId) {
                continue;
            }
            $exists = DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->where('permission_id', $permId)
                ->exists();
            if (!$exists) {
                DB::table('role_permissions')->insert([
                    'role_id' => $roleId,
                    'permission_id' => $permId,
                ]);
            }
        }
    }

    public function down(): void
    {
        $roleId = DB::table('roles')->where('code', 'AGENT_COMMERCIAL')->value('id');
        if (!$roleId) {
            return;
        }
        $permIds = DB::table('permissions')
            ->whereIn('code', self::CODES)
            ->pluck('id')
            ->all();
        DB::table('role_permissions')
            ->where('role_id', $roleId)
            ->whereIn('permission_id', $permIds)
            ->delete();
    }
};
