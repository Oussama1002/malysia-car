<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;

abstract class BaseApiController extends Controller
{
    protected function scoped(Builder $query, Request $request): Builder
    {
        $user = $request->user();
        if (! $user) {
            return $query->whereRaw('1 = 0');
        }

        $model = $query->getModel();
        if (method_exists($model, 'scopeForTenant')) {
            /** @var Model $model */
            return $model->scopeForTenant($query, $user);
        }

        return $query;
    }
}

