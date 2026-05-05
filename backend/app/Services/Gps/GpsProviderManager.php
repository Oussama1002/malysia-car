<?php

namespace App\Services\Gps;

use App\Models\GpsProvider;
use App\Services\Gps\Providers\GenericGpsProvider;
use App\Services\Gps\Providers\GpsProviderInterface;
use App\Services\Gps\Providers\TeltonikaProviderStub;
use App\Services\Gps\Providers\WebhookGpsProvider;
use RuntimeException;

class GpsProviderManager
{
    /**
     * @var array<string,GpsProviderInterface>
     */
    private array $providers;

    public function __construct()
    {
        $instances = [
            new GenericGpsProvider(),
            new TeltonikaProviderStub(),
            new WebhookGpsProvider(),
        ];
        $this->providers = [];
        foreach ($instances as $provider) {
            $this->providers[$provider->code()] = $provider;
        }
    }

    public function resolveByCode(string $code): GpsProviderInterface
    {
        $key = strtolower(trim($code));
        if (!isset($this->providers[$key])) {
            throw new RuntimeException("GPS provider unsupported: {$code}");
        }

        return $this->providers[$key];
    }

    public function getActiveProviderEntity(string $providerCode): GpsProvider
    {
        $provider = GpsProvider::query()
            ->where('provider_code', strtolower(trim($providerCode)))
            ->where('active', true)
            ->first();
        if (!$provider) {
            throw new RuntimeException("GPS provider inactive or missing: {$providerCode}");
        }

        return $provider;
    }
}
