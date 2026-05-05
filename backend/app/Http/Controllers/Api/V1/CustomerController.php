<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Customers\StoreCustomerRequest;
use App\Http\Requests\Api\V1\Customers\UpdateCustomerRequest;
use App\Http\Resources\CustomerResource;
use App\Http\Responses\ApiResponse;
use App\Models\Customer;
use App\Models\CustomerKycCase;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CustomerController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Customer::query()->with(['individualProfile', 'companyProfile', 'latestKycCase']);

        if ($s = $request->query('search')) {
            $q->where(function ($w) use ($s) {
                $w->where('customer_code', 'like', "%{$s}%")
                    ->orWhereHas('individualProfile', fn ($p) => $p->where('first_name', 'like', "%{$s}%")->orWhere('last_name', 'like', "%{$s}%")->orWhere('national_id_number', 'like', "%{$s}%"))
                    ->orWhereHas('companyProfile', fn ($p) => $p->where('legal_name', 'like', "%{$s}%")->orWhere('trade_name', 'like', "%{$s}%")->orWhere('ice', 'like', "%{$s}%"));
            });
        }
        if ($t = $request->query('type')) {
            $q->where('customer_type', $t);
        }
        if ($st = $request->query('status')) {
            $q->where('status', $st);
        }
        if ($rl = $request->query('risk_level')) {
            $q->where('risk_level', $rl);
        }
        if ($request->has('is_blacklisted')) {
            $q->where('is_blacklisted', filter_var($request->query('is_blacklisted'), FILTER_VALIDATE_BOOLEAN));
        }
        if ($kyc = $request->query('kyc_status')) {
            $q->whereHas('latestKycCase', fn ($k) => $k->where('kyc_status', $kyc));
        }
        if ($b = $request->query('branch_id')) {
            $q->where('branch_id', $b);
        }

        $per = min(100, max(1, (int) $request->query('per_page', 25)));
        $page = $q->orderByDesc('created_at')->paginate($per);

        return ApiResponse::success(
            CustomerResource::collection($page->items())->resolve($request),
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function show(Customer $customer, Request $request): JsonResponse
    {
        $customer->load(['individualProfile', 'companyProfile', 'addresses', 'contacts', 'bankAccounts', 'latestKycCase']);

        return ApiResponse::success((new CustomerResource($customer))->resolve($request));
    }

    public function store(StoreCustomerRequest $request): JsonResponse
    {
        $data = $request->validated();
        $customer = DB::transaction(function () use ($data, $request) {
            $c = new Customer;
            $c->id = (string) Str::uuid();
            $c->customer_code = $data['customer_code'] ?? 'CUS-'.strtoupper(Str::random(8));
            $c->customer_type = $data['customer_type'];
            $c->status = $data['status'] ?? 'active';
            $c->risk_level = $data['risk_level'] ?? 'normal';
            $c->preferred_language = $data['preferred_language'] ?? 'fr';
            $c->source_channel = $data['source_channel'] ?? null;
            $c->branch_id = $data['branch_id'] ?? null;
            $c->company_id = $data['company_id'] ?? $request->user()?->company_id;
            $c->assigned_to_user_id = $data['assigned_to_user_id'] ?? null;
            $c->save();

            if ($c->customer_type === 'PARTICULIER' && ! empty($data['individual_profile'])) {
                $c->individualProfile()->create(array_merge($data['individual_profile'], ['customer_id' => $c->id]));
            }
            if ($c->customer_type === 'ENTREPRISE' && ! empty($data['company_profile'])) {
                $c->companyProfile()->create(array_merge($data['company_profile'], ['customer_id' => $c->id]));
            }

            foreach ($data['contacts'] ?? [] as $cc) {
                $c->contacts()->create($cc);
            }
            foreach ($data['addresses'] ?? [] as $ad) {
                $c->addresses()->create($ad);
            }

            // Always open a pending KYC case on creation.
            CustomerKycCase::create([
                'id' => (string) Str::uuid(),
                'customer_id' => $c->id,
                'kyc_status' => 'pending',
                'verification_level' => 'basic',
            ]);

            return $c->load(['individualProfile', 'companyProfile', 'addresses', 'contacts', 'bankAccounts', 'latestKycCase']);
        });

        AuditLogger::created($customer, $request->user(), request: $request);

        return ApiResponse::success((new CustomerResource($customer))->resolve($request), null, null, 201);
    }

    public function update(UpdateCustomerRequest $request, Customer $customer): JsonResponse
    {
        $data = $request->validated();
        $before = $customer->getOriginal();
        DB::transaction(function () use ($customer, $data) {
            foreach (['customer_code', 'customer_type', 'status', 'risk_level', 'preferred_language', 'source_channel', 'branch_id', 'assigned_to_user_id'] as $k) {
                if (array_key_exists($k, $data)) {
                    $customer->{$k} = $data[$k];
                }
            }
            $customer->save();

            if (! empty($data['individual_profile']) && $customer->customer_type === 'PARTICULIER') {
                $customer->individualProfile()->updateOrCreate(
                    ['customer_id' => $customer->id],
                    $data['individual_profile']
                );
            }
            if (! empty($data['company_profile']) && $customer->customer_type === 'ENTREPRISE') {
                $customer->companyProfile()->updateOrCreate(
                    ['customer_id' => $customer->id],
                    $data['company_profile']
                );
            }
        });
        AuditLogger::updated($customer, $request->user(), before: $before, after: $customer->getChanges(), request: $request);
        $customer->load(['individualProfile', 'companyProfile', 'addresses', 'contacts', 'bankAccounts', 'latestKycCase']);

        return ApiResponse::success((new CustomerResource($customer))->resolve($request));
    }

    public function destroy(Customer $customer, Request $request): JsonResponse
    {
        AuditLogger::deleted($customer, $request->user(), request: $request);
        $customer->delete();

        return ApiResponse::message('Customer deleted', 200);
    }

    /**
     * Aggregated dossier endpoint — identity + contacts + documents + contracts + payments + KYC + risk.
     */
    public function dossier(Customer $customer, Request $request): JsonResponse
    {
        $customer->load([
            'individualProfile',
            'companyProfile',
            'employmentProfile',
            'addresses',
            'contacts',
            'bankAccounts',
            'kycCases' => fn ($q) => $q->orderByDesc('created_at')->with('documents'),
            'blacklistEntries' => fn ($q) => $q->orderByDesc('added_at'),
            'notes' => fn ($q) => $q->orderByDesc('created_at')->limit(50),
        ]);

        $contracts = [];
        $payments = [];
        if (\Illuminate\Support\Facades\Schema::hasTable('contracts')) {
            $contracts = DB::table('contracts')
                ->where('customer_id', $customer->id)
                ->orderByDesc('created_at')
                ->limit(50)
                ->get();
        }
        if (\Illuminate\Support\Facades\Schema::hasTable('payments')) {
            $contractIds = collect($contracts)->pluck('id')->all();
            if (! empty($contractIds)) {
                $payments = DB::table('payments')
                    ->whereIn('contract_id', $contractIds)
                    ->orderByDesc('paid_at')
                    ->limit(100)
                    ->get();
            }
        }

        return ApiResponse::success([
            'customer' => (new CustomerResource($customer))->resolve($request),
            'identity' => [
                'individual_profile' => $customer->individualProfile,
                'company_profile' => $customer->companyProfile,
                'employment_profile' => $customer->employmentProfile,
            ],
            'addresses' => $customer->addresses,
            'contacts' => $customer->contacts,
            'bank_accounts' => $customer->bankAccounts,
            'kyc' => [
                'cases' => $customer->kycCases,
                'latest_status' => optional($customer->kycCases->first())->kyc_status ?? 'pending',
            ],
            'blacklist' => [
                'active' => $customer->blacklistEntries->whereNull('removed_at')->values(),
                'history' => $customer->blacklistEntries,
            ],
            'notes' => $customer->notes,
            'contracts' => $contracts,
            'payments' => $payments,
            'risk' => [
                'level' => $customer->risk_level,
                'is_blacklisted' => (bool) $customer->is_blacklisted,
                'score' => optional($customer->kycCases->first())->risk_score,
            ],
        ]);
    }
}
