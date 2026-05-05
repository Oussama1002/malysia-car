<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\PermissionResource;
use App\Http\Responses\ApiResponse;
use App\Models\Permission;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PermissionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Permission::query();
        if ($m = $request->query('module')) {
            $q->where('module', $m);
        }
        $perms = $q->orderBy('module')->orderBy('code')->get();

        return ApiResponse::success(PermissionResource::collection($perms)->resolve($request));
    }
}
