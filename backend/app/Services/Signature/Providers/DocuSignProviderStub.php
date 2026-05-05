<?php

namespace App\Services\Signature\Providers;

class DocuSignProviderStub extends AbstractExternalSignatureProvider
{
    public function key(): string
    {
        return 'docusign';
    }
}
