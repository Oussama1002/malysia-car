<?php

namespace App\Services\Signature\Providers;

class YousignProviderStub extends AbstractExternalSignatureProvider
{
    public function key(): string
    {
        return 'yousign';
    }
}
