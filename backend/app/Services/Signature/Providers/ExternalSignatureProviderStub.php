<?php

namespace App\Services\Signature\Providers;

/**
 * Generic stub for any external provider key (e.g. Adobe).
 */
class ExternalSignatureProviderStub extends AbstractExternalSignatureProvider
{
    public function __construct(private readonly string $providerKey = 'docusign') {}

    public function key(): string
    {
        return $this->providerKey;
    }
}
