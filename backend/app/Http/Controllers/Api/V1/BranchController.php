<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Branches\StoreBranchRequest;
use App\Http\Resources\BranchResource;
use App\Http\Responses\ApiResponse;
use App\Models\Branch;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class BranchController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Branch::query()->withCount('users');
        if ($s = $request->query('search')) {
            $q->where(fn ($w) => $w->where('name', 'like', "%{$s}%")->orWhere('code', 'like', "%{$s}%")->orWhere('city', 'like', "%{$s}%"));
        }
        if ($request->has('is_active')) {
            $q->where('is_active', filter_var($request->query('is_active'), FILTER_VALIDATE_BOOLEAN));
        }
        $all = $q->orderBy('name')->get();

        return ApiResponse::success(BranchResource::collection($all)->resolve($request));
    }

    public function show(Branch $branch, Request $request): JsonResponse
    {
        $branch->loadCount('users');

        return ApiResponse::success((new BranchResource($branch))->resolve($request));
    }

    public function store(StoreBranchRequest $request): JsonResponse
    {
        $data = $request->validated();
        $data['is_active'] = $data['is_active'] ?? true;
        $branch = Branch::create($data);

        return ApiResponse::success((new BranchResource($branch))->resolve($request), null, null, 201);
    }

    public function update(StoreBranchRequest $request, Branch $branch): JsonResponse
    {
        $branch->fill($request->validated())->save();

        return ApiResponse::success((new BranchResource($branch))->resolve($request));
    }

    public function destroy(Branch $branch): JsonResponse
    {
        $branch->delete();

        return ApiResponse::message('Branch deleted', 200);
    }
}
