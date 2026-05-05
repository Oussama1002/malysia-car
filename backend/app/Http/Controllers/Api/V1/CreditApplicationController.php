<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\V1\Credit\StoreCreditApplicationRequest;
use App\Http\Requests\Api\V1\Credit\UpdateCreditApplicationRequest;
use App\Http\Resources\CreditApplicationResource;
use App\Http\Responses\ApiResponse;
use App\Models\Contract;
use App\Models\CreditApplication;
use App\Models\CreditApplicationDecision;
use App\Models\CreditScore;
use App\Services\AuditLogger;
use App\Services\CreditScoringService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class CreditApplicationController extends Controller
{
    public function __construct(private readonly CreditScoringService $scoringService) {}

    public function index(Request $request): JsonResponse
    {
        $q = CreditApplication::query();

        if ($status = $request->query('decision_status')) {
            $q->where('decision_status', $status);
        }
        if ($scoring = $request->query('scoring_status')) {
            $q->where('scoring_status', $scoring);
        }
        if ($customerId = $request->query('customer_id')) {
            $q->where('customer_id', $customerId);
        }

        $per = min(100, max(1, (int) $request->query('per_page', 50)));
        $page = $q->orderByDesc('updated_at')->paginate($per);

        return ApiResponse::success(
            CreditApplicationResource::collection($page->items())->resolve($request),
            [
                'current_page' => $page->currentPage(),
                'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(),
                'total' => $page->total(),
            ]
        );
    }

    public function show(Request $request, CreditApplication $creditApplication): JsonResponse
    {
        $creditApplication->load(['decisions', 'scores']);

        return ApiResponse::success([
            'application' => (new CreditApplicationResource($creditApplication))->resolve($request),
            'decisions' => $creditApplication->decisions,
            'scores' => $creditApplication->scores,
        ]);
    }

    public function store(StoreCreditApplicationRequest $request): JsonResponse
    {
        $data = $request->validated();

        $app = DB::transaction(function () use ($data, $request) {
            $a = new CreditApplication;
            $a->id = (string) Str::uuid();
            $a->company_id = $data['company_id'] ?? $request->user()?->company_id;
            $a->branch_id = $data['branch_id'] ?? null;
            $a->customer_id = $data['customer_id'];
            $a->vehicle_id = $data['vehicle_id'] ?? null;
            $a->application_type = $data['application_type'];
            $a->requested_amount = $data['requested_amount'];
            $a->down_payment_amount = $data['down_payment_amount'] ?? null;
            $a->requested_duration_months = $data['requested_duration_months'];
            $a->monthly_income = $data['monthly_income'] ?? null;
            $a->monthly_debt = $data['monthly_debt'] ?? null;
            $a->scoring_status = 'pending';
            $a->decision_status = 'pending';
            $a->save();

            return $a->fresh();
        });

        AuditLogger::created($app, $request->user(), request: $request);

        return ApiResponse::success((new CreditApplicationResource($app))->resolve($request), null, null, 201);
    }

    public function update(UpdateCreditApplicationRequest $request, CreditApplication $creditApplication): JsonResponse
    {
        $data = $request->validated();
        $before = $creditApplication->getOriginal();
        foreach ([
            'company_id',
            'branch_id',
            'customer_id',
            'vehicle_id',
            'application_type',
            'requested_amount',
            'down_payment_amount',
            'requested_duration_months',
            'monthly_income',
            'monthly_debt',
            'submitted_at',
        ] as $k) {
            if (array_key_exists($k, $data)) {
                $creditApplication->{$k} = $data[$k];
            }
        }
        $creditApplication->save();
        AuditLogger::updated($creditApplication, $request->user(), before: array_intersect_key($before, $creditApplication->getChanges()), after: $creditApplication->getChanges(), request: $request);

        return ApiResponse::success((new CreditApplicationResource($creditApplication->fresh()))->resolve($request));
    }

    public function score(Request $request, CreditApplication $creditApplication): JsonResponse
    {
        $creditApplication->refresh()->loadMissing(['customer.latestKycCase.documents', 'customer.employmentProfile', 'customer.blacklistEntries']);
        $result = $this->scoringService->compute($creditApplication);
        $scoreRow = $this->scoringService->persist($creditApplication, $result, (string) ($request->user()?->id ?? ''));

        $creditApplication->debt_ratio = $result['breakdown']['debt_ratio_value'] ?? null;
        $creditApplication->scoring_status = 'scored';
        $creditApplication->save();

        AuditLogger::legalAction(
            action: 'credit_scored',
            subject: $creditApplication,
            user: $request->user(),
            request: $request,
            label: 'Scoring crédit',
            after: ['score' => $result['score'], 'risk_band' => $result['risk_band']],
        );

        return ApiResponse::success([
            'credit_application_id' => $creditApplication->id,
            'score_id' => $scoreRow->id,
            'score' => (float) $result['score'],
            'risk_band' => $result['risk_band'],
            'recommendation' => $result['recommendation'],
            'factors_positive' => $result['factors_positive'],
            'factors_negative' => $result['factors_negative'],
            'breakdown' => $result['breakdown'],
        ]);
    }

    public function scores(CreditApplication $creditApplication): JsonResponse
    {
        return ApiResponse::success(
            CreditScore::query()
                ->where('credit_application_id', $creditApplication->id)
                ->orderByDesc('scored_at')
                ->get()
        );
    }

    public function latestScore(CreditApplication $creditApplication): JsonResponse
    {
        $score = CreditScore::query()
            ->where('credit_application_id', $creditApplication->id)
            ->orderByDesc('scored_at')
            ->first();

        return ApiResponse::success($score);
    }

    public function decision(Request $request, CreditApplication $creditApplication): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'string', 'in:pending,approved,rejected'],
            'note' => ['sometimes', 'nullable', 'string'],
            'score' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'recommendation' => ['sometimes', 'nullable', 'string', 'max:50'],
            'rejection_reason' => ['sometimes', 'nullable', 'string'],
            'create_contract' => ['sometimes', 'boolean'],
            'director_override' => ['sometimes', 'boolean'],
        ]);

        $out = DB::transaction(function () use ($creditApplication, $data) {
            $latestScore = CreditScore::query()
                ->where('credit_application_id', $creditApplication->id)
                ->orderByDesc('scored_at')
                ->first();
            $riskBand = (string) ($latestScore?->risk_band ?? '');
            $user = auth()->user();
            $role = method_exists($user, 'primaryRoleCode') ? $user->primaryRoleCode() : '';
            $isDirectorLevel = in_array($role, ['ADMIN', 'DIRECTEUR'], true);
            $hasDirectorOverride = (bool) ($data['director_override'] ?? false);

            if ($data['decision'] === 'approved' && in_array($riskBand, ['C', 'D'], true) && !$isDirectorLevel) {
                abort(422, 'Risque eleve: decision directeur requise.');
            }

            if (($data['create_contract'] ?? false) && $data['decision'] === 'approved' && $riskBand === 'D' && !($isDirectorLevel && $hasDirectorOverride)) {
                abort(422, 'Score D: override directeur requis pour creer un contrat.');
            }

            $creditApplication->decision_status = $data['decision'];
            $creditApplication->decided_at = now();
            $creditApplication->decided_by = auth()->id();
            if ($data['decision'] === 'rejected') {
                $creditApplication->rejection_reason = $data['rejection_reason'] ?? $creditApplication->rejection_reason;
            }
            $creditApplication->save();

            $decisionRow = CreditApplicationDecision::query()->create([
                'id' => (string) Str::uuid(),
                'credit_application_id' => $creditApplication->id,
                'decision' => $data['decision'],
                'score' => $data['score'] ?? null,
                'recommendation' => $data['recommendation'] ?? null,
                'note' => $data['note'] ?? null,
                'decided_by' => auth()->id(),
                'decided_at' => now(),
            ]);

            $contract = null;
            if (($data['create_contract'] ?? false) && $data['decision'] === 'approved') {
                $creditApplication->loadMissing(['customer.latestKycCase', 'customer.blacklistEntries']);
                $customer = $creditApplication->customer;
                $kycApproved = (string) ($customer?->latestKycCase?->kyc_status ?? '') === 'approved';
                $isBlacklisted = (bool) ($customer?->is_blacklisted ?? false)
                    || (bool) ($customer?->blacklistEntries?->firstWhere('removed_at', null));
                if (!$kycApproved) {
                    abort(422, 'KYC non approuve: creation de contrat bloquee.');
                }
                if ($isBlacklisted && !($isDirectorLevel && $hasDirectorOverride)) {
                    abort(422, 'Client blackliste: override directeur requis pour creer un contrat.');
                }

                $months = (int) ($creditApplication->requested_duration_months ?? 12);
                $start = Carbon::now()->startOfDay();
                $end = $start->copy()->addMonthsNoOverflow($months)->toDateString();

                $contract = Contract::query()->create([
                    'id' => (string) Str::uuid(),
                    'company_id' => $creditApplication->company_id,
                    'branch_id' => $creditApplication->branch_id,
                    'contract_number' => 'CRD-'.now()->format('Ymd').'-'.strtoupper(Str::random(6)),
                    'contract_type' => 'CREDIT_AUTO',
                    'customer_id' => $creditApplication->customer_id,
                    'vehicle_id' => $creditApplication->vehicle_id,
                    'credit_application_id' => $creditApplication->id,
                    'status' => 'draft',
                    'start_date' => $start->toDateString(),
                    'end_date' => $end,
                    'duration_months' => $months,
                    'currency_code' => 'MAD',
                    'base_amount' => $creditApplication->requested_amount,
                    'down_payment_amount' => $creditApplication->down_payment_amount,
                    'monthly_payment' => null,
                    'created_by' => auth()->id(),
                    'notes' => ($riskBand === 'D' && $isDirectorLevel && $hasDirectorOverride) ? '[Override directeur] Score D valide en comite.' : null,
                ]);
            }

            return [$decisionRow, $contract];
        });

        /** @var \App\Models\CreditApplicationDecision $decisionRow */
        $decisionRow = $out[0];
        /** @var \App\Models\Contract|null $contract */
        $contract = $out[1];

        AuditLogger::legalAction(
            action: 'credit_decision',
            subject: $creditApplication,
            user: $request->user(),
            request: $request,
            label: 'Décision crédit',
            after: ['decision' => $creditApplication->decision_status, 'note' => $data['note'] ?? null],
        );

        return ApiResponse::success([
            'application' => (new CreditApplicationResource($creditApplication->fresh()))->resolve($request),
            'decision' => $decisionRow,
            'latest_score' => CreditScore::query()->where('credit_application_id', $creditApplication->id)->orderByDesc('scored_at')->first(),
            'contract' => $contract ? (new \App\Http\Resources\ContractResource($contract))->resolve($request) : null,
        ]);
    }
}

