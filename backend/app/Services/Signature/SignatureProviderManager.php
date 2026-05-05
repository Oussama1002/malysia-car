<?php

namespace App\Services\Signature;

use App\Services\Signature\Providers\DocuSignProviderStub;
use App\Services\Signature\Providers\ExternalSignatureProviderStub;
use App\Services\Signature\Providers\InternalOtpProvider;
use App\Services\Signature\Providers\SignatureProviderInterface;
use App\Services\Signature\Providers\YousignProviderStub;
use InvalidArgumentException;

class SignatureProviderManager
{
    public function resolve(string $provider): SignatureProviderInterface
    {
        if (!$this->canUseInternalProvider($provider)) {
            throw new InvalidArgumentException('Internal OTP provider is restricted to configured non-production environments.');
        }

        return match ($provider) {
            'internal' => new InternalOtpProvider(),
            'docusign' => new DocuSignProviderStub(),
            'yousign' => new YousignProviderStub(),
            'adobe' => new ExternalSignatureProviderStub('adobe'),
            default => throw new InvalidArgumentException("Unsupported signature provider [{$provider}]"),
        };
    }

    public function resolveActive(): SignatureProviderInterface
    {
        return $this->resolve((string) config('signature.default_provider', 'yousign'));
    }

    public function canUseInternalProvider(string $provider): bool
    {
        if (strtolower($provider) !== 'internal') {
            return true;
        }

        if ((bool) config('signature.allow_internal_otp_outside_dev', false)) {
            return true;
        }

        $allowed = array_values(array_filter(
            config('signature.internal_allowed_environments', ['local', 'testing', 'staging'])
        ));
        if ($allowed === []) {
            return false;
        }

        return app()->environment(...$allowed);
    }
}

