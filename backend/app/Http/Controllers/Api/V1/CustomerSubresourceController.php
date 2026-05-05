<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Customer;
use App\Models\CustomerAddress;
use App\Models\CustomerBankAccount;
use App\Models\CustomerContact;
use App\Models\CustomerNote;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CustomerSubresourceController extends Controller
{
    /* =================== Addresses =================== */

    public function storeAddress(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'address_type' => ['required', 'string', 'max:50'],
            'address_line_1' => ['required', 'string', 'max:255'],
            'address_line_2' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'region' => ['nullable', 'string', 'max:120'],
            'postal_code' => ['nullable', 'string', 'max:30'],
            'country_code' => ['nullable', 'string', 'size:2'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        $data['country_code'] ??= 'MA';
        $addr = $customer->addresses()->create($data);
        if (! empty($data['is_primary'])) {
            $customer->addresses()->where('id', '!=', $addr->id)->update(['is_primary' => false]);
        }

        AuditLogger::created($addr, $request->user(), null, 'customers', $request);

        return ApiResponse::success($addr->fresh(), null, null, 201);
    }

    public function updateAddress(Request $request, Customer $customer, CustomerAddress $address): JsonResponse
    {
        abort_unless((string) $address->customer_id === (string) $customer->id, 404);
        $data = $request->validate([
            'address_type' => ['sometimes', 'string', 'max:50'],
            'address_line_1' => ['sometimes', 'string', 'max:255'],
            'address_line_2' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:120'],
            'region' => ['nullable', 'string', 'max:120'],
            'postal_code' => ['nullable', 'string', 'max:30'],
            'country_code' => ['nullable', 'string', 'size:2'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        $address->fill($data)->save();
        if (! empty($data['is_primary'])) {
            $customer->addresses()->where('id', '!=', $address->id)->update(['is_primary' => false]);
        }

        AuditLogger::updated($address, $request->user(), null, null, 'customers', $request);

        return ApiResponse::success($address->fresh());
    }

    public function destroyAddress(Request $request, Customer $customer, CustomerAddress $address): JsonResponse
    {
        abort_unless((string) $address->customer_id === (string) $customer->id, 404);
        AuditLogger::deleted($address, $request->user(), 'customers', $request);
        $address->delete();

        return ApiResponse::message('Address deleted', 200);
    }

    /* =================== Contacts =================== */

    public function storeContact(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'contact_type' => ['required', 'string', 'max:50'],
            'value' => ['required', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        $contact = $customer->contacts()->create($data);
        if (! empty($data['is_primary'])) {
            $customer->contacts()->where('id', '!=', $contact->id)->where('contact_type', $contact->contact_type)->update(['is_primary' => false]);
        }

        AuditLogger::created($contact, $request->user(), null, 'customers', $request);

        return ApiResponse::success($contact->fresh(), null, null, 201);
    }

    public function updateContact(Request $request, Customer $customer, CustomerContact $contact): JsonResponse
    {
        abort_unless((string) $contact->customer_id === (string) $customer->id, 404);
        $data = $request->validate([
            'contact_type' => ['sometimes', 'string', 'max:50'],
            'value' => ['sometimes', 'string', 'max:255'],
            'is_primary' => ['sometimes', 'boolean'],
        ]);
        $contact->fill($data)->save();

        AuditLogger::updated($contact, $request->user(), null, null, 'customers', $request);

        return ApiResponse::success($contact->fresh());
    }

    public function destroyContact(Request $request, Customer $customer, CustomerContact $contact): JsonResponse
    {
        abort_unless((string) $contact->customer_id === (string) $customer->id, 404);
        AuditLogger::deleted($contact, $request->user(), 'customers', $request);
        $contact->delete();

        return ApiResponse::message('Contact deleted', 200);
    }

    /* =================== Bank accounts =================== */

    public function storeBankAccount(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'bank_name' => ['required', 'string', 'max:255'],
            'iban' => ['nullable', 'string', 'max:100'],
            'rib' => ['nullable', 'string', 'max:100'],
            'swift_code' => ['nullable', 'string', 'max:50'],
            'account_holder_name' => ['nullable', 'string', 'max:255'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $acct = $customer->bankAccounts()->create($data);
        if (! empty($data['is_default'])) {
            $customer->bankAccounts()->where('id', '!=', $acct->id)->update(['is_default' => false]);
        }

        // legal=true: bank account changes affect SEPA mandates and direct-debit
        // authorisations — must leave a forensic trail.
        AuditLogger::created($acct, $request->user(), null, 'customers', $request, true);

        return ApiResponse::success($acct->fresh(), null, null, 201);
    }

    public function updateBankAccount(Request $request, Customer $customer, CustomerBankAccount $bankAccount): JsonResponse
    {
        abort_unless((string) $bankAccount->customer_id === (string) $customer->id, 404);
        $data = $request->validate([
            'bank_name' => ['sometimes', 'string', 'max:255'],
            'iban' => ['nullable', 'string', 'max:100'],
            'rib' => ['nullable', 'string', 'max:100'],
            'swift_code' => ['nullable', 'string', 'max:50'],
            'account_holder_name' => ['nullable', 'string', 'max:255'],
            'is_default' => ['sometimes', 'boolean'],
        ]);
        $bankAccount->fill($data)->save();
        if (! empty($data['is_default'])) {
            $customer->bankAccounts()->where('id', '!=', $bankAccount->id)->update(['is_default' => false]);
        }

        AuditLogger::updated($bankAccount, $request->user(), null, null, 'customers', $request, true);

        return ApiResponse::success($bankAccount->fresh());
    }

    public function destroyBankAccount(Request $request, Customer $customer, CustomerBankAccount $bankAccount): JsonResponse
    {
        abort_unless((string) $bankAccount->customer_id === (string) $customer->id, 404);
        AuditLogger::deleted($bankAccount, $request->user(), 'customers', $request, true);
        $bankAccount->delete();

        return ApiResponse::message('Bank account deleted', 200);
    }

    /* =================== Notes =================== */

    public function listNotes(Customer $customer): JsonResponse
    {
        $notes = $customer->notes()->orderByDesc('created_at')->get();

        return ApiResponse::success($notes);
    }

    public function storeNote(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'note_type' => ['sometimes', 'string', 'max:50'],
            'note_text' => ['required', 'string', 'max:5000'],
        ]);
        $note = CustomerNote::create([
            'customer_id' => $customer->id,
            'note_type' => $data['note_type'] ?? 'general',
            'note_text' => $data['note_text'],
            'created_by' => optional($request->user())->id,
            'created_at' => now(),
        ]);

        // Risk-flagged notes (e.g. "fraud_suspicion", "litigation_warning") are
        // legally significant for the contentieux team's case files.
        $legal = in_array($note->note_type, ['risk', 'fraud', 'litigation', 'compliance'], true);
        AuditLogger::created($note, $request->user(), null, 'customers', $request, $legal);

        return ApiResponse::success($note, null, null, 201);
    }

    public function destroyNote(Request $request, Customer $customer, CustomerNote $note): JsonResponse
    {
        abort_unless((string) $note->customer_id === (string) $customer->id, 404);
        AuditLogger::deleted($note, $request->user(), 'customers', $request);
        $note->delete();

        return ApiResponse::message('Note deleted', 200);
    }

    /* =================== Blacklist =================== */

    public function blacklist(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'reason' => ['required', 'string', 'max:255'],
            'severity' => ['sometimes', 'in:low,medium,high,critical'],
            'source_module' => ['nullable', 'string', 'max:100'],
        ]);
        DB::transaction(function () use ($customer, $data, $request) {
            $customer->blacklistEntries()->create([
                'id' => (string) \Illuminate\Support\Str::uuid(),
                'reason' => $data['reason'],
                'severity' => $data['severity'] ?? 'high',
                'source_module' => $data['source_module'] ?? null,
                'added_by' => optional($request->user())->id,
                'added_at' => now(),
                'created_at' => now(),
            ]);
            $customer->is_blacklisted = true;
            $customer->save();
        });

        AuditLogger::legalAction(
            action: 'blacklist_added',
            subject: $customer->fresh(),
            user: $request->user(),
            before: ['is_blacklisted' => false],
            after: [
                'is_blacklisted' => true,
                'reason' => $data['reason'],
                'severity' => $data['severity'] ?? 'high',
                'source_module' => $data['source_module'] ?? null,
            ],
            request: $request,
            label: 'Client ajouté à la liste noire',
            module: 'customers',
        );

        return ApiResponse::success([
            'customer_id' => $customer->id,
            'is_blacklisted' => true,
        ]);
    }

    public function unblacklist(Request $request, Customer $customer): JsonResponse
    {
        $data = $request->validate([
            'removal_reason' => ['required', 'string', 'max:255'],
        ]);
        DB::transaction(function () use ($customer, $data, $request) {
            $customer->blacklistEntries()
                ->whereNull('removed_at')
                ->update([
                    'removed_at' => now(),
                    'removed_by' => optional($request->user())->id,
                    'removal_reason' => $data['removal_reason'],
                ]);
            $customer->is_blacklisted = false;
            $customer->save();
        });

        AuditLogger::legalAction(
            action: 'blacklist_removed',
            subject: $customer->fresh(),
            user: $request->user(),
            before: ['is_blacklisted' => true],
            after: [
                'is_blacklisted' => false,
                'removal_reason' => $data['removal_reason'],
            ],
            request: $request,
            label: 'Client retiré de la liste noire',
            module: 'customers',
        );

        return ApiResponse::success([
            'customer_id' => $customer->id,
            'is_blacklisted' => false,
        ]);
    }
}
