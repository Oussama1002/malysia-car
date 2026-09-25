<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Collection;

/**
 * Met le journal d'audit en français et en clair : une action lisible, qui l'a
 * faite, et ce qui a changé. Les colonnes brutes (action_type, before_data…)
 * ne veulent rien dire pour un agent.
 */
class AuditTrailPresenter
{
    private const ACTIONS = [
        'created' => 'Création',
        'updated' => 'Modification',
        'deleted' => 'Suppression',
        'status_changed' => 'Changement de statut',
        'pdf_generated' => 'PDF généré',
        'login' => 'Connexion',
        'logout' => 'Déconnexion',
        'exported' => 'Export',
        'reader_document_uploaded' => 'Document téléversé',
        'payment_recorded' => 'Paiement enregistré',
        'vehicle_swapped' => 'Changement de véhicule',
    ];

    /** Champs dont le nom technique n'évoque rien. */
    private const FIELDS = [
        'status' => 'Statut',
        'payment_status' => 'Statut de paiement',
        'amount' => 'Montant',
        'total_cost' => 'Coût total',
        'base_amount' => 'Montant',
        'start_date' => 'Date de début',
        'end_date' => 'Date de fin',
        'desired_start_at' => 'Début souhaité',
        'desired_end_at' => 'Fin souhaitée',
        'vehicle_id' => 'Véhicule',
        'customer_id' => 'Client',
        'estimated_price' => 'Prix estimé',
        'deposit_amount' => "Franchise d'assurance",
        'notes' => 'Notes',
        'mileage_current' => 'Kilométrage',
        'registration_number' => 'Immatriculation',
        'insurance_expiry' => "Expiration de l'assurance",
        'tech_control_expiry' => 'Expiration visite technique',
        'vignette_expiry' => 'Expiration vignette',
    ];

    /** Valeurs stockées en anglais qu'on ne montre jamais telles quelles. */
    private const VALUES = [
        'draft' => 'Brouillon', 'reserved' => 'Réservée', 'confirmed' => 'Confirmée',
        'pickup_scheduled' => 'Remise planifiée', 'handed_over' => 'Remise', 'active' => 'En cours',
        'extension_requested' => 'Prolongation demandée', 'return_scheduled' => 'Retour planifié',
        'returned' => 'Retournée', 'inspection_pending' => 'Inspection en attente',
        'damage_pending' => 'Dommage en attente', 'billing_pending' => 'Facturation en attente',
        'closed' => 'Clôturée', 'cancelled' => 'Annulée', 'completed' => 'Terminée',
        'available' => 'Disponible', 'rented' => 'Loué', 'maintenance' => 'Maintenance',
        'in_repair' => 'Réparation', 'unavailable' => 'Indisponible', 'sold' => 'Vendu',
        'paid' => 'Payé', 'unpaid' => 'Impayé', 'partial' => 'Partiel',
        'pending' => 'En attente', 'approved' => 'Approuvé', 'rejected' => 'Rejeté',
        'signed' => 'Signé', 'terminated' => 'Résilié', 'new' => 'Nouveau',
    ];

    /**
     * @param  Collection<int, object>  $rows  lignes de audit_logs
     * @return array<int, array<string, mixed>>
     */
    public function present(Collection $rows): array
    {
        $userNames = $this->userNames($rows);

        return $rows->map(function ($row) use ($userNames) {
            $action = (string) ($row->action_type ?? $row->action ?? '');
            $before = $this->decode($row->before_data ?? null);
            $after = $this->decode($row->after_data ?? null);

            return [
                'id' => $row->id ?? null,
                'action' => $action,
                'label' => $row->action_label ?: (self::ACTIONS[$action] ?? $this->humanize($action)),
                'detail' => $this->detail($action, $before, $after),
                'changes' => $this->changes($before, $after),
                'userName' => $userNames[$row->user_id ?? ''] ?? null,
                'module' => $row->module_name ?? null,
                'ip' => $row->ip_address ?? null,
                'createdAt' => $row->created_at ?? null,
            ];
        })->all();
    }

    /** @return array<string, string> */
    private function userNames(Collection $rows): array
    {
        $ids = $rows->pluck('user_id')->filter()->unique()->all();
        if ($ids === []) {
            return [];
        }

        return User::query()
            ->whereIn('id', $ids)
            // Pas de liste de colonnes : `name` n'existe pas sur toutes les
            // bases (production stocke first_name/last_name) et la restreindre
            // faisait tomber toute la fiche en 500.
            ->get()
            ->mapWithKeys(fn (User $u) => [$u->id => $u->name ?: $u->email])
            ->all();
    }

    /** @return array<string, mixed>|null */
    private function decode(mixed $value): ?array
    {
        if (is_array($value)) {
            return $value;
        }
        if (is_string($value) && $value !== '') {
            $decoded = json_decode($value, true);

            return is_array($decoded) ? $decoded : null;
        }

        return null;
    }

    /** Une phrase, quand l'action en dit quelque chose. */
    private function detail(string $action, ?array $before, ?array $after): ?string
    {
        if ($action === 'status_changed') {
            $from = $this->value($before['status'] ?? $after['from_status'] ?? null);
            $to = $this->value($after['status'] ?? $after['to_status'] ?? null);
            if ($from && $to) {
                return $from.' → '.$to;
            }
            if ($to) {
                return 'Nouveau statut : '.$to;
            }
        }

        return null;
    }

    /**
     * Les champs réellement modifiés, nommés en français.
     *
     * @return array<int, array{field: string, from: ?string, to: ?string}>
     */
    private function changes(?array $before, ?array $after): array
    {
        if (! $after) {
            return [];
        }

        $changes = [];
        foreach ($after as $field => $newValue) {
            if (is_array($newValue) || $field === 'updated_at' || $field === 'created_at') {
                continue;
            }
            $oldValue = $before[$field] ?? null;
            if ((string) $oldValue === (string) $newValue) {
                continue;
            }
            $changes[] = [
                'field' => self::FIELDS[$field] ?? $this->humanize((string) $field),
                'from' => $this->value($oldValue),
                'to' => $this->value($newValue),
            ];
            if (count($changes) >= 8) {
                break;
            }
        }

        return $changes;
    }

    private function value(mixed $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        if (is_bool($value)) {
            return $value ? 'Oui' : 'Non';
        }
        $key = mb_strtolower((string) $value);

        return self::VALUES[$key] ?? (string) $value;
    }

    private function humanize(string $value): string
    {
        return ucfirst(str_replace('_', ' ', $value));
    }
}
