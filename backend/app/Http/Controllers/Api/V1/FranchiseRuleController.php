<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\FranchiseRule;
use App\Models\VehicleModel;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class FranchiseRuleController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $rules = FranchiseRule::query()
            ->with(['brand:id,name', 'model:id,name'])
            ->orderByDesc('amount_mad')
            ->get()
            ->map(fn (FranchiseRule $r) => $this->serialize($r));

        return ApiResponse::success($rules->all());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validatePayload($request);

        $rule = FranchiseRule::create([
            'company_id' => $request->user()?->company_id,
            'brand_id' => $data['brand_id'],
            'model_id' => $data['model_id'],
            'amount_mad' => $data['amount_mad'],
        ]);
        AuditLogger::created($rule, $request->user(), null, 'contracts', $request);

        $rule->load(['brand:id,name', 'model:id,name']);

        return ApiResponse::success($this->serialize($rule), ['message' => 'Règle de franchise créée.'], null, 201);
    }

    public function update(Request $request, FranchiseRule $franchiseRule): JsonResponse
    {
        $data = $this->validatePayload($request);
        $before = $franchiseRule->only(['brand_id', 'model_id', 'amount_mad']);

        $franchiseRule->update([
            'brand_id' => $data['brand_id'],
            'model_id' => $data['model_id'],
            'amount_mad' => $data['amount_mad'],
        ]);
        AuditLogger::updated($franchiseRule, $request->user(), $before, $franchiseRule->only(['brand_id', 'model_id', 'amount_mad']), 'contracts', $request);

        $franchiseRule->load(['brand:id,name', 'model:id,name']);

        return ApiResponse::success($this->serialize($franchiseRule), ['message' => 'Règle de franchise mise à jour.']);
    }

    public function destroy(Request $request, FranchiseRule $franchiseRule): JsonResponse
    {
        AuditLogger::deleted($franchiseRule, $request->user(), 'contracts', $request);
        $franchiseRule->delete();

        return ApiResponse::success(null, ['message' => 'Règle de franchise supprimée.']);
    }

    /**
     * @return array{brand_id: ?string, model_id: ?string, amount_mad: int}
     */
    private function validatePayload(Request $request): array
    {
        $data = $request->validate([
            'brand_id' => ['nullable', 'uuid', 'exists:vehicle_brands,id'],
            'model_id' => ['nullable', 'uuid', 'exists:vehicle_models,id'],
            'amount_mad' => ['required', 'integer', 'min:0', 'max:100000000'],
        ]);

        $brandId = $data['brand_id'] ?? null;
        $modelId = $data['model_id'] ?? null;

        if (! $brandId && ! $modelId) {
            throw ValidationException::withMessages([
                'brand_id' => 'Choisissez une marque ou un modèle pour la règle.',
            ]);
        }

        // Une règle « modèle » implique sa marque : on la renseigne pour que la
        // liste puisse regrouper par marque et rester cohérente.
        if ($modelId) {
            $brandId = VehicleModel::query()->whereKey($modelId)->value('brand_id') ?? $brandId;
        }

        return [
            'brand_id' => $brandId,
            'model_id' => $modelId,
            'amount_mad' => (int) $data['amount_mad'],
        ];
    }

    /** @return array<string, mixed> */
    private function serialize(FranchiseRule $r): array
    {
        return [
            'id' => $r->id,
            'brand_id' => $r->brand_id,
            'model_id' => $r->model_id,
            'brand_name' => $r->brand?->name,
            'model_name' => $r->model?->name,
            'amount_mad' => (int) $r->amount_mad,
        ];
    }
}
