<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Les agents terrain (MISSIONNAIRE / AGENT_LIVRAISON) génèrent désormais le
 * contrat directement depuis la mission sur l'app mobile : à la remise du
 * véhicule, ils créent le contrat à partir de la réservation, encaissent le
 * loyer + la franchise d'assurance, activent le contrat et impriment le PDF.
 *
 * Ce flux réutilise EXACTEMENT les mêmes routes que le wizard web
 * (POST /v1/contracts, POST /v1/payments, POST /v1/contracts/{id}/activate,
 * POST /v1/contracts/{id}/generate-pdf). Sans ces permissions chaque appel
 * revient en 403 et le bouton « Générer le contrat » paraît cassé.
 *
 * Idempotent : on insère la paire role_permission seulement si elle n'existe
 * pas déjà. Rollback = retire ces mêmes paires (uniquement celles ajoutées ici).
 */
return new class extends Migration {
    /** Rôles terrain qui signent le contrat au moment de la remise. */
    private const ROLES = ['MISSIONNAIRE', 'AGENT_LIVRAISON'];

    /** Permissions nécessaires au flux de génération de contrat. */
    private const CODES = [
        'contracts.view',
        'contracts.create',
        'contracts.update',
        'contracts.activate',
        'contracts.view_installments',
        'documents.generate',
        'payments.view',
        'payments.create',
    ];

    public function up(): void
    {
        foreach (self::ROLES as $roleCode) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (!$roleId) {
                continue;
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
    }

    public function down(): void
    {
        $permIds = DB::table('permissions')
            ->whereIn('code', self::CODES)
            ->pluck('id')
            ->all();
        if (empty($permIds)) {
            return;
        }
        foreach (self::ROLES as $roleCode) {
            $roleId = DB::table('roles')->where('code', $roleCode)->value('id');
            if (!$roleId) {
                continue;
            }
            DB::table('role_permissions')
                ->where('role_id', $roleId)
                ->whereIn('permission_id', $permIds)
                ->delete();
        }
    }
};
