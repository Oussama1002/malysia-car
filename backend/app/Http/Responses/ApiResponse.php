<?php

namespace App\Http\Responses;

use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Http\JsonResponse;

class ApiResponse
{
    public static function success(mixed $data, ?array $meta = null, ?array $links = null, int $status = 200): JsonResponse
    {
        $payload = ['data' => $data];
        if ($meta !== null) {
            $payload['meta'] = $meta;
        }
        if ($links !== null) {
            $payload['links'] = $links;
        }

        return response()->json($payload, $status);
    }

    public static function message(string $message, int $status = 200, mixed $data = null): JsonResponse
    {
        $payload = array_filter([
            'message' => $message,
            'data' => $data,
        ], fn ($v) => $v !== null);

        return response()->json($payload, $status);
    }

    public static function error(string $message, int $status = 422, mixed $errors = null): JsonResponse
    {
        $payload = array_filter([
            'message' => $message,
            'errors' => $errors,
        ], fn ($v) => $v !== null);

        return response()->json($payload, $status);
    }

    public static function paginated(LengthAwarePaginator $paginator): JsonResponse
    {
        return response()->json([
            'data' => $paginator->items(),
            'meta' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'per_page' => $paginator->perPage(),
                'total' => $paginator->total(),
                'from' => $paginator->firstItem(),
                'to' => $paginator->lastItem(),
            ],
            'links' => [
                'first' => $paginator->url(1),
                'last' => $paginator->url($paginator->lastPage()),
                'prev' => $paginator->previousPageUrl(),
                'next' => $paginator->nextPageUrl(),
            ],
        ]);
    }
}
