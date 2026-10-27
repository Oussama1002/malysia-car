<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SavedLocation;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SavedLocationController extends Controller
{
    /**
     * List the company's saved Google Maps locations, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $locations = SavedLocation::query()
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return ApiResponse::success($locations);
    }

    /**
     * Save a new location (title + pasted Google Maps URL, optional address).
     * Coordinates are extracted from the URL when present so the preview is
     * reliable even for links without a textual address.
     */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:150'],
            'maps_url' => ['required', 'string', 'max:2000', 'url'],
            'address' => ['nullable', 'string', 'max:500'],
        ]);

        $user = $request->user();
        [$lat, $lng] = self::extractCoordinates($data['maps_url']);

        $location = SavedLocation::query()->create([
            'company_id' => $user?->company_id,
            'branch_id' => $user?->branch_id,
            'title' => $data['title'],
            'address' => $data['address'] ?? null,
            'maps_url' => $data['maps_url'],
            'latitude' => $lat,
            'longitude' => $lng,
            'created_by' => $user?->id,
        ]);

        AuditLogger::created($location, $user, null, 'mobile_ops', $request);

        return ApiResponse::success($location, null, null, 201);
    }

    /**
     * Soft-delete a saved location.
     */
    public function destroy(Request $request, SavedLocation $savedLocation): JsonResponse
    {
        $savedLocation->delete();

        AuditLogger::deleted($savedLocation, $request->user(), 'mobile_ops', $request);

        return ApiResponse::success(null, ['message' => 'Lieu supprimé.']);
    }

    /**
     * Best-effort extraction of lat/lng from a Google Maps URL.
     *
     * Handles the common forms:
     *   .../@31.6295,-7.9811,15z        (map centre)
     *   ...!3d31.6295!4d-7.9811         (place marker)
     *   ...?q=31.6295,-7.9811           / &query=31.6295,-7.9811
     *
     * Short links (maps.app.goo.gl / goo.gl/maps) are opaque and resolve to
     * nothing here — the preview then falls back to the address/title query
     * on the client, and the original URL is always kept for the open link.
     *
     * @return array{0: float|null, 1: float|null}
     */
    private static function extractCoordinates(string $url): array
    {
        $patterns = [
            '/@(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/',
            '/!3d(-?\d{1,3}\.\d+)!4d(-?\d{1,3}\.\d+)/',
            '/[?&](?:q|query|ll)=(-?\d{1,3}\.\d+),(-?\d{1,3}\.\d+)/',
        ];

        foreach ($patterns as $pattern) {
            if (preg_match($pattern, $url, $m)) {
                $lat = (float) $m[1];
                $lng = (float) $m[2];
                if ($lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180) {
                    return [$lat, $lng];
                }
            }
        }

        return [null, null];
    }
}
