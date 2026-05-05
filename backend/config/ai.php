<?php

return [
    'provider' => [
        'enabled' => (bool) env('AI_PROVIDER_ENABLED', false),
        'name' => env('AI_PROVIDER_NAME', 'external'),
        'api_key' => env('AI_PROVIDER_API_KEY'),
    ],
];
