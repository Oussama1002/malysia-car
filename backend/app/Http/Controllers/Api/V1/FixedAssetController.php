<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\DepreciationLine;
use App\Models\FixedAsset;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class FixedAssetController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = FixedAsset::query();

        if ($cat = $request->query('category')) {
            $q->where('category', $cat);
        }
        if ($status = $request->query('status')) {
            $q->where('status', $status);
        }
        if ($search = $request->query('search')) {
            $q->where(function ($w) use ($search) {
                $w->where('asset_number', 'like', "%{$search}%")
                    ->orWhere('name', 'like', "%{$search}%");
            });
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));

        return ApiResponse::paginated($q->orderByDesc('acquisition_date')->paginate($per));
    }

    public function show(FixedAsset $fixedAsset): JsonResponse
    {
        $fixedAsset->load('depreciationLines');

        return ApiResponse::success($fixedAsset);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:160'],
            'category' => ['required', 'in:vehicle,equipment,furniture,building,intangible,other'],
            'vehicle_id' => ['nullable', 'uuid'],
            'acquisition_date' => ['required', 'date'],
            'acquisition_cost' => ['required', 'numeric', 'min:0'],
            'residual_value' => ['nullable', 'numeric', 'min:0'],
            'useful_life_months' => ['nullable', 'integer', 'min:1'],
            'depreciation_method' => ['nullable', 'in:linear,declining,none'],
            'asset_account_code' => ['nullable', 'string', 'max:30'],
            'depreciation_account_code' => ['nullable', 'string', 'max:30'],
            'accumulated_dep_account_code' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
        ]);

        $cost = (float) $data['acquisition_cost'];
        $asset = FixedAsset::create(array_merge($data, [
            'id' => (string) Str::uuid(),
            'company_id' => optional($request->user())->company_id,
            'asset_number' => 'ASSET-' . strtoupper(Str::random(8)),
            'residual_value' => $data['residual_value'] ?? 0,
            'useful_life_months' => $data['useful_life_months'] ?? 60,
            'depreciation_method' => $data['depreciation_method'] ?? 'linear',
            'accumulated_depreciation' => 0,
            'book_value' => $cost,
            'status' => 'active',
        ]));

        // Generate depreciation schedule
        $this->generateSchedule($asset);

        return ApiResponse::success($asset->fresh('depreciationLines'), null, null, 201);
    }

    public function update(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:160'],
            'residual_value' => ['nullable', 'numeric', 'min:0'],
            'useful_life_months' => ['nullable', 'integer', 'min:1'],
            'depreciation_method' => ['nullable', 'in:linear,declining,none'],
            'asset_account_code' => ['nullable', 'string', 'max:30'],
            'depreciation_account_code' => ['nullable', 'string', 'max:30'],
            'accumulated_dep_account_code' => ['nullable', 'string', 'max:30'],
            'notes' => ['nullable', 'string'],
        ]);

        $fixedAsset->fill($data)->save();

        return ApiResponse::success($fixedAsset->fresh());
    }

    public function dispose(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        if ($fixedAsset->status === 'disposed') {
            return ApiResponse::message('Asset already disposed.', 422);
        }

        $data = $request->validate([
            'disposal_date' => ['required', 'date'],
            'disposal_amount' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        $fixedAsset->status = 'disposed';
        $fixedAsset->disposal_date = $data['disposal_date'];
        $fixedAsset->disposal_amount = $data['disposal_amount'] ?? 0;
        $fixedAsset->notes = trim(($fixedAsset->notes ? $fixedAsset->notes . "\n" : '') . ($data['notes'] ?? ''));
        $fixedAsset->save();

        return ApiResponse::success($fixedAsset);
    }

    public function depreciate(Request $request, FixedAsset $fixedAsset): JsonResponse
    {
        $data = $request->validate([
            'period_date' => ['required', 'date'],
        ]);

        $periodDate = Carbon::parse($data['period_date'])->endOfMonth();
        $existing = DepreciationLine::where('asset_id', $fixedAsset->id)
            ->whereDate('period_date', $periodDate->toDateString())
            ->first();

        if ($existing) {
            return ApiResponse::message('Depreciation already run for this period.', 422);
        }
        if ($fixedAsset->status !== 'active') {
            return ApiResponse::message('Asset is not active.', 422);
        }
        if ($fixedAsset->depreciation_method === 'none') {
            return ApiResponse::message('Asset has no depreciation method.', 422);
        }

        $monthly = $fixedAsset->monthlyDepreciation();
        $bookValue = (float) $fixedAsset->book_value;
        $amount = min($monthly, max(0, $bookValue - (float) $fixedAsset->residual_value));

        if ($amount <= 0) {
            return ApiResponse::message('Asset fully depreciated.', 422);
        }

        DB::transaction(function () use ($fixedAsset, $periodDate, $amount) {
            $line = DepreciationLine::create([
                'id' => (string) Str::uuid(),
                'asset_id' => $fixedAsset->id,
                'period_date' => $periodDate->toDateString(),
                'amount' => $amount,
                'cumulative_depreciation' => (float) $fixedAsset->accumulated_depreciation + $amount,
                'book_value' => max((float) $fixedAsset->residual_value, (float) $fixedAsset->book_value - $amount),
                'is_posted' => false,
            ]);

            $fixedAsset->accumulated_depreciation = $line->cumulative_depreciation;
            $fixedAsset->book_value = $line->book_value;
            $fixedAsset->save();
        });

        return ApiResponse::success($fixedAsset->fresh('depreciationLines'));
    }

    // ==================================================================
    // Private helpers
    // ==================================================================

    private function generateSchedule(FixedAsset $asset): void
    {
        if ($asset->depreciation_method === 'none') {
            return;
        }

        $start = Carbon::parse($asset->acquisition_date)->startOfMonth()->addMonth();
        $months = $asset->useful_life_months;
        $monthly = $asset->monthlyDepreciation();
        $cumulative = 0;
        $book = (float) $asset->acquisition_cost;
        $residual = (float) $asset->residual_value;

        $lines = [];
        for ($i = 0; $i < $months; $i++) {
            $periodDate = $start->copy()->addMonths($i)->endOfMonth();
            $amount = min($monthly, max(0, $book - $residual));
            if ($amount <= 0) {
                break;
            }
            $cumulative += $amount;
            $book = max($residual, $book - $amount);
            $lines[] = [
                'id' => (string) Str::uuid(),
                'asset_id' => $asset->id,
                'period_date' => $periodDate->toDateString(),
                'amount' => round($amount, 2),
                'cumulative_depreciation' => round($cumulative, 2),
                'book_value' => round($book, 2),
                'is_posted' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ];
        }

        if ($lines) {
            DepreciationLine::insert($lines);
        }
    }
}
