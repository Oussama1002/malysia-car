<?php

return [
    /*
    |--------------------------------------------------------------------------
    | Default e-signature provider
    |--------------------------------------------------------------------------
    |
    | internal — OTP flow for local/staging (see internal_allowed_environments)
    | yousign | docusign | adobe — external providers (HTTP clients / webhooks)
    |
    */
    'default_provider' => env('SIGNATURE_PROVIDER', 'yousign'),

    /*
    |--------------------------------------------------------------------------
    | Internal OTP (demo) safeguards
    |--------------------------------------------------------------------------
    |
    | SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV — force-enable internal provider in
    | production (explicit escape hatch; not recommended).
    |
    | SIGNATURE_INTERNAL_ENVIRONMENTS — comma-separated Laravel environments
    | where internal OTP is permitted without the escape hatch.
    |
    | SIGNATURE_INTERNAL_OTP_LOG — when true AND environment is local|testing,
    | OTP values are written to the log for QA only. Never enabled in staging/production.
    |
    */
    'allow_internal_otp_outside_dev' => env('SIGNATURE_ALLOW_INTERNAL_OUTSIDE_DEV', false),
    'internal_allowed_environments' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('SIGNATURE_INTERNAL_ENVIRONMENTS', 'local,testing,staging'))
    ))),
    'allow_internal_otp_log' => env('SIGNATURE_INTERNAL_OTP_LOG', false),

    /*
    |--------------------------------------------------------------------------
    | Webhooks & callbacks
    |--------------------------------------------------------------------------
    |
    | SIGNATURE_WEBHOOK_SECRET — global fallback HMAC secret when a per-provider
    | secret is not set (POST body is signed with SHA-256 HMAC).
    |
    | Header: X-Signature-Hmac or X-Provider-Signature
    |
    | SIGNATURE_CALLBACK_URL — registered return URL for provider dashboards (stubs).
    |
    */
    'webhook_secret' => env('SIGNATURE_WEBHOOK_SECRET'),
    'callback_url' => env('SIGNATURE_CALLBACK_URL', env('APP_URL').'/api/v1/signatures/webhooks/provider'),

    /*
    |--------------------------------------------------------------------------
    | Document storage
    |--------------------------------------------------------------------------
    |
    | Disk used to resolve envelope document_path when source_file_id is absent.
    |
    */
    'document_storage_disk' => env('SIGNATURE_DOCUMENT_DISK', env('FILESYSTEM_DISK', 'local')),

    'providers' => [
        'internal' => [
            'label' => 'Internal OTP (demo)',
            'mode' => 'demo',
            'webhook_secret' => null,
        ],
        'yousign' => [
            'label' => 'Yousign',
            'base_url' => env('YOUSIGN_BASE_URL', 'https://api.yousign.app/v3'),
            'api_key' => env('YOUSIGN_API_KEY'),
            'webhook_secret' => env('YOUSIGN_WEBHOOK_SECRET'),
        ],
        'docusign' => [
            'label' => 'DocuSign',
            'base_url' => env('DOCUSIGN_BASE_URL', 'https://demo.docusign.net/restapi'),
            'api_key' => env('DOCUSIGN_API_KEY'),
            'webhook_secret' => env('DOCUSIGN_WEBHOOK_SECRET'),
        ],
        'adobe' => [
            'label' => 'Adobe Sign',
            'base_url' => env('ADOBE_SIGN_BASE_URL', 'https://api.na1.adobesign.com/api/rest/v6'),
            'api_key' => env('ADOBE_SIGN_API_KEY'),
            'webhook_secret' => env('ADOBE_SIGN_WEBHOOK_SECRET'),
        ],
    ],
];
