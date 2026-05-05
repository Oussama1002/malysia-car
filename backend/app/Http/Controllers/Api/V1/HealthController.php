<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Throwable;

class HealthController extends Controller
{
    public function show(): \Illuminate\Http\JsonResponse
    {
        $checks = [];
        $allOk = true;

        // Database
        try {
            DB::connection()->getPdo();
            $checks['database'] = 'ok';
        } catch (Throwable $e) {
            $checks['database'] = 'unavailable';
            $allOk = false;
        }

        // Queue table accessible (database driver)
        try {
            DB::table('jobs')->count();
            $checks['queue'] = 'ok';
        } catch (Throwable) {
            $checks['queue'] = 'unavailable';
            $allOk = false;
        }

        // Storage writable
        try {
            $probe = '_health_'.time();
            Storage::put($probe, '1');
            Storage::delete($probe);
            $checks['storage'] = 'ok';
        } catch (Throwable) {
            $checks['storage'] = 'not_writable';
            $allOk = false;
        }

        // APP_KEY set
        $checks['app_key'] = config('app.key') ? 'ok' : 'missing';
        if ($checks['app_key'] !== 'ok') {
            $allOk = false;
        }

        $status = $allOk ? 200 : 503;

        return response()->json([
            'success' => $allOk,
            'data' => [
                'status'  => $allOk ? 'ok' : 'degraded',
                'app'     => config('app.name'),
                'version' => '1',
                'env'     => config('app.env'),
                'php'     => PHP_VERSION,
                'laravel' => app()->version(),
                'checks'  => $checks,
                'time'    => now()->toIso8601String(),
            ],
        ], $status);
    }
}
