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
                'rental_price_tiers' => $v->rental_price_tiers ?? [],
            ])
            ->values()
            ->all();

        return ApiResponse::success($rows, [
            'total' => count($rows),
            // On expose la grille des paliers pour que le popup web n'ait
            // pas à la dupliquer — un seul endroit où elle est définie.
            'tier_schema' => array_map(
                fn ($k, $v) => ['key' => $k, 'min_days' => $v['min_days'], 'max_days' => $v['max_days'], 'label' => $v['label']],
                array_keys(Vehicle::RENTAL_PRICE_TIERS),
                array_values(Vehicle::RENTAL_PRICE_TIERS),
            ),
        ]);
    }

    /**
     * Enregistre le tarif journalier d'un véhicule listé sur le site. On
     * invalide le cache de la landing pour que la nouvelle valeur apparaisse
     * tout de suite au visiteur, et on lève le throttle de l'alerte pour que
     * la notification « tarif à définir » cesse immédiatement.
     */
    public function setPrice(Request $request, Vehicle $vehicle): JsonResponse
    {
        // Deux modes de saisie :
        //  1. legacy : juste `daily_rental_price` (ancien formulaire inline).
        //  2. nouveau : `tiers` = {tier_1_2: number, tier_3_6?: number, …}.
        //     Le palier 1-2 j est obligatoire ; les autres sont optionnels et
        //     retombent sur le palier précédent côté calcul de devis.
        $rules = [
            'daily_rental_price' => ['nullable', 'numeric', 'min:0'],
            'tiers' => ['nullable', 'array'],
        ];
        foreach (array_keys(Vehicle::RENTAL_PRICE_TIERS) as $key) {
            $rules['tiers.'.$key] = ['nullable', 'numeric', 'min:0'];
        }
        $data = $request->validate($rules);

        $tiers = $data['tiers'] ?? null;
        if (is_array($tiers)) {
            // Nettoyage : on garde uniquement les clés connues avec une valeur
            // numérique > 0, pour ne pas écrire de null/0 trompeurs en base.
            $clean = [];
            foreach (array_keys(Vehicle::RENTAL_PRICE_TIERS) as $key) {
                $v = $tiers[$key] ?? null;
                if (is_numeric($v) && (float) $v > 0) {
                    $clean[$key] = (float) $v;
                }
            }
            if (! isset($clean['tier_1_2'])) {
                return response()->json([
                    'message' => 'Le palier 1-2 jours est obligatoire.',
                    'errors' => ['tiers.tier_1_2' => ['Le prix du palier 1-2 jours est obligatoire.']],
                ], 422);
            }
            $vehicle->rental_price_tiers = $clean;
            // On aligne le tarif de base sur le palier 1-2 j pour que tout le
            // code existant (devis, missing-prices, PublicSite) reste cohérent
            // sans refactor global.
            $vehicle->daily_rental_price = $clean['tier_1_2'];
        } elseif (array_key_exists('daily_rental_price', $data) && $data['daily_rental_price'] !== null) {
            $vehicle->daily_rental_price = $data['daily_rental_price'];
            // En mode legacy : on efface les paliers pour que « À partir de »
            // ne contredise pas le prix de base.
            $vehicle->rental_price_tiers = null;
        } else {
            return response()->json([
                'message' => 'Prix manquant.',
                'errors' => ['daily_rental_price' => ['Prix manquant.']],
            ], 422);
        }

        $vehicle->save();

        Cache::forget('public_site.vehicles');
        Cache::forget('public_site.pricing_alert:'.$vehicle->id);

        AuditLogger::updated($vehicle, $request->user(), request: $request);

        return ApiResponse::success([
            'id' => $vehicle->id,
            'daily_rental_price' => (float) $vehicle->daily_rental_price,
            'rental_price_tiers' => $vehicle->rental_price_tiers,
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
