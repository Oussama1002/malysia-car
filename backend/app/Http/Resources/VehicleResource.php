<?php

namespace App\Http\Resources;

use App\Models\Vehicle;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

/** @mixin Vehicle */
class VehicleResource extends JsonResource
{
    /**
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        /** @var Vehicle $v */
        $v = $this->resource;

        return [
            'id' => $v->id,
            'registration' => $v->registration_number,
            'registrationCard' => $v->registration_card_number,
            'vin' => $v->vin,
            'brand_id' => $v->brand_id,
            'model_id' => $v->model_id,
            'brand' => $v->brand?->name,
            'model' => $v->model?->model_name ?? $v->model?->name,
            'year' => $v->year ? (int) $v->year : null,
            'color' => $v->color,
            'fuel' => $v->fuel_type,
            'cv' => $v->fiscal_power,
            'mileageKm' => $v->mileage_current ? (int) $v->mileage_current : null,
            'insuranceExpiry' => $v->insurance_expiry?->toDateString(),
            'techControlExpiry' => $v->tech_control_expiry?->toDateString(),
            'vignetteExpiry' => $v->vignette_expiry?->toDateString(),
            'status' => (string) ($v->status ?? 'AVAILABLE'),
            'acquisitionType' => $v->acquisition_type,
            'purchaseCostMad' => $v->purchase_price !== null ? (float) $v->purchase_price : null,
            'currentValueMad' => $v->book_value !== null ? (float) $v->book_value : null,
            'branchId' => $v->branch_id,
            'pricePerDay' => $v->daily_rental_price !== null ? (float) $v->daily_rental_price : null,
            'photoUrl' => $this->resolvePhotoUrl($v),
        ];
    }

    private function resolvePhotoUrl(Vehicle $v): ?string
    {
        if (!$v->photo_file_id) {
            return null;
        }
        $file = \DB::table('files')->where('id', $v->photo_file_id)->first();
        if (!$file) {
            return null;
        }

        return Storage::disk($file->storage_disk)->url($file->storage_path);
    }
}

