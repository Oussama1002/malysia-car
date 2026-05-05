<?php

namespace App\Services\Gps;

class Geo
{
    public static function haversineKm(float $lat1, float $lon1, float $lat2, float $lon2): float
    {
        $r = 6371.0;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) * sin($dLat / 2) +
            cos(deg2rad($lat1)) * cos(deg2rad($lat2)) *
            sin($dLon / 2) * sin($dLon / 2);
        $c = 2 * atan2(sqrt($a), sqrt(1 - $a));

        return $r * $c;
    }

    public static function pointInCircle(float $lat, float $lon, float $centerLat, float $centerLon, float $radiusMeters): bool
    {
        $km = self::haversineKm($lat, $lon, $centerLat, $centerLon);
        return ($km * 1000.0) <= $radiusMeters;
    }
}

