<?php

use Fruitcake\Cors\CorsService;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Symfony\Component\HttpFoundation\Response as SymfonyResponse;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->prepend(\Illuminate\Http\Middleware\HandleCors::class);
        $middleware->redirectGuestsTo(function (\Illuminate\Http\Request $request) {
            // API calls must return 401 JSON instead of redirecting to a missing named login route.
            if ($request->is('api/*') || $request->expectsJson()) {
                return null;
            }

            return '/login';
        });
        $middleware->alias([
            'role' => \App\Http\Middleware\EnsureRole::class,
            'permission' => \App\Http\Middleware\EnsurePermission::class,
            'tenant.scope' => \App\Http\Middleware\EnsureTenantScope::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(function ($request) {
            return $request->is('api/*') || $request->expectsJson();
        });

        // HandleCors never runs when the inner pipeline throws; browsers then report a CORS failure on 500s.
        $exceptions->respond(function (SymfonyResponse $response, \Throwable $e, \Illuminate\Http\Request $request) {
            if (! $request->headers->has('Origin') || ! $request->is('api/*')) {
                return $response;
            }
            $cors = app(CorsService::class);
            $cors->setOptions(config('cors', []));

            return $cors->addActualRequestHeaders($response, $request);
        });
    })->create();
