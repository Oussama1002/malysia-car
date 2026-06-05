<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
    /** French labels for raw action_type / action_label values stored by AuditLogger */
    private static array $ACTION_FR = [
        'created'              => 'Création',
        'updated'              => 'Modification',
        'deleted'              => 'Suppression',
        'status_changed'       => 'Changement de statut',
        'approved'             => 'Approbation',
        'rejected'             => 'Rejet',
        'activated'            => 'Activation',
        'terminated'           => 'Résiliation',
        'signed'               => 'Signature',
        'sent_for_signature'   => 'Envoi pour signature',
        'schedule_generated'   => 'Échéancier généré',
        'pdf_generated'        => 'PDF généré',
        'payment_recorded'     => 'Paiement enregistré',
        'confirmed'            => 'Confirmation',
        'cancelled'            => 'Annulation',
        'handed_over'          => 'Remise véhicule',
        'returned'             => 'Retour véhicule',
        'extended'             => 'Prolongation',
        'damage_reported'      => 'Dommage signalé',
        'billing_closed'       => 'Facturation clôturée',
        'wallet_credited'      => 'Crédit portefeuille',
        'wallet_debited'       => 'Débit portefeuille',
        'wallet_adjusted'      => 'Ajustement portefeuille',
        'kyc_submitted'        => 'KYC soumis',
        'kyc_approved'         => 'KYC approuvé',
        'kyc_rejected'         => 'KYC rejeté',
        'document_uploaded'    => 'Document téléversé',
        'document_validated'   => 'Document validé',
        'financial_action'     => 'Action financière',
        'login'                => 'Connexion',
        'logout'               => 'Déconnexion',
    ];

    private function resolveActionLabel(): string
    {
        $raw = $this->action_label ?? $this->action_type ?? '';
        // If the label is already French (contains accented chars or spaces), keep it.
        // Otherwise look it up, then fall back to a readable Title Case.
        if (isset(self::$ACTION_FR[$raw])) {
            return self::$ACTION_FR[$raw];
        }
        // Label already appears to be a human sentence (not a snake_case key)
        if (str_contains($raw, ' ') || preg_match('/[àâéèêëîïôùûüç]/i', $raw)) {
            return $raw;
        }
        // Try action_type as fallback key
        $type = $this->action_type ?? '';
        if (isset(self::$ACTION_FR[$type])) {
            return self::$ACTION_FR[$type];
        }
        // Last resort: prettify snake_case
        return ucwords(str_replace('_', ' ', $raw));
    }

    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'company_id' => $this->company_id,
            'branch_id' => $this->branch_id,
            'user_id' => $this->user_id,
            'actor_email' => $this->user?->email,
            // `role` column is absent on the live MySQL users table — the
            // role lives in the `user_roles` pivot. `primaryRoleCode()` reads
            // the in-memory attribute when present (sqlite tests) and falls
            // back to the pivot otherwise (production MySQL).
            'actor_role' => $this->user?->primaryRoleCode(),
            'module' => $this->module_name,
            'action' => $this->action_type,
            'action_label' => $this->resolveActionLabel(),
            'entity_type' => $this->entity_type,
            'entity_id' => $this->entity_id,
            'changes' => [
                'before' => $this->before_data,
                'after' => $this->after_data,
            ],
            'before_data' => $this->before_data,
            'after_data' => $this->after_data,
            'legal_significance' => $this->legal_significance,
            'ip_address' => $this->ip_address,
            'user_agent' => $this->user_agent,
            'occurred_at' => $this->created_at,
            'created_at' => $this->created_at,
        ];
    }
}
