<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Expense;
use App\Models\ExpenseSupplier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ExpenseController extends Controller
{
    // ── Dashboard ─────────────────────────────────────────────────────────
    public function dashboard(Request $request): JsonResponse
    {
        $now = now();
        $startOfMonth = $now->copy()->startOfMonth()->toDateString();
        $endOfMonth = $now->copy()->endOfMonth()->toDateString();
        $startOfYear = $now->copy()->startOfYear()->toDateString();

        $monthlyTotal = (float) Expense::query()
            ->whereBetween('expense_date', [$startOfMonth, $endOfMonth])
            ->sum('amount');

        $yearlyTotal = (float) Expense::query()
            ->where('expense_date', '>=', $startOfYear)
            ->sum('amount');

        $overdueCount = Expense::query()
            ->where('status', 'unpaid')
            ->where('due_date', '<', $now->toDateString())
            ->count();

        $upcomingCount = Expense::query()
            ->where('status', 'unpaid')
            ->whereBetween('due_date', [$now->toDateString(), $now->copy()->addDays(30)->toDateString()])
            ->count();

        $byCategory = Expense::query()
            ->where('expense_date', '>=', $startOfYear)
            ->groupBy('category')
            ->select('category', DB::raw('SUM(amount) as total'))
            ->pluck('total', 'category');

        $byType = Expense::query()
            ->where('expense_date', '>=', $startOfYear)
            ->groupBy('expense_type')
            ->select('expense_type', DB::raw('SUM(amount) as total'))
            ->pluck('total', 'expense_type');

        $topVehicles = Expense::query()
            ->whereNotNull('vehicle_id')
            ->where('expense_date', '>=', $startOfYear)
            ->groupBy('vehicle_id')
            ->select('vehicle_id', DB::raw('SUM(amount) as total'))
            ->orderByDesc('total')
            ->limit(10)
            ->get();

        $monthlyTrend = Expense::query()
            ->where('expense_date', '>=', $now->copy()->subMonths(12)->startOfMonth()->toDateString())
            ->groupBy(DB::raw("DATE_FORMAT(expense_date, '%Y-%m')"))
            ->select(DB::raw("DATE_FORMAT(expense_date, '%Y-%m') as month"), DB::raw('SUM(amount) as total'))
            ->orderBy('month')
            ->pluck('total', 'month');

        return ApiResponse::success([
            'monthly_total' => $monthlyTotal,
            'yearly_total' => $yearlyTotal,
            'overdue_count' => $overdueCount,
            'upcoming_count' => $upcomingCount,
            'by_category' => $byCategory,
            'by_type' => $byType,
            'top_vehicles' => $topVehicles,
            'monthly_trend' => $monthlyTrend,
        ]);
    }

    // ── CRUD ──────────────────────────────────────────────────────────────
    public function index(Request $request): JsonResponse
    {
        $q = Expense::query()->orderByDesc('expense_date');

        if ($cat = $request->query('category')) $q->where('category', $cat);
        if ($type = $request->query('expense_type')) $q->where('expense_type', $type);
        if ($status = $request->query('status')) $q->where('status', $status);
        if ($vehicleId = $request->query('vehicle_id')) $q->where('vehicle_id', $vehicleId);
        if ($supplierId = $request->query('supplier_id')) $q->where('supplier_id', $supplierId);
        if ($customerId = $request->query('customer_id')) $q->where('customer_id', $customerId);

        $perPage = min(200, max(1, (int) $request->query('per_page', 50)));
        $page = $q->paginate($perPage);

        return ApiResponse::success($page->items(), [
            'current_page' => $page->currentPage(),
            'last_page' => $page->lastPage(),
            'total' => $page->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'label' => ['required', 'string', 'max:255'],
            'amount' => ['required', 'numeric', 'min:0'],
            'expense_date' => ['required', 'date'],
            'due_date' => ['nullable', 'date'],
            'category' => ['required', 'string', 'max:50'],
            'expense_type' => ['sometimes', 'string', 'in:fixed,operational,one_time'],
            'status' => ['sometimes', 'string', 'in:paid,unpaid,overdue'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'reference' => ['nullable', 'string', 'max:255'],
            'vehicle_id' => ['nullable', 'uuid'],
            'driver_id' => ['nullable', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'mission_id' => ['nullable', 'uuid'],
            'supplier_id' => ['nullable', 'uuid'],
            'frequency' => ['nullable', 'string', 'in:daily,monthly,quarterly,yearly,threshold'],
            'reminder_threshold_value' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        $expense = Expense::create([
            ...$data,
            'company_id' => $request->user()?->company_id,
            'created_by' => $request->user()?->id,
            'status' => $data['status'] ?? 'unpaid',
            'expense_type' => $data['expense_type'] ?? 'operational',
        ]);

        return ApiResponse::success($expense, null, null, 201);
    }

    public function show(Expense $expense): JsonResponse
    {
        $expense->load(['vehicle.brand', 'vehicle.model', 'customer', 'supplier', 'contract', 'reservation']);
        return ApiResponse::success($expense);
    }

    public function update(Request $request, Expense $expense): JsonResponse
    {
        $data = $request->validate([
            'label' => ['sometimes', 'string', 'max:255'],
            'amount' => ['sometimes', 'numeric', 'min:0'],
            'expense_date' => ['sometimes', 'date'],
            'due_date' => ['nullable', 'date'],
            'category' => ['sometimes', 'string', 'max:50'],
            'expense_type' => ['sometimes', 'string', 'in:fixed,operational,one_time'],
            'status' => ['sometimes', 'string', 'in:paid,unpaid,overdue'],
            'payment_method' => ['nullable', 'string', 'max:40'],
            'reference' => ['nullable', 'string', 'max:255'],
            'vehicle_id' => ['nullable', 'uuid'],
            'driver_id' => ['nullable', 'uuid'],
            'customer_id' => ['nullable', 'uuid'],
            'contract_id' => ['nullable', 'uuid'],
            'reservation_id' => ['nullable', 'uuid'],
            'mission_id' => ['nullable', 'uuid'],
            'supplier_id' => ['nullable', 'uuid'],
            'frequency' => ['nullable', 'string', 'in:daily,monthly,quarterly,yearly,threshold'],
            'reminder_threshold_value' => ['nullable', 'numeric', 'min:0'],
            'notes' => ['nullable', 'string'],
        ]);

        if (isset($data['status']) && $data['status'] === 'paid' && $expense->status !== 'paid') {
            $data['paid_at'] = now();
        }

        $expense->update($data);
        return ApiResponse::success($expense->fresh());
    }

    public function destroy(Expense $expense): JsonResponse
    {
        $expense->delete();
        return ApiResponse::success(null, null, 'Dépense supprimée.');
    }

    public function markPaid(Request $request, Expense $expense): JsonResponse
    {
        $expense->update(['status' => 'paid', 'paid_at' => now()]);
        return ApiResponse::success($expense->fresh());
    }

    // ── Vehicle expenses view ─────────────────────────────────────────────
    public function byVehicle(Request $request, string $vehicleId): JsonResponse
    {
        $expenses = Expense::query()
            ->where('vehicle_id', $vehicleId)
            ->orderByDesc('expense_date')
            ->limit(200)
            ->get();

        $byCategory = $expenses->groupBy('category')->map(fn ($g) => $g->sum('amount'));
        $total = $expenses->sum('amount');

        return ApiResponse::success([
            'expenses' => $expenses,
            'by_category' => $byCategory,
            'total' => $total,
        ]);
    }

    // ── Suppliers ─────────────────────────────────────────────────────────
    public function suppliers(Request $request): JsonResponse
    {
        $suppliers = ExpenseSupplier::query()
            ->withCount('expenses')
            ->withSum('expenses', 'amount')
            ->orderBy('name')
            ->get();

        return ApiResponse::success($suppliers);
    }

    public function storeSupplier(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:50'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string', 'max:255'],
            'ice' => ['nullable', 'string', 'max:30'],
        ]);

        $supplier = ExpenseSupplier::create([
            ...$data,
            'company_id' => $request->user()?->company_id,
        ]);

        return ApiResponse::success($supplier, null, null, 201);
    }

    public function updateSupplier(Request $request, ExpenseSupplier $supplier): JsonResponse
    {
        $data = $request->validate([
            'name' => ['sometimes', 'string', 'max:255'],
            'category' => ['nullable', 'string', 'max:50'],
            'phone' => ['nullable', 'string', 'max:30'],
            'email' => ['nullable', 'email'],
            'address' => ['nullable', 'string', 'max:255'],
            'ice' => ['nullable', 'string', 'max:30'],
            'status' => ['sometimes', 'string', 'in:active,inactive'],
        ]);

        $supplier->update($data);
        return ApiResponse::success($supplier->fresh());
    }

    public function destroySupplier(ExpenseSupplier $supplier): JsonResponse
    {
        $supplier->delete();
        return ApiResponse::success(null, null, 'Fournisseur supprimé.');
    }
}
