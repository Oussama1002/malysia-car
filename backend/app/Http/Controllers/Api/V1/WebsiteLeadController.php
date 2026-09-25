<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\WebsiteLead;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** Les demandes du site, côté agence : on les lit, on les qualifie. */
class WebsiteLeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = WebsiteLead::query()->orderByDesc('created_at');

        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('full_name', 'like', "%{$search}%")
                    ->orWhere('phone', 'like', "%{$search}%")
                    ->orWhere('email', 'like', "%{$search}%");
            });
        }

        $page = $q->paginate(min(100, max(1, (int) $request->query('per_page', 50))));

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
            'new_count' => WebsiteLead::query()->where('status', WebsiteLead::STATUS_NEW)->count(),
        ]);
    }

    public function update(Request $request, WebsiteLead $lead): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', 'in:new,contacted,converted,rejected'],
            'handling_notes' => ['nullable', 'string', 'max:2000'],
        ]);

        $before = $lead->status;
        $lead->update([
            'status' => $data['status'],
            'handling_notes' => $data['handling_notes'] ?? $lead->handling_notes,
            'handled_by' => $request->user()?->id,
            'handled_at' => now(),
        ]);

        AuditLogger::statusChanged($lead, $before, $data['status'], $request->user(), $request, 'rentals');

        return ApiResponse::success($lead->fresh());
    }
}
