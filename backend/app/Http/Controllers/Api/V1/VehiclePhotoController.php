<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class VehiclePhotoController extends Controller
{
    /** POST /vehicles/{vehicle}/photo */
    public function store(Request $request, Vehicle $vehicle): JsonResponse
    {
        $request->validate([
            'photo' => ['required', 'image', 'max:5120', 'mimes:jpg,jpeg,png,webp'],
        ]);

        $file = $request->file('photo');
        $ext  = $file->getClientOriginalExtension();
        $name = Str::uuid().'.'.$ext;
        $path = $file->storeAs('vehicles/photos', $name, 'public');

        // Remove old photo from storage + files table
        if ($vehicle->photo_file_id) {
            $old = DB::table('files')->where('id', $vehicle->photo_file_id)->first();
            if ($old) {
                Storage::disk('public')->delete($old->storage_path);
                DB::table('files')->where('id', $vehicle->photo_file_id)->delete();
            }
        }

        // Insert into files table (UUID PK)
        $fileId = (string) Str::uuid();
        $user   = auth()->user();
        DB::table('files')->insert([
            'id'            => $fileId,
            'company_id'    => $user?->company_id,
            'original_name' => $file->getClientOriginalName(),
            'stored_name'   => $name,
            'storage_disk'  => 'public',
            'storage_path'  => $path,
            'mime_type'     => $file->getMimeType(),
            'extension'     => $ext,
            'file_size'     => $file->getSize(),
            'is_public'     => 1,
            'uploaded_by'   => auth()->id(),
            'created_at'    => now(),
        ]);

        $vehicle->update(['photo_file_id' => $fileId]);

        return ApiResponse::success([
            'photoUrl' => Storage::disk('public')->url($path),
        ]);
    }

    /** DELETE /vehicles/{vehicle}/photo */
    public function destroy(Vehicle $vehicle): JsonResponse
    {
        if ($vehicle->photo_file_id) {
            $row = DB::table('files')->where('id', $vehicle->photo_file_id)->first();
            if ($row) {
                Storage::disk('public')->delete($row->storage_path);
                DB::table('files')->where('id', $vehicle->photo_file_id)->delete();
            }
            $vehicle->update(['photo_file_id' => null]);
        }

        return ApiResponse::message('Photo supprimée.');
    }
}
