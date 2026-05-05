<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class AuditLogResource extends JsonResource
{
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
            'action_label' => $this->action_label,
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
