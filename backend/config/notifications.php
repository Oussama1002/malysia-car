<?php

return [

    'email_enabled' => env('NOTIFICATION_EMAIL_ENABLED', true),

    'sms_enabled' => env('NOTIFICATION_SMS_ENABLED', false),

    'sms' => [
        'provider' => env('SMS_PROVIDER', 'log'), // log|external
        'api_key' => env('SMS_API_KEY'),
        'sender' => env('SMS_SENDER', 'DriveFlow'),
    ],

    /** Queue name for async email/SMS delivery jobs */
    'queue' => env('NOTIFICATION_QUEUE', 'default'),

    'max_delivery_attempts' => (int) env('NOTIFICATION_MAX_DELIVERY_ATTEMPTS', 3),

    /**
     * Default outbound channels by priority when callers pass only in_app
     * or omit granular control. Critical business events add email when enabled.
     */
    'channels_by_priority' => [
        'low' => ['in_app'],
        'normal' => ['in_app', 'email'],
        'high' => ['in_app', 'email'],
        'critical' => ['in_app', 'email', 'sms'],
    ],
];
