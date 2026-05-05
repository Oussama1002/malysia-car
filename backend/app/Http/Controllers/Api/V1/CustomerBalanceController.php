<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Customer;
use App\Models\Invoice;
use App\Models\Payment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CustomerBalanceController extends Controller
{
    /**
     * GET /customers/{customer}/balance
     * Returns summary of total due / paid / overdue across all invoices.
     */
    public function balance(Customer $customer): JsonResponse
    {
        $invoices = Invoice::where('customer_id', $customer->id)
            ->whereNotIn('status', ['cancelled'])
            ->get();

        $totalInvoiced = (float) $invoices->sum('total_amount');
        $totalPaid = (float) $invoices->sum('amount_paid');
        $totalDue = (float) $invoices->sum('amount_due');

        $today = now()->toDateString();
        $overdueInvoices = $invoices->filter(fn ($i) => $i->due_date
            && $i->due_date->toDateString() < $today
            && (float) $i->amount_due > 0);
        $overdueAmount = (float) $overdueInvoices->sum('amount_due');

        $unallocatedPayments = (float) Payment::where('customer_id', $customer->id)
            ->where('status', '!=', 'refunded')
            ->sum('amount_unallocated');

        return ApiResponse::success([
            'customer_id' => $customer->id,
            'currency_code' => $invoices->first()->currency_code ?? 'MAD',
            'total_invoiced' => round($totalInvoiced, 2),
            'total_paid' => round($totalPaid, 2),
            'total_due' => round($totalDue, 2),
            'overdue_amount' => round($overdueAmount, 2),
            'overdue_invoices_count' => $overdueInvoices->count(),
            'unallocated_payments' => round($unallocatedPayments, 2),
            'invoices_count' => $invoices->count(),
        ]);
    }

    /**
     * GET /customers/{customer}/statement
     * Returns chronological ledger of invoices + payments with running balance.
     */
    public function statement(Request $request, Customer $customer): JsonResponse
    {
        $from = $request->query('from');
        $to = $request->query('to');

        $invoices = Invoice::where('customer_id', $customer->id)
            ->whereNotIn('status', ['cancelled', 'draft'])
            ->when($from, fn ($q) => $q->whereDate('issue_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('issue_date', '<=', $to))
            ->get();

        $payments = Payment::where('customer_id', $customer->id)
            ->where('status', '!=', 'refunded')
            ->when($from, fn ($q) => $q->whereDate('payment_date', '>=', $from))
            ->when($to, fn ($q) => $q->whereDate('payment_date', '<=', $to))
            ->get();

        $entries = [];

        foreach ($invoices as $inv) {
            $entries[] = [
                'date' => optional($inv->issue_date)->toDateString(),
                'type' => 'invoice',
                'reference' => $inv->invoice_number,
                'description' => 'Facture ' . $inv->invoice_type,
                'debit' => (float) $inv->total_amount,
                'credit' => 0,
                'source_id' => $inv->id,
                'status' => $inv->status,
            ];
        }
        foreach ($payments as $pay) {
            $entries[] = [
                'date' => optional($pay->payment_date)->toDateString(),
                'type' => 'payment',
                'reference' => $pay->payment_number,
                'description' => 'Encaissement ' . $pay->payment_method,
                'debit' => 0,
                'credit' => (float) $pay->amount,
                'source_id' => $pay->id,
                'status' => $pay->status,
            ];
        }

        usort($entries, fn ($a, $b) => strcmp((string) $a['date'], (string) $b['date']));

        $balance = 0;
        foreach ($entries as &$e) {
            $balance += $e['debit'] - $e['credit'];
            $e['running_balance'] = round($balance, 2);
        }
        unset($e);

        return ApiResponse::success([
            'customer' => $customer->only(['id', 'customer_code', 'full_name', 'customer_type']),
            'entries' => $entries,
            'total_debit' => round(array_sum(array_column($entries, 'debit')), 2),
            'total_credit' => round(array_sum(array_column($entries, 'credit')), 2),
            'closing_balance' => round($balance, 2),
            'from' => $from,
            'to' => $to,
        ]);
    }
}
