<?php

namespace App\Services\Gps\Providers;

use App\Models\GpsProvider;
use Illuminate\Http\Request;

class WebhookGpsProvider extends GenericGpsProvider
{
    public function code(): string
    {
        return 'webhook';
    }

    public function supportsHmac(): bool
    {
        return true;
    }

    public function normalize(Request $request, GpsProvider $provider): array
    {
        return parent::normalize($request, $provider);
    }
}
