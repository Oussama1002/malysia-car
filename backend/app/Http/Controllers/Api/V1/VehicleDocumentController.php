<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Fleet\StoreVehicleDocumentRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleDocument;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

class VehicleDocumentController extends Controller
{
    public function store(StoreVehicleDocumentRequest $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validated();
        $file = $request->file('file');

        $disk = 'local';
        $dir = 'vehicle-documents/'.$vehicle->id;
        $name = Str::uuid()->toString().'.'.$file->getClientOriginalExtension();
        $path = $file->storeAs($dir, $name, $disk);

        $doc = VehicleDocument::query()->create([
            'vehicle_id' => $vehicle->id,
            'type' => $data['type'],
            'number' => $data['number'] ?? null,
            'issued_at' => $data['issued_at'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'original_filename' => $file->getClientOriginalName(),
            'mime_type' => $file->getClientMimeType(),
            'size_bytes' => $file->getSize(),
            'storage_disk' => $disk,
            'storage_path' => $path,
            'uploaded_by' => auth()->id(),
        ]);

        return ApiResponse::success([
            'id' => $doc->id,
            'document_ref' => 'veh-'.$doc->id,
            'type' => $doc->type,
            'expires_at' => $doc->expires_at?->toDateString(),
            'stored' => true,
        ], null, null, 201);
    }
}

