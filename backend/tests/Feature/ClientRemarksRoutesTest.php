<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Smoke test: new routes are registered (no auth — expects 401 without token).
 */
class ClientRemarksRoutesTest extends TestCase
{
    public function test_fixed_charges_dashboard_requires_auth(): void
    {
        $response = $this->getJson('/api/v1/fixed-charges/dashboard');
        $response->assertStatus(401);
    }

    public function test_fleet_analysis_requires_auth(): void
    {
        $response = $this->getJson('/api/v1/fleet/analysis');
        $response->assertStatus(401);
    }

    public function test_sub_rentals_index_requires_auth(): void
    {
        $response = $this->getJson('/api/v1/sub-rentals');
        $response->assertStatus(401);
    }
}
