<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Vehicle;
use App\Models\VehicleBrand;
use App\Models\VehicleModel;
use App\Models\WebsiteLead;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Le pont entre le site public de l'agence et DriveFlow. Tout y est en lecture
 * seule sauf la demande de réservation, et rien n'y est authentifié : ces deux
 * routes sont les seules que le site connaît.
 */
class PublicSiteController extends Controller
{
    /** La flotte telle qu'un visiteur peut la voir : disponible, sans prix d'achat ni interne. */
    public function vehicles(NotificationService $notifications): JsonResponse
    {
        $vehicles = Cache::remember('public_site.vehicles', 300, function () {
            return Vehicle::query()
                ->withoutGlobalScopes()
                ->with(['brand', 'model'])
                ->whereNull('deleted_at')
                ->whereIn('status', ['AVAILABLE', 'RENTED', 'RESERVED'])
                ->orderBy('daily_rental_price')
                ->limit(24)
                ->get()
                ->map(fn (Vehicle $v) => [
                    'id' => $v->id,
                    'brand' => $v->brand?->name ?? $v->brand_name,
                    'model' => $v->model?->model_name ?? $v->model?->name ?? $v->model_name,
                    'year' => $v->year,
                    'fuel' => $v->fuel_type,
                    'transmission' => $v->transmission,
                    'categorie' => $v->categorie,
                    'price_per_day' => $v->daily_rental_price !== null ? (float) $v->daily_rental_price : null,
                    'photo_url' => $v->photo_file_id ? '/api/v1/files/'.$v->photo_file_id : null,
                ])
                ->values()
                ->all();
        });

        $this->alertMissingPrices($vehicles, $notifications);

        return ApiResponse::success($vehicles);
    }

    /**
     * Alerte l'ADMIN et le GESTIONNAIRE_FLOTTE pour chaque véhicule exposé sur
     * le site public sans tarif. Throttle 24h par véhicule pour éviter de
     * saturer les notifications à chaque chargement de la landing page.
     *
     * @param  array<int, array<string, mixed>>  $vehicles
     */
    private function alertMissingPrices(array $vehicles, NotificationService $notifications): void
    {
        foreach ($vehicles as $v) {
            if (! empty($v['price_per_day'])) {
                continue;
            }
            $key = 'public_site.pricing_alert:'.$v['id'];
            if (Cache::has($key)) {
                continue;
            }
            $label = trim(($v['brand'] ?? '').' '.($v['model'] ?? '')) ?: 'Véhicule sans marque';
            try {
                $notifications->notifyRoles(
                    roleCodes: ['ADMIN', 'GESTIONNAIRE_FLOTTE'],
                    category: 'fleet.price_missing',
                    title: 'Tarif à définir pour un véhicule du site',
                    body: $label.' est affiché sur la landing sans prix / jour. Merci de renseigner le tarif.',
                    module: 'fleet',
                    priority: 'high',
                    linkUrl: '/fleet/'.$v['id'],
                );
                Cache::put($key, true, now()->addDay());
            } catch (\Throwable) {
                // Une notif ratée ne doit pas casser la page publique.
            }
        }
    }

    /**
     * Le catalogue marques + modèles de la base, exposé au site public pour
     * alimenter les menus « Marques souhaitées » et « Modèles souhaités »
     * du formulaire de réservation. On renvoie TOUT le référentiel, pas
     * uniquement les véhicules disponibles — ça aide le visiteur à exprimer
     * une préférence même sur un modèle qu'on n'a pas en stock aujourd'hui.
     *
     * Format : {brands: [{id, name}], models: [{id, name, brand_id, brand_name}]}
     * Cache 1h : le référentiel bouge rarement.
     */
    public function catalog(): JsonResponse
    {
        $data = Cache::remember('public_site.catalog', 3600, function () {
            $brands = VehicleBrand::query()
                ->orderBy('name')
                ->get(['id', 'name'])
                ->map(fn (VehicleBrand $b) => [
                    'id' => $b->id,
                    'name' => $b->name,
                ])
                ->values()
                ->all();

            $models = VehicleModel::query()
                ->with('brand:id,name')
                ->orderBy('name')
                ->get(['id', 'brand_id', 'name'])
                ->map(fn (VehicleModel $m) => [
                    'id' => $m->id,
                    'name' => $m->name,
                    'brand_id' => $m->brand_id,
                    'brand_name' => $m->brand?->name,
                ])
                ->values()
                ->all();

            return [
                'brands' => $brands,
                'models' => $models,
            ];
        });

        return ApiResponse::success($data);
    }

    /** Une demande laissée sur le site. Elle atterrit dans DriveFlow, pas dans une boîte mail. */
    public function storeLead(Request $request, NotificationService $notifications): JsonResponse
    {
        $data = $request->validate([
            'full_name' => ['required', 'string', 'max:160'],
            'phone' => ['required', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:160'],
            'city' => ['nullable', 'string', 'max:120'],
            'vehicle_id' => ['nullable', 'uuid'],
            'vehicle_label' => ['nullable', 'string', 'max:160'],
            'pickup_at' => ['nullable', 'date'],
            'return_at' => ['nullable', 'date', 'after_or_equal:pickup_at'],
            'message' => ['nullable', 'string', 'max:2000'],
            // Champ piège : un humain ne le remplit jamais.
            'website' => ['nullable', 'string', 'max:0'],
        ], [
            'return_at.after_or_equal' => 'La date de retour doit suivre la date de départ.',
        ]);

        $lead = WebsiteLead::query()->create([
            'company_id' => $this->defaultCompanyId(),
            'full_name' => $data['full_name'],
            'phone' => $data['phone'],
            'email' => $data['email'] ?? null,
            'city' => $data['city'] ?? null,
            'vehicle_id' => $data['vehicle_id'] ?? null,
            'vehicle_label' => $data['vehicle_label'] ?? null,
            'pickup_at' => $data['pickup_at'] ?? null,
            'return_at' => $data['return_at'] ?? null,
            'message' => $data['message'] ?? null,
            'status' => WebsiteLead::STATUS_NEW,
            'ip_address' => $request->ip(),
            'user_agent' => substr((string) $request->userAgent(), 0, 255),
        ]);

        try {
            $notifications->notifyRoles(
                roleCodes: ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
                category: 'sales.website_lead',
                title: 'Nouvelle demande du site',
                body: $lead->full_name.' — '.$lead->phone
                    .($lead->vehicle_label ? ' · '.$lead->vehicle_label : '')
                    .($lead->pickup_at ? ' · du '.$lead->pickup_at->format('d/m/Y') : '')
                    .($lead->return_at ? ' au '.$lead->return_at->format('d/m/Y') : ''),
                module: 'rentals',
                priority: 'high',
                entity: $lead,
                linkUrl: '/rentals/website-leads',
            );
        } catch (\Throwable) {
            // La demande est enregistrée : l'alerte manquée ne doit pas la perdre.
        }

        return ApiResponse::success([
            'reference' => strtoupper(substr($lead->id, 0, 8)),
        ], null, null, 201);
    }

    /** Le site est mono-agence : on rattache la demande à la société existante. */
    private function defaultCompanyId(): ?string
    {
        return Cache::remember(
            'public_site.company_id',
            3600,
            fn () => \DB::table('companies')->orderBy('created_at')->value('id'),
        );
    }
}
