<?php

return [
    'providers' => [
        'generic' => [
            'hmac' => false,
        ],
        'teltonika' => [
            'hmac' => true,
        ],
        'webhook' => [
            'hmac' => true,
        ],
    ],
    // Internal ingestion endpoint remains available for QA/dev only.
    'internal_ingestion_route' => '/api/v1/gps/positions',
];
