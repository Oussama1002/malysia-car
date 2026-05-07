<?php

namespace App\Models;

use App\Support\TenantScope;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Support\Str;
use App\Models\VehicleMaintenancePlan;
use App\Models\VehicleRepair;
use App\Models\VehicleAccident;
use App\Models\VehicleInsurancePolicy;
use App\Models\VehicleTechnicalInspection;
use App\Models\ComplianceAlert;
use App\Models\Reservation;
use App\Models\VehicleMovement;

class Vehicle extends Model
{
    use HasFactory, SoftDeletes, TenantScope;

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'company_id',
        'branch_id',
        'vehicle_code',
        'brand_id',
        'model_id',
        'color',
        'fuel_type',
        'fiscal_power',
        'vin',
        'registration_number',
        'registration_card_number',
        'insurance_expiry',
        'tech_control_expiry',
        'vignette_expiry',
        'chassis_number',
        'engine_number',
        'year',
        'mileage_current',
        'status',
        'ownership_status',
        'acquisition_type',
        'acquisition_date',
        'purchase_price',
        'residual_value',
        'book_value',
        'daily_rental_price',
        'monthly_rental_price',
        'availability_status',
        'gps_enabled',
        'notes',
        'photo_file_id',
        'brand_name',
        'model_name',
        'transmission',
        'chassis_number',
        'ownership_status',
        'physical_status',
        'current_location',
        'current_reservation_id',
        'unavailability_reason',
        'current_customer_id',
        'current_contract_id',
    ];

    protected $casts = [
        'gps_enabled' => 'boolean',
        'acquisition_date' => 'date',
        'insurance_expiry' => 'date',
        'tech_control_expiry' => 'date',
        'vignette_expiry' => 'date',
        'purchase_price' => 'decimal:2',
        'residual_value' => 'decimal:2',
        'book_value' => 'decimal:2',
        'daily_rental_price' => 'decimal:2',
        'monthly_rental_price' => 'decimal:2',
    ];

    protected static function booted(): void
    {
        static::creating(function (self $model): void {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    /**
     * @return BelongsTo<VehicleBrand, $this>
     */
    public function brand(): BelongsTo
    {
        return $this->belongsTo(VehicleBrand::class, 'brand_id');
    }

    /**
     * @return BelongsTo<VehicleModel, $this>
     */
    public function model(): BelongsTo
    {
        return $this->belongsTo(VehicleModel::class, 'model_id');
    }

    /**
     * @return HasMany<VehicleDocument, $this>
     */
    public function documents(): HasMany
    {
        return $this->hasMany(VehicleDocument::class, 'vehicle_id');
    }

    /**
     * @return HasMany<VehicleStatusHistory, $this>
     */
    public function statusHistory(): HasMany
    {
        return $this->hasMany(VehicleStatusHistory::class, 'vehicle_id')->orderByDesc('started_at');
    }

    /**
     * @return HasMany<VehicleMaintenanceEvent, $this>
     */
    public function maintenanceEvents(): HasMany
    {
        return $this->hasMany(VehicleMaintenanceEvent::class, 'vehicle_id')->orderByDesc('performed_at');
    }

    /**
     * @return HasMany<VehicleOdometerReading, $this>
     */
    public function odometerReadings(): HasMany
    {
        return $this->hasMany(VehicleOdometerReading::class, 'vehicle_id')->orderByDesc('read_at');
    }

    /**
     * @return HasOne<VehicleCostProfile, $this>
     */
    public function costProfile(): HasOne
    {
        return $this->hasOne(VehicleCostProfile::class, 'vehicle_id');
    }

    /**
     * @return BelongsToMany<Geofence, $this>
     */
    public function geofences(): BelongsToMany
    {
        return $this->belongsToMany(Geofence::class, 'geofence_vehicle', 'vehicle_id', 'geofence_id')
            ->withPivot(['assigned_at', 'assigned_by']);
    }

    /**
     * @return HasMany<VehicleMaintenancePlan, $this>
     */
    public function maintenancePlans(): HasMany
    {
        return $this->hasMany(VehicleMaintenancePlan::class, 'vehicle_id');
    }

    /**
     * @return HasMany<VehicleRepair, $this>
     */
    public function repairs(): HasMany
    {
        return $this->hasMany(VehicleRepair::class, 'vehicle_id')->orderByDesc('reported_at');
    }

    /**
     * @return HasMany<VehicleAccident, $this>
     */
    public function accidents(): HasMany
    {
        return $this->hasMany(VehicleAccident::class, 'vehicle_id')->orderByDesc('accident_date');
    }

    /**
     * @return HasMany<VehicleInsurancePolicy, $this>
     */
    public function insurancePolicies(): HasMany
    {
        return $this->hasMany(VehicleInsurancePolicy::class, 'vehicle_id')->orderByDesc('end_date');
    }

    /**
     * @return HasMany<VehicleTechnicalInspection, $this>
     */
    public function technicalInspections(): HasMany
    {
        return $this->hasMany(VehicleTechnicalInspection::class, 'vehicle_id')->orderByDesc('inspection_date');
    }

    /**
     * @return HasMany<ComplianceAlert, $this>
     */
    public function complianceAlerts(): HasMany
    {
        return $this->hasMany(ComplianceAlert::class, 'vehicle_id')->orderByDesc('triggered_at');
    }

    /**
     * @return HasMany<VehicleMovement, $this>
     */
    public function movements(): HasMany
    {
        return $this->hasMany(VehicleMovement::class, 'vehicle_id')->orderByDesc('performed_at');
    }

    /**
     * @return BelongsTo<Reservation, $this>
     */
    public function currentReservation(): BelongsTo
    {
        return $this->belongsTo(Reservation::class, 'current_reservation_id');
    }

    /**
     * @return HasMany<\App\Models\SubRentalContract, $this>
     */
    public function subRentalContracts(): HasMany
    {
        return $this->hasMany(\App\Models\SubRentalContract::class, 'vehicle_id');
    }

    public function activeSubRentalContract(): HasOne
    {
        return $this->hasOne(\App\Models\SubRentalContract::class, 'vehicle_id')
            ->where('status', 'active')
            ->latest();
    }

    public function isSubRented(): bool
    {
        return ($this->ownership_status ?? 'owned') === 'sub_rented';
    }
}

