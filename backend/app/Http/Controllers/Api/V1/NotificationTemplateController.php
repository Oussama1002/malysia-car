<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\NotificationTemplate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class NotificationTemplateController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = NotificationTemplate::query()
            ->when($request->query('module'), fn ($b, $module) => $b->where('module', $module))
            ->when($request->has('is_active'), fn ($b) => $b->where('is_active', $request->boolean('is_active')))
            ->orderBy('code');

        return ApiResponse::success($q->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:80', 'unique:notification_templates,code'],
            'title_template' => ['required', 'string', 'max:255'],
            'body_template' => ['nullable', 'string'],
            'module' => ['nullable', 'string', 'max:64'],
            'priority' => ['nullable', 'in:low,normal,high,critical'],
            'channels' => ['nullable', 'array'],
            'channels.*' => ['in:in_app,email,sms'],
            'is_active' => ['nullable', 'boolean'],
        ]);

        $template = NotificationTemplate::query()->create([
            'id' => (string) Str::uuid(),
            'code' => $data['code'],
            'title_template' => $data['title_template'],
            'body_template' => $data['body_template'] ?? null,
            'module' => $data['module'] ?? null,
            'priority' => $data['priority'] ?? 'normal',
            'channels' => $data['channels'] ?? ['in_app'],
            'is_active' => $data['is_active'] ?? true,
        ]);

        return ApiResponse::success($template, status: 201);
    }
}
