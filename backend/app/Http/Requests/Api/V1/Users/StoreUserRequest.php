<?php

namespace App\Http\Requests\Api\V1\Users;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:8', 'max:72'],
            'first_name' => ['nullable', 'string', 'max:120'],
            'last_name' => ['nullable', 'string', 'max:120'],
            'name' => ['nullable', 'string', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'role' => ['nullable', 'string', 'max:50'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['integer', 'exists:roles,id'],
            'branch_ids' => ['sometimes', 'array'],
            'branch_ids.*' => ['uuid', 'exists:branches,id'],
            'primary_branch_id' => ['sometimes', 'uuid', 'exists:branches,id'],
            'company_id' => ['sometimes', 'uuid'],
            'locale' => ['sometimes', 'string', 'in:fr,en,ar'],
            'status' => ['sometimes', 'string', 'in:active,inactive,suspended'],
        ];
    }
}
