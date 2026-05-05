<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Mission;
use App\Models\MissionChecklistItem;
use App\Models\MissionPhoto;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class MissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Mission::query()->orderByDesc('updated_at');
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($assigned = $request->query('assigned_user_id')) {
            $q->where('assigned_user_id', $assigned);
        }
        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($per);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'per_page' => $page->perPage(),
            'total' => $page->total(),
        ]);
    }

    public function show(Request $request, Mission $mission): JsonResponse
    {
        $mission->load(['checklistItems', 'photos']);
        return ApiResponse::success($mission);
    }

    public function start(Mission $mission): JsonResponse
    {
        $mission->status = 'in_progress';
        $mission->actual_start_at = now();
        $mission->save();

        return ApiResponse::success($mission);
    }

    public function complete(Request $request, Mission $mission): JsonResponse
    {
        $data = $request->validate([
            'status' => ['nullable', 'string', 'in:completed,failed'],
            'notes' => ['nullable', 'string'],
        ]);

        $mission->status = $data['status'] ?? 'completed';
        $mission->actual_end_at = now();
        if (isset($data['notes'])) {
            $mission->notes = $data['notes'];
        }
        $mission->save();

        return ApiResponse::success($mission);
    }

    public function addChecklistItem(Request $request, Mission $mission): JsonResponse
    {
        $data = $request->validate([
            'checklist_phase' => ['required', 'string', 'max:50'],
            'item_label' => ['required', 'string', 'max:120'],
            'item_value' => ['nullable', 'string', 'max:255'],
            'item_status' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string', 'max:255'],
        ]);

        $row = MissionChecklistItem::query()->create([
            'id' => (string) Str::uuid(),
            'mission_id' => $mission->id,
            'checklist_phase' => $data['checklist_phase'],
            'item_label' => $data['item_label'],
            'item_value' => $data['item_value'] ?? null,
            'item_status' => $data['item_status'] ?? 'DONE',
            'notes' => $data['notes'] ?? null,
        ]);

        return ApiResponse::success($row, null, null, 201);
    }

    public function uploadPhoto(Request $request, Mission $mission): JsonResponse
    {
        $data = $request->validate([
            'phase' => ['nullable', 'string', 'max:50'],
            'label' => ['nullable', 'string', 'max:120'],
            'file' => ['required', 'file', 'max:20480'],
        ]);
        $file = $request->file('file');

        $disk = 'local';
        $dir = 'mission-photos/'.$mission->id;
        $name = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
        $path = $file->storeAs($dir, $name, $disk);

        $row = DB::transaction(function () use ($mission, $data, $file, $disk, $path) {
            return MissionPhoto::query()->create([
                'id' => (string) Str::uuid(),
                'mission_id' => $mission->id,
                'phase' => $data['phase'] ?? null,
                'label' => $data['label'] ?? null,
                'original_filename' => $file->getClientOriginalName(),
                'mime_type' => $file->getClientMimeType(),
                'size_bytes' => $file->getSize(),
                'storage_disk' => $disk,
                'storage_path' => $path,
                'uploaded_by' => auth()->id(),
            ]);
        });

        return ApiResponse::success([
            'photo' => $row,
            'document_ref' => 'mph-'.$row->id,
        ], null, null, 201);
    }
}

