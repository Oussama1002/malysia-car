<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Contracts\StoreContractTemplateRequest;
use App\Http\Requests\Api\V1\Contracts\UpdateContractTemplateRequest;
use App\Http\Resources\ContractTemplateResource;
use App\Http\Responses\ApiResponse;
use App\Models\ContractTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ContractTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = ContractTemplate::query();

        if ($type = $request->query('contract_type')) {
            $q->where('contract_type', $type);
        }
        if ($active = $request->query('active')) {
            $q->where('is_active', filter_var($active, FILTER_VALIDATE_BOOL));
        }

        $rows = $q->orderBy('contract_type')->orderBy('code')->limit(200)->get();

        return ApiResponse::success(ContractTemplateResource::collection($rows)->resolve($request));
    }

    public function show(Request $request, ContractTemplate $contractTemplate): JsonResponse
    {
        return ApiResponse::success((new ContractTemplateResource($contractTemplate))->resolve($request));
    }

    public function store(StoreContractTemplateRequest $request): JsonResponse
    {
        $data = $request->validated();

        $t = DB::transaction(function () use ($data, $request) {
            $t = new ContractTemplate;
            $t->id = (string) Str::uuid();
            $t->company_id = $data['company_id'] ?? $request->user()?->company_id;
            $t->code = $data['code'];
            $t->contract_type = $data['contract_type'];
            $t->title = $data['title'];
            $t->template_html = $data['template_html'];
            $t->template_version = $data['template_version'] ?? '1';
            $t->is_active = (bool) ($data['is_active'] ?? true);
            $t->created_by = auth()->id();
            $t->save();

            return $t->fresh();
        });

        return ApiResponse::success((new ContractTemplateResource($t))->resolve($request), null, null, 201);
    }

    public function update(UpdateContractTemplateRequest $request, ContractTemplate $contractTemplate): JsonResponse
    {
        $data = $request->validated();
        foreach (['company_id', 'code', 'contract_type', 'title', 'template_html', 'template_version', 'is_active'] as $k) {
            if (array_key_exists($k, $data)) {
                $contractTemplate->{$k} = $data[$k];
            }
        }
        $contractTemplate->save();

        return ApiResponse::success((new ContractTemplateResource($contractTemplate->fresh()))->resolve($request));
    }

    public function destroy(ContractTemplate $contractTemplate): JsonResponse
    {
        $contractTemplate->delete();

        return ApiResponse::message('Contract template deleted', 200);
    }
}

