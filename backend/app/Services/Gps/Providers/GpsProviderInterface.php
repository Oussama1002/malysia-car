<?php

namespace App\Services\Gps\Providers;

use App\Models\GpsProvider;
use Illuminate\Http\Request;

interface GpsProviderInterface
{
    public function code(): string;

    public function supportsHmac(): bool;

    /**
     * @return array<int,array<string,mixed>>
     */
    public function normalize(Request $request, GpsProvider $provider): array;
}
