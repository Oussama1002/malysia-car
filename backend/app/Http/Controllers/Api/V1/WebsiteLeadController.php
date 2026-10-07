<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\WebsiteLead;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/** Les demandes du site, côté agence : on les lit, on les qualifie. */
class WebsiteLeadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = WebsiteLead::query()->with('handler')->orderByDesc('created_at');

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

    /**
     * Liste les véhicules actuellement visibles sur la landing qui n'ont pas
     * encore de tarif journalier. Même critère que `PublicSiteController::vehicles`
     * (status louable + non supprimé + 24 premiers tries par prix). Permet au
     * module « Demandes du site » de proposer un onglet dédié à la saisie.
     */
    public function missingPrices(): JsonResponse
    {
        $rows = Vehicle::query()
            ->withoutGlobalScopes()
            ->with(['brand', 'model'])
            ->whereNull('deleted_at')
            ->whereIn('status', ['AVAILABLE', 'RENTED', 'RESERVED'])
            ->orderBy('daily_rental_price')
            ->limit(24)
            ->get()
            ->filter(fn (Vehicle $v) => $v->daily_rental_price === null
                || (float) $v->daily_rental_price <= 0)
            ->map(fn (Vehicle $v) => [
                'id' => $v->id,
                'brand' => $v->brand?->name ?? $v->brand_name,
                'model' => $v->model?->model_name ?? $v->model?->name ?? $v->model_name,
                'year' => $v->year,
                'registration' => $v->registration_number,
                'fuel' => $v->fuel_type,
                'transmission' => $v->transmission,
                'categorie' => $v->categorie,
                'photo_url' => $v->photo_file_id ? '/api/v1/files/'.$v->photo_file_id : null,
            ])
            ->values()
            ->all();

        return ApiResponse::success($rows, ['total' => count($rows)]);
    }

    /**
     * Enregistre le tarif journalier d'un véhicule listé sur le site. On
     * invalide le cache de la landing pour que la nouvelle valeur apparaisse
     * tout de suite au visiteur, et on lève le throttle de l'alerte pour que
     * la notification « tarif à définir » cesse immédiatement.
     */
    public function setPrice(Request $request, Vehicle $vehicle): JsonResponse
    {
        $data = $request->validate([
            'daily_rental_price' => ['required', 'numeric', 'min:0'],
        ]);

        $vehicle->daily_rental_price = $data['daily_rental_price'];
        $vehicle->save();

        Cache::forget('public_site.vehicles');
        Cache::forget('public_site.pricing_alert:'.$vehicle->id);

        AuditLogger::updated($vehicle, $request->user(), request: $request);

        return ApiResponse::success([
            'id' => $vehicle->id,
            'daily_rental_price' => (float) $vehicle->daily_rental_price,
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

        return ApiResponse::success($lead->fresh('handler'));
    }
}
