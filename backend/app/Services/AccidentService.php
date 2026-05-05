<?php

namespace App\Services;

use App\Models\InsuranceClaim;
use App\Models\Vehicle;
use App\Models\VehicleAccident;
use App\Models\AccidentDocument;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Str;

class AccidentService
{
    /**
     * Declare a new accident and optionally change vehicle status.
     */
    public function declare(Vehicle $vehicle, array $data): VehicleAccident
    {
        $accident = VehicleAccident::create([
            'vehicle_id'              => $vehicle->id,
            'driver_user_id'          => $data['driver_user_id'] ?? null,
            'contract_id'             => $data['contract_id'] ?? null,
            'accident_date'           => $data['accident_date'],
            'location'                => $data['location'] ?? null,
            'description'             => $data['description'] ?? null,
            'severity'                => $data['severity'] ?? 'minor',
            'responsible_party'       => $data['responsible_party'] ?? null,
            'police_report_number'    => $data['police_report_number'] ?? null,
            'insurance_claim_number'  => $data['insurance_claim_number'] ?? null,
            'estimated_damage_cost'   => $data['estimated_damage_cost'] ?? null,
            'final_cost'              => $data['final_cost'] ?? null,
            'status'                  => 'declared',
            'created_by'              => auth()->id(),
        ]);

        // Block vehicle if major/total_loss
        if (in_array($data['severity'] ?? '', ['major', 'total_loss'])) {
            $vehicle->update(['status' => 'MAINTENANCE']);
        }

        if (!empty($data['insurance_claim_number'])) {
            $claim = InsuranceClaim::query()->firstOrNew(['claim_number' => $data['insurance_claim_number']]);
            if (!$claim->exists) {
                $claim->id = (string) Str::uuid();
            }
            $claim->fill([
                'accident_id' => $accident->id,
                'vehicle_id' => $vehicle->id,
                'insurer_name' => (string) ($data['insurer_name'] ?? 'N/A'),
                'declared_at' => now(),
                'estimated_amount' => $data['estimated_damage_cost'] ?? null,
                'status' => 'declared',
            ]);
            $claim->save();
        }

        return $accident;
    }

    /**
     * Transition accident through workflow states.
     */
    public function transition(VehicleAccident $accident, string $newStatus, array $data = []): VehicleAccident
    {
        $allowed = [
            'declared'     => ['under_review', 'closed'],
            'under_review' => ['repaired', 'closed'],
            'repaired'     => ['closed'],
        ];

        $current = $accident->status;
        if (!in_array($newStatus, $allowed[$current] ?? [])) {
            throw new \InvalidArgumentException("Cannot transition from {$current} to {$newStatus}.");
        }

        $accident->update(array_filter([
            'status'                 => $newStatus,
            'final_cost'             => $data['final_cost'] ?? $accident->final_cost,
            'insurance_claim_number' => $data['insurance_claim_number'] ?? $accident->insurance_claim_number,
        ]));

        // Unblock vehicle when accident closed
        if ($newStatus === 'closed') {
            $vehicle = $accident->vehicle;
            if ($vehicle?->status === 'MAINTENANCE') {
                $vehicle->update(['status' => 'AVAILABLE']);
            }
        }

        if ($accident->insurance_claim_number) {
            $claimStatus = match ($newStatus) {
                'under_review' => 'under_review',
                'repaired' => 'approved',
                'closed' => 'closed',
                default => 'declared',
            };

            InsuranceClaim::query()
                ->where('claim_number', $accident->insurance_claim_number)
                ->update([
                    'status' => $claimStatus,
                    'approved_amount' => $data['final_cost'] ?? null,
                    'reimbursed_amount' => $newStatus === 'closed' ? ($data['final_cost'] ?? null) : null,
                ]);
        }

        return $accident->fresh();
    }

    /**
     * Attach a file to an accident.
     */
    public function attachDocument(VehicleAccident $accident, UploadedFile $file, string $type): AccidentDocument
    {
        $path = $file->store("accidents/{$accident->id}", 'local');

        return AccidentDocument::create([
            'accident_id' => $accident->id,
            'type'        => $type,
            'filename'    => $file->getClientOriginalName(),
            'disk'        => 'local',
            'path'        => $path,
            'size_bytes'  => $file->getSize(),
            'mime_type'   => $file->getMimeType(),
            'uploaded_by' => auth()->id(),
        ]);
    }
}
