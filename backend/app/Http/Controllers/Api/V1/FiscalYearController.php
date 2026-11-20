<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\FiscalPeriod;
use App\Models\FiscalYear;
use App\Services\FiscalYearCloseService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

class FiscalYearController extends Controller
{
    /**
     * Display a listing of fiscal years, newest first.
     */
    public function index(Request $request): JsonResponse
    {
        $fiscalYears = FiscalYear::orderByDesc('start_date')->get();

        return ApiResponse::success($fiscalYears);
    }

    /**
     * Store a new fiscal year and auto-generate 12 monthly periods.
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'code'       => ['required', 'string', 'max:20', 'unique:fiscal_years,code'],
            'start_date' => ['required', 'date'],
            'end_date'   => ['required', 'date', 'after:start_date'],
        ]);

        $fiscalYear = DB::transaction(function () use ($validated, $request) {
            $yearStart = Carbon::parse($validated['start_date'])->startOfDay();
            $yearEnd   = Carbon::parse($validated['end_date'])->endOfDay();

            $fiscalYear = FiscalYear::create([
                'id'         => (string) Str::uuid(),
                'company_id' => optional($request->user())->company_id,
                'code'       => $validated['code'],
                'start_date' => $yearStart->toDateString(),
                'end_date'   => $yearEnd->toDateString(),
            ]);

            // Auto-create up to 12 monthly periods within the fiscal year boundaries.
            $startYear  = $yearStart->year;
            $startMonth = $yearStart->month;

            for ($m = 1; $m <= 12; $m++) {
                // Determine the absolute month index from the fiscal year's start month.
                $monthOffset  = $startMonth + $m - 2; // 0-based offset from January
                $calendarYear = $startYear + intdiv($monthOffset, 12);
                $calendarMonth = ($monthOffset % 12) + 1;

                $periodStart = Carbon::create($calendarYear, $calendarMonth, 1)->startOfMonth();
                $periodEnd   = Carbon::create($calendarYear, $calendarMonth, 1)->endOfMonth();

                // Skip periods that fall completely outside the fiscal year range.
                if ($periodStart->gt($yearEnd) || $periodEnd->lt($yearStart)) {
                    continue;
                }

                // Clamp to fiscal year boundaries.
                if ($periodStart->lt($yearStart)) {
                    $periodStart = $yearStart->copy();
                }
                if ($periodEnd->gt($yearEnd)) {
                    $periodEnd = $yearEnd->copy();
                }

                FiscalPeriod::create([
                    'id'             => (string) Str::uuid(),
                    'fiscal_year_id' => $fiscalYear->id,
                    'period_number'  => $m,
                    'start_date'     => $periodStart->toDateString(),
                    'end_date'       => $periodEnd->toDateString(),
                    'status'         => 'open',
                ]);
            }

            return $fiscalYear;
        });

        $fiscalYear->load('periods');

        return ApiResponse::success($fiscalYear, null, null, 201);
    }

    /**
     * Display a single fiscal year with its periods.
     */
    public function show(FiscalYear $fiscalYear): JsonResponse
    {
        $fiscalYear->load('periods');

        return ApiResponse::success($fiscalYear);
    }

    /**
     * Close a fiscal year and all of its open periods.
     */
    public function close(Request $request, FiscalYear $fiscalYear, FiscalYearCloseService $closer): JsonResponse
    {
        if ($fiscalYear->status === 'closed') {
            return ApiResponse::message('This fiscal year is already closed.', 422);
        }

        $userId = optional($request->user())->id;

        try {
            $entry = $closer->close($fiscalYear, $userId);
        } catch (Throwable $e) {
            Log::warning('Fiscal year close falling back to status-only flip', [
                'fiscal_year_id' => $fiscalYear->id,
                'reason' => $e->getMessage(),
            ]);
            // Pas d'écriture de clôture possible (plan comptable incomplet,
            // exercice sans mouvement) — on ferme quand même l'exercice pour
            // bloquer les nouvelles écritures, et on remonte la raison.
            $fiscalYear->status = 'closed';
            $fiscalYear->closed_at = now();
            $fiscalYear->closed_by_user_id = $userId;
            $fiscalYear->save();
            $fiscalYear->periods()->where('status', 'open')->update(['status' => 'closed']);
            $fiscalYear->load('periods');
            return ApiResponse::success($fiscalYear, ['message' => "Exercice clôturé sans écriture: {$e->getMessage()}"]);
        }

        $fiscalYear->refresh();
        $fiscalYear->load('periods');

        return ApiResponse::success($fiscalYear, [
            'message' => "Exercice clôturé. Écriture {$entry->entry_number} générée.",
            'closing_entry_id' => $entry->id,
        ]);
    }

    /**
     * Return the currently active fiscal period (open and covering today).
     */
    public function currentPeriod(): JsonResponse
    {
        $today = Carbon::today()->toDateString();

        $period = FiscalPeriod::where('status', 'open')
            ->where('start_date', '<=', $today)
            ->where('end_date', '>=', $today)
            ->first();

        if (! $period) {
            return ApiResponse::message('No open fiscal period found for today.', 404);
        }

        return ApiResponse::success($period);
    }
}
