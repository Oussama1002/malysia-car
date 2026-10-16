import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';

/// Détail complet d'une facture — mirror du web InvoiceDetailPage.
/// Affiche statut, totaux (sous-total, TVA, total, reste dû), lignes
/// et paiements alloués. Fetch via `GET /invoices/{id}`.
class InvoiceDetailScreen extends ConsumerStatefulWidget {
  const InvoiceDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<InvoiceDetailScreen> createState() => _InvoiceDetailScreenState();
}

class _InvoiceDetailScreenState extends ConsumerState<InvoiceDetailScreen> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async {
    final api = ref.read(apiClientProvider);
    final data = await api.getData('/invoices/${widget.id}');
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return data.map((k, v) => MapEntry(k.toString(), v));
    return const {};
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Détail de la facture')),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return const Center(child: CircularProgressIndicator());
          }
          if (snap.hasError || snap.data == null || snap.data!.isEmpty) {
            return Center(child: Text('Erreur : ${snap.error ?? "introuvable"}'));
          }
          return _body(snap.data!);
        },
      ),
    );
  }

  Widget _body(Map<String, dynamic> i) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    String fmt(num? v) => '${money.format(v ?? 0)} MAD';
    String fmtDate(dynamic v) {
      if (v == null) return '—';
      final d = DateTime.tryParse(v.toString());
      return d == null ? '—' : dateFmt.format(d);
    }

    final sub = (i['subtotal_amount'] as num?)?.toDouble() ?? 0;
    final tax = (i['tax_amount'] as num?)?.toDouble() ?? 0;
    final total = (i['total_amount'] as num?)?.toDouble() ?? 0;
    final due = (i['amount_due'] as num?)?.toDouble() ?? 0;
    final status = (i['status'] ?? '').toString();
    final statusLabel = _invoiceStatusFr[status] ?? status;
    final lines = (i['lines'] as List?)
            ?.whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .toList() ??
        const [];
    final allocations = (i['allocations'] as List?)
            ?.whereType<Map>()
            .map((e) => e.map((k, v) => MapEntry(k.toString(), v)))
            .toList() ??
        const [];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    i['invoice_number']?.toString() ?? '—',
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w900),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    [
                      (i['customer']?['full_name'] ?? '—').toString(),
                      'émise ${fmtDate(i['issue_date'])}',
                      if (i['due_date'] != null)
                        'échéance ${fmtDate(i['due_date'])}',
                    ].join(' · '),
                    style:
                        const TextStyle(color: Colors.black54, fontSize: 12),
                  ),
                ],
              ),
            ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: _statusTone(status),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(statusLabel,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.w800)),
            ),
          ],
        ),
        const SizedBox(height: 16),
        GridView.count(
          crossAxisCount: 2,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          childAspectRatio: 2.4,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          children: [
            _summary('Sous-total', fmt(sub)),
            _summary('TVA', fmt(tax)),
            _summary('Total', fmt(total)),
            _summary('Reste dû', fmt(due),
                tone: due > 0 ? const Color(0xFFB45309) : const Color(0xFF047857),
                bg: due > 0 ? const Color(0xFFFFFBEB) : const Color(0xFFECFDF5)),
          ],
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Lignes de facture',
                  style: TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 13)),
              const SizedBox(height: 6),
              if (lines.isEmpty)
                const Text('Aucune ligne.',
                    style: TextStyle(color: Colors.black45, fontSize: 12))
              else
                for (final l in lines)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${l['position'] ?? '—'}. ${l['description'] ?? '—'}',
                                style: const TextStyle(
                                    fontWeight: FontWeight.w800, fontSize: 12.5),
                              ),
                            ),
                            Text(fmt((l['line_total'] as num?)),
                                style: const TextStyle(
                                    fontWeight: FontWeight.w900, fontSize: 12.5)),
                          ],
                        ),
                        Text(
                          'Qté ${l['quantity'] ?? 1} · PU ${fmt((l['unit_price'] as num?))} · Remise ${fmt((l['discount_amount'] as num?))} · TVA ${fmt((l['tax_amount'] as num?))}',
                          style: const TextStyle(
                              color: Colors.black54, fontSize: 11),
                        ),
                      ],
                    ),
                  ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            border: Border.all(color: Colors.black12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Paiements alloués',
                  style: TextStyle(
                      fontWeight: FontWeight.w900, fontSize: 13)),
              const SizedBox(height: 6),
              if (allocations.isEmpty)
                const Text('Aucun paiement alloué pour le moment.',
                    style: TextStyle(color: Colors.black45, fontSize: 12))
              else
                for (final a in allocations)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 3),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            '${a['payment']?['payment_number'] ?? a['payment_id'] ?? '—'} · ${fmtDate(a['allocated_at'])}',
                            style: const TextStyle(fontSize: 12),
                          ),
                        ),
                        Text(fmt((a['amount_allocated'] as num?)),
                            style: const TextStyle(
                                fontWeight: FontWeight.w900, fontSize: 12.5)),
                      ],
                    ),
                  ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _summary(String label, String value,
      {Color? tone, Color? bg}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bg ?? const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 10,
                  color: Colors.black45,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.8)),
          const SizedBox(height: 4),
          Text(value,
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w900,
                  color: tone ?? const Color(0xFF0F172A))),
        ],
      ),
    );
  }
}

const _invoiceStatusFr = {
  'draft': 'Brouillon',
  'issued': 'Émise',
  'sent': 'Envoyée',
  'partially_paid': 'Partiellement payée',
  'paid': 'Payée',
  'overdue': 'En retard',
  'cancelled': 'Annulée',
};

Color _statusTone(String s) {
  switch (s) {
    case 'paid':
      return const Color(0xFF059669);
    case 'overdue':
      return const Color(0xFFE11D48);
    case 'draft':
      return const Color(0xFF64748B);
    case 'cancelled':
      return const Color(0xFF9CA3AF);
    default:
      return const Color(0xFF6366F1);
  }
}
