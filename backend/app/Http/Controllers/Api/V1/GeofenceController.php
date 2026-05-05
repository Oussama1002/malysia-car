<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Geofence;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GeofenceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Geofence::query()->orderBy('name');
        if (($active = $request->query('active')) !== null) {
            $q->where('is_active', filter_var($active, FILTER_VALIDATE_BOOL));
        }
        return ApiResponse::success($q->limit(500)->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'geofence_type' => ['required', 'string', 'in:CIRCLE,POLYGON'],
            'center_latitude' => ['nullable', 'numeric'],
            'center_longitude' => ['nullable', 'numeric'],
            'radius_meters' => ['nullable', 'numeric', 'min:1'],
            'polygon_geojson' => ['nullable', 'array'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $g = DB::transaction(function () use ($data) {
            return Geofence::query()->create([
                'id' => (string) Str::uuid(),
                'name' => $data['name'],
                'geofence_type' => $data['geofence_type'],
                'center_latitude' => $data['center_latitude'] ?? null,
                'center_longitude' => $data['center_longitude'] ?? null,
                'radius_meters' => $data['radius_meters'] ?? null,
                'polygon_geojson' => $data['polygon_geojson'] ?? null,
                'is_active' => (bool) ($data['is_active'] ?? true),
                'created_by' => auth()->id(),
            ]);
        });

        return ApiResponse::success($g, null, null, 201);
    }
}

