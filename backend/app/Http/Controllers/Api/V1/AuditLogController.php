<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\AuditLogResource;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\StreamedResponse;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = min(500, max(1, (int) $request->query('per_page', 50)));

        $paginator = $this->buildQuery($request)->paginate($perPage);
        $paginator->getCollection()->transform(fn ($l) => (new AuditLogResource($l))->toArray($request));

        return ApiResponse::paginated($paginator);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        // Note: deliberately do NOT request `role` here. The MySQL `users` table
        // shipped via `2026_05_03_231000_create_mysql_users_table_when_missing`
        // has no `role` column — the role is resolved via the `user_roles`
        // pivot. `AuditLogResource` falls back to `User::primaryRoleCode()`.
        $log = AuditLog::with('user:id,email')->findOrFail($id);

        if ($request->user()->company_id && $log->company_id && $log->company_id !== $request->user()->company_id) {
            abort(404);
        }

        return ApiResponse::success((new AuditLogResource($log))->toArray($request));
    }

    /** GET /api/v1/entities/{entityType}/{entityId}/audit */
    public function forEntity(Request $request, string $entityType, string $entityId): JsonResponse
    {
        $perPage = min(500, max(1, (int) $request->query('per_page', 100)));

        $resolved = $this->resolveEntityType($entityType);

        $paginator = AuditLog::query()
            ->with('user:id,email')
            ->when($request->user()->company_id, fn ($q, $cid) => $q->where('company_id', $cid))
            ->where(function ($q) use ($resolved) {
                $q->whereIn('entity_type', $resolved);
            })
            ->where('entity_id', $entityId)
            ->orderByDesc('created_at')
            ->paginate($perPage);

        $paginator->getCollection()->transform(fn ($l) => (new AuditLogResource($l))->toArray($request));

        return ApiResponse::paginated($paginator);
    }

    /** GET /api/v1/audit/export.csv — returns the same filtered set as index() but as CSV. */
    public function exportCsv(Request $request): StreamedResponse
    {
        $query = $this->buildQuery($request)->limit(10000);

        $filename = 'audit-'.now()->format('Ymd-His').'.csv';

        return response()->streamDownload(function () use ($query) {
            $out = fopen('php://output', 'w');
            // BOM so Excel reads UTF-8 correctly
            fwrite($out, "\xEF\xBB\xBF");
            fputcsv($out, [
                'id', 'created_at', 'module', 'action', 'action_label',
                'entity_type', 'entity_id', 'actor_email', 'actor_role',
                'company_id', 'branch_id', 'ip_address', 'legal_significance',
                'before_data', 'after_data',
            ]);
            $query->chunk(500, function ($rows) use ($out) {
                foreach ($rows as $r) {
                    fputcsv($out, [
                        $r->id,
                        optional($r->created_at)->toIso8601String(),
                        $r->module_name,
                        $r->action_type,
                        $r->action_label,
                        $r->entity_type,
                        $r->entity_id,
                        $r->user?->email,
                        $r->user?->role,
                        $r->company_id,
                        $r->branch_id,
                        $r->ip_address,
                        $r->legal_significance ? '1' : '0',
                        $r->before_data ? json_encode($r->before_data, JSON_UNESCAPED_UNICODE) : '',
                        $r->after_data ? json_encode($r->after_data, JSON_UNESCAPED_UNICODE) : '',
                    ]);
                }
            });
            fclose($out);
        }, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8',
        ]);
    }

    /** Builds the shared filtered/eager-loaded query used by index() and exportCsv(). */
    private function buildQuery(Request $request)
    {
        return AuditLog::query()
            ->with('user:id,email')
            ->when($request->user()->company_id, fn ($q, $cid) => $q->where('company_id', $cid))
            ->when($request->query('module'), fn ($q, $v) => $q->where('module_name', $v))
            ->when($request->query('action'), fn ($q, $v) => $q->where('action_type', $v))
            ->when($request->query('user_id'), fn ($q, $v) => $q->where('user_id', $v))
            ->when($request->query('entity_type'), function ($q, $v) {
                $q->whereIn('entity_type', $this->resolveEntityType((string) $v));
            })
            ->when($request->query('entity_id'), fn ($q, $v) => $q->where('entity_id', $v))
            ->when($request->query('from'), fn ($q, $v) => $q->where('created_at', '>=', $v))
            ->when($request->query('to'), fn ($q, $v) => $q->where('created_at', '<=', $v))
            ->when($request->boolean('legal_only'), fn ($q) => $q->where('legal_significance', true))
            ->when($request->query('q'), function ($q, $v) {
                $q->where(function ($qq) use ($v) {
                    $qq->where('action_label', 'like', "%{$v}%")
                        ->orWhere('action_type', 'like', "%{$v}%");
                });
            })
            ->orderByDesc('created_at');
    }

    /**
     * Map a short alias ("contract") to the FQCN(s) actually stored in `entity_type`.
     * If the caller already passes a FQCN, return it as-is.
     *
     * @return array<int, string>
     */
    private function resolveEntityType(string $alias): array
    {
        if (str_contains($alias, '\\')) {
            return [$alias];
        }

        $map = [
            'contract' => [\App\Models\Contract::class],
            'customer' => [\App\Models\Customer::class],
            'vehicle' => [\App\Models\Vehicle::class],
            'invoice' => [\App\Models\Invoice::class],
            'payment' => [\App\Models\Payment::class],
            'kyc' => [\App\Models\CustomerKycCase::class, \App\Models\CustomerKycDocument::class],
            'credit_application' => [\App\Models\CreditApplication::class],
            'legal_case' => [\App\Models\LegalCase::class],
            'arrears_case' => [\App\Models\ArrearsCase::class],
            'envelope' => [\App\Models\SignatureEnvelope::class],
            'accounting_entry' => [\App\Models\AccountingEntry::class],
            'document' => [\App\Models\GeneratedDocument::class],
        ];

        $key = strtolower($alias);
        if (isset($map[$key])) {
            return array_filter($map[$key], fn ($c) => class_exists($c));
        }

        // Fallback: try a guessed FQCN
        $studly = str_replace(' ', '', ucwords(str_replace('_', ' ', $alias)));
        $guessed = "App\\Models\\{$studly}";

        return class_exists($guessed) ? [$guessed] : [$alias];
    }
}
