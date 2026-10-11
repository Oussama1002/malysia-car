<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams public files (vehicle photos, etc.) through the app instead of the
 * static /storage path. The web server frequently 403s the /storage symlink
 * (file permissions / nginx rules), and <img> tags can't send auth headers —
 * so public files are served here, by their files-table id, with no auth.
 *
 * Only rows explicitly flagged is_public = 1 are served.
 */
class PublicFileController extends Controller
{
    /** GET /v1/files/{id} */
    public function show(Request $request, string $id): Response|StreamedResponse
    {
        $file = DB::table('files')->where('id', $id)->first();

        if (! $file || (int) ($file->is_public ?? 0) !== 1) {
            abort(404);
        }

        $disk = Storage::disk($file->storage_disk ?: 'public');
        if (! $disk->exists($file->storage_path)) {
            abort(404);
        }

        return $disk->response(
            $file->storage_path,
            $file->original_name ?: null,
            [
                'Content-Type' => $file->mime_type ?: 'application/octet-stream',
                'Cache-Control' => 'public, max-age=86400',
                'Content-Disposition' => 'inline',
            ],
        );
    }
}
