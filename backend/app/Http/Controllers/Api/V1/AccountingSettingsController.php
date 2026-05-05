<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\AccountingMappingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AccountingSettingsController extends Controller
{
    public function __construct(private readonly AccountingMappingService $mappingService) {}

    public function mappings(Request $request): JsonResponse
    {
        $companyId = optional($request->user())->company_id;
        return ApiResponse::success([
            'mappings' => $this->mappingService->getMappings($companyId),
        ]);
    }

    public function updateMappings(Request $request): JsonResponse
    {
        $data = $request->validate([
            'mappings' => ['required', 'array'],
            'mappings.account_client' => ['sometimes', 'string', 'max:30'],
            'mappings.account_tva_collectee' => ['sometimes', 'string', 'max:30'],
            'mappings.account_banque' => ['sometimes', 'string', 'max:30'],
            'mappings.account_caisse' => ['sometimes', 'string', 'max:30'],
            'mappings.account_produit_location' => ['sometimes', 'string', 'max:30'],
            'mappings.account_vente_vo' => ['sometimes', 'string', 'max:30'],
            'mappings.account_immobilisation_vehicule' => ['sometimes', 'string', 'max:30'],
            'mappings.account_amortissement' => ['sometimes', 'string', 'max:30'],
            'mappings.account_amortissement_cumule' => ['sometimes', 'string', 'max:30'],
            'mappings.account_penalites_retard' => ['sometimes', 'string', 'max:30'],
            'mappings.account_produits_financiers' => ['sometimes', 'string', 'max:30'],
        ]);

        $companyId = optional($request->user())->company_id;
        $saved = $this->mappingService->saveMappings($companyId, $data['mappings']);

        return ApiResponse::success(['mappings' => $saved]);
    }
}
