<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\CreditApplication;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\Vehicle;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardController extends Controller
{
    /** Payment rows that represent cash received (schema: received | allocated | refunded | reversed). */
    private function paymentCashStatuses(): array
    {
        return ['received', 'allocated'];
    }

    /**
     * Invoices that count toward recognized revenue (excludes draft / cancelled).
     *
     * @return list<string>
     */
    private function issuedInvoiceStatuses(): array
    {
        return ['issued', 'partial', 'paid', 'overdue'];
    }

    private function branchId(Request $request): ?string
    {
        $v = $request->input('branch_id');

        return $v !== null && $v !== '' ? (string) $v : null;
    }

    // ── GET /dashboard/executive ──────────────────────────────────────────

    public function executive(Request $request): JsonResponse
    {
        [$from, $to] = $this->dateRange($request);
        $branchId = $this->branchId($request);

        // Fleet book value (vehicles): COALESCE(book_value, purchase_price, 0), exclude sold fleet units
        $fleetValue = (float) (Vehicle::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->where('status', '!=', 'SOLD')
            ->selectRaw('COALESCE(SUM(COALESCE(book_value, purchase_price, 0)), 0) as fleet_sum')
            ->value('fleet_sum') ?? 0);

        // Supplemental: active vehicle-category fixed assets (accounting VNC), if table exists
        $fixedAssetFleetVnc = 0.0;
        if (Schema::hasTable('fixed_assets')) {
            $fixedAssetFleetVnc = (float) (DB::table('fixed_assets')
                ->where('category', 'vehicle')
                ->where('status', 'active')
                ->sum('book_value') ?? 0);
        }

        // Monthly revenue: issued invoices only, last 30 days by issue_date
        $monthStart = now()->subDays(30)->toDateString();
        $monthlyRevenue = (float) Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereDate('issue_date', '>=', $monthStart)
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('total_amount') ?? 0;

        // Active contracts
        $activeContracts = DB::table('contracts')
            ->whereIn('status', ['active', 'signed'])
            ->when($branchId, fn ($b) => $b->where('branch_id', $branchId))
            ->count();

        // Monthly contracted revenue (sum of monthly installments of active contracts)
        $contractedMonthly = (float) (DB::table('contracts')
            ->whereIn('status', ['active', 'signed'])
            ->when($branchId, fn ($b) => $b->where('branch_id', $branchId))
            ->sum('monthly_payment') ?? 0);

        // Overdue rate: balance-based overdue vs issued revenue in period
        $totalInvoiced = (float) Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereBetween('issue_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('total_amount') ?? 0;

        $overdueAmount = (float) Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereDate('due_date', '<', now()->toDateString())
            ->where('amount_due', '>', 0)
            ->sum('amount_due') ?? 0;

        $overdueRate = $totalInvoiced > 0
            ? round(($overdueAmount / $totalInvoiced) * 100, 2)
            : 0.0;

        // Arrears
        $arrearsCount = DB::table('arrears_cases')
            ->whereNotIn('stage', ['closed'])
            ->count();

        $arrearsOverdue = (float) (DB::table('arrears_cases')
            ->whereNotIn('stage', ['closed'])
            ->sum('total_overdue') ?? 0);

        // Cash forecast: average monthly payment inflow × heuristic
        $avgMonthlyInflow = (float) Payment::query()
            ->whereIn('status', $this->paymentCashStatuses())
            ->whereDate('payment_date', '>=', now()->subMonths(3)->toDateString())
            ->avg('amount') ?? 0;
        $cashForecast30d = max($contractedMonthly, $avgMonthlyInflow * 30 * 0.85);

        // Profitability per vehicle (maintenance: performed_at + cost_mad)
        $vehicleCount = Vehicle::query()
            ->where('status', '!=', 'SOLD')
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->count();
        $vehicleCount = max(1, $vehicleCount);

        $maintenanceCosts = (float) DB::table('vehicle_maintenance_events')
            ->whereNotNull('performed_at')
            ->whereDate('performed_at', '>=', $from)
            ->whereDate('performed_at', '<=', $to)
            ->selectRaw('COALESCE(SUM(COALESCE(cost_mad, 0)), 0) as t')
            ->value('t') ?? 0;

        $revenueForProfit = $monthlyRevenue > 0 ? $monthlyRevenue : $contractedMonthly;
        $profitPerVehicle = round(($revenueForProfit - $maintenanceCosts) / $vehicleCount, 2);

        // Customer count (schema: customers.status, not is_active)
        $customerCount = DB::table('customers')->where('status', 'active')->count();
        $customerCountSafe = max(1, $customerCount);
        $profitPerClient = round(($revenueForProfit - $maintenanceCosts) / $customerCountSafe, 2);

        // Revenue series: last 12 months — issued invoice totals by issue month
        $revenueSeries = $this->monthlyInvoiceRevenueSeries(12, $branchId);

        // Overdue trend: last 6 months
        $overdueTrend = $this->overdueRateSeries(6, $branchId);

        // Contract mix
        $contractMix = DB::table('contracts')
            ->whereIn('status', ['active', 'signed', 'draft'])
            ->when($branchId, fn ($b) => $b->where('branch_id', $branchId))
            ->select('contract_type', DB::raw('COUNT(*) as cnt'))
            ->groupBy('contract_type')
            ->get()
            ->map(fn ($r) => ['name' => strtoupper($r->contract_type ?? 'Autre'), 'value' => (int) $r->cnt])
            ->toArray();

        // Fleet occupancy (schema: vehicles.status uses uppercase codes)
        $available = Vehicle::query()->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('status', 'AVAILABLE')->count();
        $onLease = Vehicle::query()->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('status', 'RENTED')->count();
        $maintenance = Vehicle::query()->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->whereIn('status', ['MAINTENANCE', 'IN_REPAIR'])->count();
        $sold = Vehicle::query()->when($branchId, fn ($q) => $q->where('branch_id', $branchId))->where('status', 'SOLD')->count();

        $fleetOccupancy = [
            ['label' => 'Disponible', 'value' => $available],
            ['label' => 'Loué / crédit', 'value' => $onLease],
            ['label' => 'Maintenance', 'value' => $maintenance],
            ['label' => 'Vendu / cédé', 'value' => $sold],
        ];

        // Maintenance cost trend: last 6 months
        $maintenanceCostTrend = $this->maintenanceSeries(6);

        // Today's dues
        $duesToday = DB::table('contract_installments')
            ->whereDate('due_date', today())
            ->whereIn('installment_status', ['pending', 'partial'])
            ->count();

        // Pending credit: decision_status draft / pending (no legacy `status` column)
        $pendingCredit = CreditApplication::query()
            ->whereIn('decision_status', ['pending', 'draft'])
            ->count();

        // GPS alerts today — unresolved: open status OR not yet resolved (schema: status, resolved_at)
        $gpsAlerts = DB::table('gps_alerts')
            ->whereDate('triggered_at', today())
            ->where(function ($w): void {
                $w->whereNull('resolved_at')
                    ->orWhere('status', 'open');
            })
            ->count();

        return ApiResponse::success([
            'kpis' => [
                'fleet_value_mad' => round($fleetValue, 2),
                'fleet_fixed_asset_vnc_mad' => round($fixedAssetFleetVnc, 2),
                'monthly_revenue_mad' => round($monthlyRevenue > 0 ? $monthlyRevenue : $contractedMonthly, 2),
                'overdue_rate_pct' => $overdueRate,
                'cash_forecast_30d_mad' => round($cashForecast30d, 2),
                'profitability_per_vehicle_mad' => round($profitPerVehicle, 2),
                'profitability_per_client_mad' => round($profitPerClient, 2),
                'active_contracts' => $activeContracts,
                'arrears_active_count' => $arrearsCount,
                'arrears_total_overdue_mad' => round($arrearsOverdue, 2),
                'pending_credit_count' => $pendingCredit,
                'dues_today_count' => $duesToday,
                'gps_alerts_today' => $gpsAlerts,
                'fleet_vehicle_count' => $vehicleCount,
                'customer_count' => $customerCount,
            ],
            'revenue_series' => $revenueSeries,
            'overdue_trend' => $overdueTrend,
            'contract_mix' => $contractMix,
            'fleet_occupancy' => $fleetOccupancy,
            'maintenance_cost_trend' => $maintenanceCostTrend,
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // ── GET /dashboard/finance ────────────────────────────────────────────

    public function finance(Request $request): JsonResponse
    {
        [$from, $to] = $this->dateRange($request);
        $branchId = $this->branchId($request);

        $invoiceAgg = Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereBetween('issue_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('COALESCE(SUM(total_amount), 0) as revenue_total')
            ->selectRaw('COALESCE(SUM(amount_due), 0) as outstanding_total')
            ->selectRaw('COUNT(*) as cnt')
            ->first();

        // Paid in period = allocations tied to payments received in the period (canonical cash application)
        $paidAllocated = (float) DB::table('payment_allocations')
            ->join('payments', 'payment_allocations.payment_id', '=', 'payments.id')
            ->whereNotNull('payment_allocations.invoice_id')
            ->whereBetween('payments.payment_date', [$from, $to])
            ->when($branchId, fn ($b) => $b->where('payments.branch_id', $branchId))
            ->sum('payment_allocations.amount_allocated') ?? 0;

        // Canonical invoice-side paid (for reconciliation / dashboards)
        $paidOnInvoices = (float) Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereBetween('issue_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('amount_paid') ?? 0;

        // Balance-based overdue (not only status = overdue)
        $overdue = Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->whereDate('due_date', '<', now()->toDateString())
            ->where('amount_due', '>', 0)
            ->selectRaw('COALESCE(SUM(amount_due), 0) as amount')
            ->selectRaw('COUNT(*) as cnt')
            ->first();

        $collected = Payment::query()
            ->whereIn('status', $this->paymentCashStatuses())
            ->whereBetween('payment_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw('COALESCE(SUM(amount), 0) as total')
            ->selectRaw('COUNT(*) as cnt')
            ->first();

        $byMethod = Payment::query()
            ->whereIn('status', $this->paymentCashStatuses())
            ->whereBetween('payment_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->select('payment_method', DB::raw('SUM(amount) as total'))
            ->groupBy('payment_method')
            ->get();

        $vatCollected = (float) Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereBetween('issue_date', [$from, $to])
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->sum('tax_amount') ?? 0;

        // Top overdue customers — balance-based overdue + names from profiles
        $displayName = $this->customerDisplayNameSql();
        $topOverdue = DB::table('invoices')
            ->join('customers', 'invoices.customer_id', '=', 'customers.id')
            ->leftJoin('customer_company_profiles as ccp', 'customers.id', '=', 'ccp.customer_id')
            ->leftJoin('customer_individual_profiles as cip', 'customers.id', '=', 'cip.customer_id')
            ->whereIn('invoices.status', $this->issuedInvoiceStatuses())
            ->when($branchId, fn ($b) => $b->where('invoices.branch_id', $branchId))
            ->whereDate('invoices.due_date', '<', now()->toDateString())
            ->where('invoices.amount_due', '>', 0)
            ->select(
                'customers.id',
                DB::raw("MAX({$displayName}) as name"),
                DB::raw('SUM(invoices.amount_due) as overdue_amount'),
                DB::raw('COUNT(invoices.id) as invoice_count')
            )
            ->groupBy('customers.id')
            ->orderByDesc('overdue_amount')
            ->limit(5)
            ->get();

        return ApiResponse::success([
            'invoiced' => [
                'total' => round((float) ($invoiceAgg->revenue_total ?? 0), 2),
                // Paid = cash applied in period (payment_date), via payment_allocations (canonical treasury view)
                'paid' => round($paidAllocated, 2),
                'invoice_amount_paid_field' => round($paidOnInvoices, 2),
                'outstanding' => round((float) ($invoiceAgg->outstanding_total ?? 0), 2),
                'count' => (int) ($invoiceAgg->cnt ?? 0),
            ],
            'overdue' => ['amount' => round((float) ($overdue->amount ?? 0), 2), 'count' => (int) ($overdue->cnt ?? 0)],
            'collected' => ['total' => round((float) ($collected->total ?? 0), 2), 'count' => (int) ($collected->cnt ?? 0)],
            'vat_collected' => round($vatCollected, 2),
            'by_method' => $byMethod->map(fn ($r) => ['method' => $r->payment_method, 'total' => round((float) $r->total, 2)]),
            'top_overdue' => $topOverdue,
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // ── GET /dashboard/risk ───────────────────────────────────────────────

    public function risk(Request $request): JsonResponse
    {
        [$from, $to] = $this->dateRange($request);

        // Arrears by stage
        $arrearsByStage = DB::table('arrears_cases')
            ->select('stage', DB::raw('COUNT(*) as cnt'), DB::raw('SUM(total_overdue) as overdue'))
            ->groupBy('stage')
            ->get();

        $arrearsTotal = DB::table('arrears_cases')
            ->whereNotIn('stage', ['closed'])
            ->selectRaw('COUNT(*) as cnt, SUM(total_overdue) as overdue, SUM(total_recovered) as recovered')
            ->first();

        // Credit by decision status (schema: decision_status — expose as `status` for API stability)
        $creditByStatus = DB::table('credit_applications')
            ->selectRaw('decision_status as status, COUNT(*) as cnt')
            ->groupBy('decision_status')
            ->get();

        // Legal cases
        $legalByStatus = DB::table('legal_cases')
            ->select('status', DB::raw('COUNT(*) as cnt'), DB::raw('SUM(claimed_amount) as amount'))
            ->groupBy('status')
            ->get();

        // Repossession orders
        $repoOrders = DB::table('repossession_orders')
            ->select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->get();

        // Upcoming promises (promise stage with next_action_date in next 7 days)
        $upcomingPromises = DB::table('arrears_cases')
            ->where('stage', 'promise')
            ->whereBetween('next_action_date', [today()->toDateString(), today()->addDays(7)->toDateString()])
            ->count();

        $overdueSum = (float) ($arrearsTotal->overdue ?? 0);
        $recoveredSum = (float) ($arrearsTotal->recovered ?? 0);

        // Recovery rate (same threshold as historical dashboard: requires overdue > 0)
        $recoveryRate = $overdueSum > 0
            ? round(($recoveredSum / ($overdueSum + $recoveredSum)) * 100, 1)
            : 0.0;

        return ApiResponse::success([
            'arrears' => [
                'total_active' => (int) ($arrearsTotal->cnt ?? 0),
                'total_overdue' => round($overdueSum, 2),
                'total_recovered' => round($recoveredSum, 2),
                'recovery_rate' => $recoveryRate,
                'by_stage' => $arrearsByStage,
                'upcoming_promises' => $upcomingPromises,
            ],
            'credit' => [
                'by_status' => $creditByStatus,
            ],
            'legal' => [
                'by_status' => $legalByStatus,
                'repo_orders' => $repoOrders,
            ],
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // ── GET /dashboard/fleet ──────────────────────────────────────────────

    public function fleet(Request $request): JsonResponse
    {
        [$from, $to] = $this->dateRange($request);
        $branchId = $this->branchId($request);

        $statusCounts = Vehicle::query()
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->get();

        // Upcoming planned maintenance: vehicle_maintenance_plans.next_due_at (date column)
        $maintenanceScheduled = 0;
        if (Schema::hasTable('vehicle_maintenance_plans')) {
            $maintenanceScheduled = DB::table('vehicle_maintenance_plans')
                ->where('is_active', true)
                ->whereNotNull('next_due_at')
                ->whereBetween('next_due_at', [today()->toDateString(), today()->addDays(30)->toDateString()])
                ->count();
        }

        $maintenanceCostPeriod = (float) DB::table('vehicle_maintenance_events')
            ->whereNotNull('performed_at')
            ->whereDate('performed_at', '>=', $from)
            ->whereDate('performed_at', '<=', $to)
            ->selectRaw('COALESCE(SUM(COALESCE(cost_mad, 0)), 0) as t')
            ->value('t') ?? 0;

        // KM overrun: schema uses mileage_current vs contracts.allowed_km
        $kmOverrun = DB::table('vehicles')
            ->join('contracts', 'contracts.vehicle_id', '=', 'vehicles.id')
            ->whereIn('contracts.status', ['active', 'signed'])
            ->whereNotNull('contracts.allowed_km')
            ->whereRaw('CAST(vehicles.mileage_current AS REAL) > CAST(contracts.allowed_km AS REAL)')
            ->when($branchId, fn ($b) => $b->where('vehicles.branch_id', $branchId))
            ->count();

        // Fixed assets value (all active assets)
        $assetValue = null;
        if (Schema::hasTable('fixed_assets')) {
            $assetValue = DB::table('fixed_assets')
                ->where('status', 'active')
                ->selectRaw('SUM(acquisition_cost) as cost, SUM(accumulated_depreciation) as dep, SUM(book_value) as vnc')
                ->first();
        }

        // Vehicles expiring contracts in next 30 days
        $contractsExpiringSoon = DB::table('contracts')
            ->whereIn('status', ['active', 'signed'])
            ->whereBetween('end_date', [today()->toDateString(), today()->addDays(30)->toDateString()])
            ->count();

        return ApiResponse::success([
            'status_counts' => $statusCounts,
            'maintenance_scheduled_30d' => $maintenanceScheduled,
            'maintenance_cost_period' => round($maintenanceCostPeriod, 2),
            'km_overrun_count' => $kmOverrun,
            'contracts_expiring_30d' => $contractsExpiringSoon,
            'fixed_assets' => [
                'total_cost' => round((float) ($assetValue->cost ?? 0), 2),
                'total_dep' => round((float) ($assetValue->dep ?? 0), 2),
                'total_vnc' => round((float) ($assetValue->vnc ?? 0), 2),
            ],
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // ── GET /dashboard/gps ────────────────────────────────────────────────

    public function gps(Request $request): JsonResponse
    {
        [$from, $to] = $this->dateRange($request);

        $alertsByType = DB::table('gps_alerts')
            ->whereBetween('triggered_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->select('alert_type', DB::raw('COUNT(*) as cnt'))
            ->groupBy('alert_type')
            ->get();

        // Unresolved: status open OR not resolved yet (gps_alerts: vehicle_id, gps_device_id — no legacy device_id)
        $unresolvedAlerts = DB::table('gps_alerts')
            ->where(function ($w): void {
                $w->whereNull('resolved_at')
                    ->orWhere('status', 'open');
            })
            ->selectRaw(
                'COUNT(*) as total, SUM(CASE WHEN alert_type = ? THEN 1 ELSE 0 END) as speeding, SUM(CASE WHEN alert_type = ? THEN 1 ELSE 0 END) as geofence',
                ['speeding', 'geofence']
            )
            ->first();

        $devicesOnline = 0;
        $devicesTotal = 0;
        if (Schema::hasTable('gps_devices')) {
            $devicesOnline = DB::table('gps_devices')
                ->where('last_seen_at', '>=', now()->subMinutes(15))
                ->count();
            $devicesTotal = DB::table('gps_devices')->count();
        }

        $brandExpr = 'COALESCE(MAX(vb.name), MAX(vehicles.brand_name))';
        $modelExpr = 'COALESCE(MAX(vm.name), MAX(vehicles.model_name))';

        $topSpeedingQuery = DB::table('gps_alerts')
            ->join('vehicles', 'gps_alerts.vehicle_id', '=', 'vehicles.id')
            ->leftJoin('vehicle_brands as vb', 'vehicles.brand_id', '=', 'vb.id')
            ->leftJoin('vehicle_models as vm', 'vehicles.model_id', '=', 'vm.id')
            ->where('gps_alerts.alert_type', 'speeding')
            ->whereBetween('gps_alerts.triggered_at', [$from.' 00:00:00', $to.' 23:59:59'])
            ->select(
                'vehicles.id',
                'vehicles.registration_number',
                DB::raw("{$brandExpr} as brand_name"),
                DB::raw("{$modelExpr} as model_name"),
                DB::raw('COUNT(gps_alerts.id) as alert_count')
            )
            ->groupBy('vehicles.id', 'vehicles.registration_number');

        $topSpeeding = $topSpeedingQuery
            ->orderByDesc('alert_count')
            ->limit(5)
            ->get();

        return ApiResponse::success([
            'alerts_by_type' => $alertsByType,
            'unresolved' => [
                'total' => (int) ($unresolvedAlerts->total ?? 0),
                'speeding' => (int) ($unresolvedAlerts->speeding ?? 0),
                'geofence' => (int) ($unresolvedAlerts->geofence ?? 0),
            ],
            'devices_online' => $devicesOnline,
            'devices_total' => $devicesTotal,
            'top_speeding' => $topSpeeding,
            'period' => ['from' => $from, 'to' => $to],
        ]);
    }

    // ── Private helpers ───────────────────────────────────────────────────

    private function dateRange(Request $request): array
    {
        $range = $request->string('range', '30d');
        $to = $request->string('to', now()->toDateString());
        $from = match ((string) $range) {
            '7d' => now()->subDays(7)->toDateString(),
            '30d' => now()->subDays(30)->toDateString(),
            '90d' => now()->subDays(90)->toDateString(),
            'ytd' => now()->startOfYear()->toDateString(),
            default => $request->string('from', now()->subDays(30)->toDateString()),
        };

        return [$from, (string) $to];
    }

    /**
     * Display label for overdue ranking — joins company / individual profile tables (see Phase 3 migrations).
     */
    private function customerDisplayNameSql(): string
    {
        $individual = DB::connection()->getDriverName() === 'sqlite'
            ? "TRIM(COALESCE(cip.first_name, '') || ' ' || COALESCE(cip.last_name, ''))"
            : "TRIM(CONCAT(COALESCE(cip.first_name, ''), ' ', COALESCE(cip.last_name, '')))";

        return "COALESCE(ccp.legal_name, {$individual}, customers.customer_code)";
    }

    private function sqlMonthKeyExpr(string $column): string
    {
        return match (DB::connection()->getDriverName()) {
            'sqlite' => "strftime('%Y-%m', {$column})",
            default => "DATE_FORMAT({$column}, '%Y-%m')",
        };
    }

    private function monthlyInvoiceRevenueSeries(int $months, ?string $branchId = null): array
    {
        $monthKey = $this->sqlMonthKeyExpr('issue_date');
        $rows = Invoice::query()
            ->whereIn('status', $this->issuedInvoiceStatuses())
            ->whereDate('issue_date', '>=', now()->subMonths($months)->startOfMonth()->toDateString())
            ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
            ->selectRaw("{$monthKey} as month_key, SUM(total_amount) as total")
            ->groupBy(DB::raw($monthKey))
            ->orderBy('month_key')
            ->get();

        return $rows->map(function ($r) {
            $label = $r->month_key;
            try {
                $label = Carbon::createFromFormat('Y-m', (string) $r->month_key)->format('M Y');
            } catch (\Throwable) {
                // keep machine month_key if parsing fails
            }

            return [
                'month' => $label,
                'value' => round(((float) ($r->total ?? 0)) / 1000, 1),
            ];
        })->toArray();
    }

    private function overdueRateSeries(int $months, ?string $branchId = null): array
    {
        $series = [];
        for ($i = $months - 1; $i >= 0; $i--) {
            $date = now()->subMonths($i);
            $startOfMonth = $date->copy()->startOfMonth()->toDateString();
            $endOfMonth = $date->copy()->endOfMonth()->toDateString();

            $total = (float) Invoice::query()
                ->whereIn('status', $this->issuedInvoiceStatuses())
                ->whereBetween('issue_date', [$startOfMonth, $endOfMonth])
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->sum('total_amount') ?? 0;

            // Open balance overdue as of month-end (issued, due by EOM, still due)
            $overdue = (float) Invoice::query()
                ->whereIn('status', $this->issuedInvoiceStatuses())
                ->when($branchId, fn ($q) => $q->where('branch_id', $branchId))
                ->whereDate('issue_date', '<=', $endOfMonth)
                ->whereDate('due_date', '<=', $endOfMonth)
                ->where('amount_due', '>', 0)
                ->sum('amount_due') ?? 0;

            $series[] = [
                'month' => $date->format('M'),
                'value' => $total > 0 ? round(($overdue / $total) * 100, 1) : 0.0,
            ];
        }

        return $series;
    }

    private function maintenanceSeries(int $months): array
    {
        $monthKey = $this->sqlMonthKeyExpr('performed_at');
        $rows = DB::table('vehicle_maintenance_events')
            ->whereNotNull('performed_at')
            ->whereDate('performed_at', '>=', now()->subMonths($months)->startOfMonth()->toDateString())
            ->selectRaw("{$monthKey} as month_key, COALESCE(SUM(COALESCE(cost_mad, 0)), 0) as total")
            ->groupBy(DB::raw($monthKey))
            ->orderBy('month_key')
            ->get();

        return $rows->map(function ($r) {
            $label = $r->month_key;
            try {
                $label = Carbon::createFromFormat('Y-m', (string) $r->month_key)->format('M Y');
            } catch (\Throwable) {
            }

            return [
                'month' => $label,
                'value' => round((float) ($r->total ?? 0), 2),
            ];
        })->toArray();
    }
}
