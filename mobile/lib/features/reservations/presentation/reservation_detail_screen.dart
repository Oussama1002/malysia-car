import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../data/reservation_detail_dto.dart';
import '../data/reservation_dto.dart';
import '../data/reservations_repo.dart';
import 'new_contract_from_reservation_screen.dart';

/// Fiche réservation — reproduit `ReservationDetailPage.tsx` du web :
/// gros header (numéro + statut, grille d'infos, bannières draft/no-contract,
/// quick-actions) puis 10 onglets scrollables (Résumé, Conducteurs, Contrat,
/// Check-Out, Check-In, Prolongations, Dommages, Paiements, Factures,
/// Historique).
class ReservationDetailScreen extends ConsumerStatefulWidget {
  const ReservationDetailScreen({super.key, required this.id});
  final String id;

  @override
  ConsumerState<ReservationDetailScreen> createState() =>
      _ReservationDetailScreenState();
}

enum _Tab {
  summary,
  drivers,
  contract,
  checkout,
  checkin,
  extensions,
  damages,
  payments,
  invoices,
  history,
}

const _tabLabels = {
  _Tab.summary: 'Résumé',
  _Tab.drivers: 'Conducteurs',
  _Tab.contract: 'Contrat',
  _Tab.checkout: 'Check-Out',
  _Tab.checkin: 'Check-In',
  _Tab.extensions: 'Prolongations',
  _Tab.damages: 'Dommages',
  _Tab.payments: 'Paiements',
  _Tab.invoices: 'Factures',
  _Tab.history: 'Historique',
};

class _ReservationDetailScreenState
    extends ConsumerState<ReservationDetailScreen> {
  _Tab _tab = _Tab.summary;
  bool _busy = false;
  bool _confirmDelete = false;

  Future<void> _run(Future<void> Function() action,
      {String? success, bool pop = false}) async {
    setState(() => _busy = true);
    try {
      await action();
      ref.invalidate(reservationDetailProvider(widget.id));
      ref.invalidate(reservationsListProvider);
      ref.invalidate(enrichedReservationsProvider);
      if (!mounted) return;
      if (success != null) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text(success)));
      }
      if (pop) Navigator.of(context).maybePop();
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Erreur : $e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(reservationDetailProvider(widget.id));
    return Scaffold(
      body: SafeArea(
        child: async.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) =>
              _ErrorView(message: '$e', onBack: () => Navigator.of(context).maybePop()),
          data: (d) {
            final r = d.reservation;
            return ListView(
              padding: const EdgeInsets.only(bottom: 24),
              children: [
                _Breadcrumb(onBack: () => Navigator.of(context).maybePop()),
                _HeaderCard(d: d),
                if (r.isDraft) _DraftBanner(busy: _busy, onValidate: _validate),
                if (!r.isCancelled && !r.isClosed && !r.isDraft && !d.hasContract)
                  _NoContractBanner(),
                _QuickActions(
                  d: d,
                  busy: _busy,
                  confirmDelete: _confirmDelete,
                  onValidate: _validate,
                  onConfirm: () => _run(
                      () => ref
                          .read(reservationsRepoProvider)
                          .confirmReservation(r.id),
                      success: 'Réservation confirmée.'),
                  onCancel: () => _run(
                      () => ref
                          .read(reservationsRepoProvider)
                          .cancelReservation(r.id),
                      success: 'Réservation annulée.'),
                  onDeleteStart: () =>
                      setState(() => _confirmDelete = true),
                  onDeleteCancel: () =>
                      setState(() => _confirmDelete = false),
                  onDeleteConfirm: () => _run(
                      () => ref
                          .read(reservationsRepoProvider)
                          .deleteReservation(r.id),
                      success: 'Réservation supprimée.',
                      pop: true),
                  onGenerateContract: () => Navigator.of(context).push(
                      MaterialPageRoute(
                          builder: (_) =>
                              NewContractFromReservationScreen(
                                  reservationId: widget.id))),
                  onCheckout: () =>
                      setState(() => _tab = _Tab.checkout),
                  onCheckin: () => setState(() => _tab = _Tab.checkin),
                  onAddPayment: () =>
                      setState(() => _tab = _Tab.payments),
                  onInvoice: () => setState(() => _tab = _Tab.invoices),
                ),
                const SizedBox(height: 10),
                _TabsBar(current: _tab, onChanged: (t) => setState(() => _tab = t)),
                _TabContent(tab: _tab, d: d),
              ],
            );
          },
        ),
      ),
    );
  }

  void _validate() {
    _run(
        () => ref
            .read(reservationsRepoProvider)
            .validateReservation(widget.id),
        success: 'Réservation validée.');
  }
}

// ---------------------------------------------------------------------------
// Breadcrumb
// ---------------------------------------------------------------------------

class _Breadcrumb extends StatelessWidget {
  const _Breadcrumb({required this.onBack});
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 8, 20, 0),
      child: InkWell(
        onTap: onBack,
        child: Row(
          children: const [
            Padding(
              padding: EdgeInsets.only(left: 4, right: 2),
              child: Icon(Icons.arrow_back, size: 18, color: Color(0xFF4F46E5)),
            ),
            Text('Retour aux réservations',
                style: TextStyle(
                    color: Color(0xFF4F46E5),
                    fontWeight: FontWeight.w800,
                    fontSize: 12.5)),
          ],
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Header card
// ---------------------------------------------------------------------------

class _HeaderCard extends StatelessWidget {
  const _HeaderCard({required this.d});
  final ReservationDetailDto d;

  @override
  Widget build(BuildContext context) {
    final r = d.reservation;
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    final money = NumberFormat.decimalPattern('fr');
    final totals = d.totals ??
        const ReservationTotals(
            estimatedPrice: 0,
            paid: 0,
            extensionsTotal: 0,
            damagesTotal: 0);
    final grand = totals.expected;
    final balance = grand - totals.paid;
    final candidates = d.candidateVehicles;
    final vehicleCell = candidates.length > 1
        ? candidates.map((c) => c.name).join('  /  ')
        : (d.vehicleName ?? r.vehicleLabel ?? '—');
    final regCell = candidates.length > 1
        ? candidates.map((c) => c.registration ?? '').where((e) => e.isNotEmpty).join('  /  ')
        : (d.vehicleRegistration ?? '—');

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Container(
        decoration: BoxDecoration(
          color: Theme.of(context).colorScheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding:
                  const EdgeInsets.fromLTRB(14, 12, 14, 10),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(r.number,
                                  style: const TextStyle(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w900)),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        r.isDraft
                            ? Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 10, vertical: 3),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFFFBEB),
                                  borderRadius: BorderRadius.circular(999),
                                  border: Border.all(
                                      color: const Color(0xFFF59E0B),
                                      width: 1.3),
                                ),
                                child: const Text(
                                    'INTENTION · NON VALIDÉE',
                                    style: TextStyle(
                                        color: Color(0xFFB45309),
                                        fontSize: 9.5,
                                        fontWeight: FontWeight.w900)),
                              )
                            : _StatusPill(status: r.status),
                      ],
                    ),
                  ),
                  Text(
                    'Créé le ${r.createdAt != null ? dateFmt.format(r.createdAt!) : '—'}',
                    style: const TextStyle(
                        fontSize: 10, color: Colors.black45),
                  ),
                ],
              ),
            ),
            const Divider(height: 1),
            Padding(
              padding: const EdgeInsets.all(12),
              child: GridView.count(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisCount: 2,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 2.2,
                children: [
                  _InfoCell(
                      label: 'Client',
                      value: d.customerName ?? r.customerName ?? '—'),
                  _InfoCell(label: 'Véhicule', value: vehicleCell),
                  _InfoCell(label: 'Immatriculation', value: regCell),
                  _InfoCell(
                      label: 'Début',
                      value: r.startAt != null
                          ? dateFmt.format(r.startAt!)
                          : '—'),
                  _InfoCell(
                      label: 'Fin',
                      value: r.endAt != null
                          ? dateFmt.format(r.endAt!)
                          : '—'),
                  _InfoCell(
                      label: 'Total',
                      value: '${money.format(grand)} MAD'),
                  _InfoCell(
                      label: 'Solde',
                      value: '${money.format(balance)} MAD',
                      highlight: balance > 0),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCell extends StatelessWidget {
  const _InfoCell(
      {required this.label, required this.value, this.highlight = false});
  final String label;
  final String value;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: const TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: Colors.black45,
                  letterSpacing: 1.1)),
          const SizedBox(height: 2),
          Expanded(
            child: Text(
              value,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 12.5,
                fontWeight: FontWeight.w900,
                color:
                    highlight ? const Color(0xFFE11D48) : const Color(0xFF1F2937),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;
  @override
  Widget build(BuildContext context) {
    final s = status.toLowerCase();
    final (bg, fg) = switch (s) {
      'closed' || 'reserved' || 'confirmed' => (
        const Color(0xFFDCFCE7),
        const Color(0xFF166534)
      ),
      'cancelled' => (
        const Color(0xFFFEE2E2),
        const Color(0xFFB91C1C)
      ),
      'active' || 'handed_over' => (
        const Color(0xFFE0E7FF),
        const Color(0xFF3730A3)
      ),
      _ when s.contains('pending') || s == 'extension_requested' => (
        const Color(0xFFFEF3C7),
        const Color(0xFF92400E)
      ),
      _ => (const Color(0xFFDBEAFE), const Color(0xFF1E3A8A)),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration:
          BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Text(frenchStatus(status).toUpperCase(),
          style: TextStyle(
              color: fg,
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.5)),
    );
  }
}

// ---------------------------------------------------------------------------
// Banners + quick actions
// ---------------------------------------------------------------------------

class _DraftBanner extends StatelessWidget {
  const _DraftBanner({required this.busy, required this.onValidate});
  final bool busy;
  final VoidCallback onValidate;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFDE68A)),
        ),
        child: Row(
          children: [
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Intention de réservation — non validée',
                      style: TextStyle(
                          color: Color(0xFF78350F),
                          fontWeight: FontWeight.w900,
                          fontSize: 12.5)),
                  SizedBox(height: 2),
                  Text(
                      "Le véhicule n'est pas bloqué. Validez pour confirmer et réserver le créneau.",
                      style: TextStyle(
                          color: Color(0xFF92400E), fontSize: 11)),
                ],
              ),
            ),
            FilledButton(
              onPressed: busy ? null : onValidate,
              style: FilledButton.styleFrom(
                backgroundColor: const Color(0xFF10B981),
                foregroundColor: Colors.white,
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                textStyle: const TextStyle(
                    fontWeight: FontWeight.w900, fontSize: 11.5),
              ),
              child: const Text('✓ Valider'),
            ),
          ],
        ),
      ),
    );
  }
}

class _NoContractBanner extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: const Color(0xFFFFFBEB),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFFDE68A)),
        ),
        child: Row(
          children: const [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Aucun contrat associé',
                      style: TextStyle(
                          color: Color(0xFF78350F),
                          fontWeight: FontWeight.w900,
                          fontSize: 12.5)),
                  SizedBox(height: 2),
                  Text(
                      'Générez un contrat pour formaliser la location.',
                      style: TextStyle(
                          color: Color(0xFF92400E), fontSize: 11)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _QuickActions extends StatelessWidget {
  const _QuickActions({
    required this.d,
    required this.busy,
    required this.confirmDelete,
    required this.onValidate,
    required this.onConfirm,
    required this.onCancel,
    required this.onDeleteStart,
    required this.onDeleteCancel,
    required this.onDeleteConfirm,
    required this.onGenerateContract,
    required this.onCheckout,
    required this.onCheckin,
    required this.onAddPayment,
    required this.onInvoice,
  });

  final ReservationDetailDto d;
  final bool busy;
  final bool confirmDelete;
  final VoidCallback onValidate;
  final VoidCallback onConfirm;
  final VoidCallback onCancel;
  final VoidCallback onDeleteStart;
  final VoidCallback onDeleteCancel;
  final VoidCallback onDeleteConfirm;
  final VoidCallback onGenerateContract;
  final VoidCallback onCheckout;
  final VoidCallback onCheckin;
  final VoidCallback onAddPayment;
  final VoidCallback onInvoice;

  @override
  Widget build(BuildContext context) {
    final r = d.reservation;
    final s = r.status.toLowerCase();
    final actions = <Widget>[];
    if (r.isDraft) {
      actions.add(_mini('✓ Valider', const Color(0xFF10B981), onValidate));
    }
    if (!r.isCancelled && !r.isClosed && !d.hasContract) {
      actions.add(
          _mini('Générer contrat', const Color(0xFFF59E0B), onGenerateContract));
    }
    if (s == 'reserved') {
      actions.add(_mini('Confirmer', const Color(0xFF4F46E5), onConfirm));
    }
    if (!r.isCancelled && !r.isClosed) {
      actions.add(_mini('Check-Out', const Color(0xFF10B981), onCheckout));
      actions.add(_mini('Check-In', const Color(0xFF06B6D4), onCheckin));
      actions.add(_mini('+ Paiement', const Color(0xFF8B5CF6), onAddPayment));
      actions.add(_miniOutline('Générer facture', onInvoice));
      actions.add(_miniOutline('Annuler', onCancel,
          borderColor: const Color(0xFFFECACA),
          foregroundColor: const Color(0xFFB91C1C)));
    }
    if (s == 'cancelled' && !confirmDelete) {
      actions.add(_mini('Supprimer', const Color(0xFFE11D48), onDeleteStart));
    }
    if (s == 'cancelled' && confirmDelete) {
      actions.add(_mini('Oui, supprimer', const Color(0xFFBE123C),
          busy ? () {} : onDeleteConfirm));
      actions.add(_miniOutline('Annuler', onDeleteCancel));
    }
    if (actions.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: const Color(0xFFF8FAFC),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Wrap(spacing: 6, runSpacing: 6, children: actions),
      ),
    );
  }

  Widget _mini(String label, Color color, VoidCallback onTap) {
    return FilledButton(
      onPressed: busy ? null : onTap,
      style: FilledButton.styleFrom(
        backgroundColor: color,
        foregroundColor: Colors.white,
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 10.5),
        minimumSize: const Size(0, 30),
      ),
      child: Text(label),
    );
  }

  Widget _miniOutline(String label, VoidCallback onTap,
      {Color? borderColor, Color? foregroundColor}) {
    return OutlinedButton(
      onPressed: busy ? null : onTap,
      style: OutlinedButton.styleFrom(
        foregroundColor: foregroundColor ?? const Color(0xFF334155),
        side: BorderSide(color: borderColor ?? const Color(0xFFCBD5E1)),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        textStyle: const TextStyle(fontWeight: FontWeight.w900, fontSize: 10.5),
        minimumSize: const Size(0, 30),
      ),
      child: Text(label),
    );
  }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

class _TabsBar extends StatelessWidget {
  const _TabsBar({required this.current, required this.onChanged});
  final _Tab current;
  final ValueChanged<_Tab> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(14)),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(
          children: [
            for (final t in _Tab.values)
              InkWell(
                onTap: () => onChanged(t),
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                  decoration: BoxDecoration(
                    border: Border(
                      bottom: BorderSide(
                        width: 2,
                        color: current == t
                            ? const Color(0xFF4F46E5)
                            : Colors.transparent,
                      ),
                    ),
                  ),
                  child: Text(_tabLabels[t]!,
                      style: TextStyle(
                        color: current == t
                            ? const Color(0xFF4338CA)
                            : Colors.black54,
                        fontSize: 12,
                        fontWeight: FontWeight.w900,
                      )),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TabContent extends StatelessWidget {
  const _TabContent({required this.tab, required this.d});
  final _Tab tab;
  final ReservationDetailDto d;

  @override
  Widget build(BuildContext context) {
    final child = switch (tab) {
      _Tab.summary => _TabSummary(d: d),
      _Tab.drivers => _TabList<DriverDto>(
          items: d.drivers,
          empty: 'Aucun conducteur enregistré.',
          builder: (x) => _driverTile(context, x),
        ),
      _Tab.contract => _TabContract(d: d),
      _Tab.checkout => _TabHandover(
          reports: d.handoverReports
              .where((h) => h.kind.contains('pickup'))
              .toList(),
          empty: 'Aucune remise enregistrée.'),
      _Tab.checkin => _TabHandover(
          reports: d.handoverReports
              .where((h) => h.kind.contains('return'))
              .toList(),
          empty: 'Aucun retour enregistré.'),
      _Tab.extensions => _TabList<ExtensionDto>(
          items: d.extensions,
          empty: 'Aucune prolongation.',
          builder: (e) => _extensionTile(context, e),
        ),
      _Tab.damages => _TabList<DamageReportDto>(
          items: d.damageReports,
          empty: 'Aucun dommage enregistré.',
          builder: (dm) => _damageTile(context, dm),
        ),
      _Tab.payments => _TabPayments(d: d),
      _Tab.invoices => _TabList<InvoiceDto>(
          items: d.invoices,
          empty: 'Aucune facture.',
          builder: (iv) => _invoiceTile(context, iv),
        ),
      _Tab.history => _TabList<HistoryEntryDto>(
          items: d.history,
          empty: 'Aucun événement historique.',
          builder: (h) => _historyTile(context, h),
        ),
    };
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.fromLTRB(14, 14, 14, 18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius:
            const BorderRadius.vertical(bottom: Radius.circular(14)),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: child,
    );
  }

  Widget _driverTile(BuildContext context, DriverDto d) => _tile(
        context,
        title: d.name,
        subtitleParts: [d.phone, d.email, d.licenseNumber],
      );

  Widget _extensionTile(BuildContext context, ExtensionDto e) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return _tile(
      context,
      title: kExtensionStatusFr[e.status] ?? e.status,
      subtitleParts: [
        if (e.newEndAt != null) 'Nouvelle fin : ${dateFmt.format(e.newEndAt!)}',
        if (e.additionalAmount != null)
          '+${money.format(e.additionalAmount)} MAD',
        if (e.notes != null && e.notes!.isNotEmpty) e.notes,
      ],
    );
  }

  Widget _damageTile(BuildContext context, DamageReportDto d) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return _tile(
      context,
      title: kDamageTypeFr[d.damageType ?? ''] ?? (d.damageType ?? 'Dommage'),
      subtitleParts: [
        if (d.description != null && d.description!.isNotEmpty) d.description,
        if (d.estimatedCost != null) '${money.format(d.estimatedCost)} MAD',
        if (d.responsibleParty != null)
          kResponsiblePartyFr[d.responsibleParty!] ?? d.responsibleParty!,
        if (d.at != null) dateFmt.format(d.at!),
      ],
    );
  }

  Widget _invoiceTile(BuildContext context, InvoiceDto iv) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return _tile(
      context,
      title: iv.number,
      subtitleParts: [
        kInvoiceStatusFr[iv.status] ?? iv.status,
        if (iv.amount != null) '${money.format(iv.amount)} MAD',
        if (iv.issueDate != null) 'Émise ${dateFmt.format(iv.issueDate!)}',
        if (iv.dueDate != null) 'Échéance ${dateFmt.format(iv.dueDate!)}',
      ],
    );
  }

  Widget _historyTile(BuildContext context, HistoryEntryDto h) {
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return _tile(
      context,
      title: h.action,
      subtitleParts: [
        if (h.actor != null) h.actor,
        if (h.at != null) dateFmt.format(h.at!),
        if (h.details != null && h.details!.isNotEmpty) h.details,
      ],
    );
  }

  Widget _tile(BuildContext context,
      {required String title, required List<String?> subtitleParts}) {
    final parts = subtitleParts
        .where((e) => e != null && e.toString().isNotEmpty)
        .map((e) => e.toString())
        .toList();
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: const TextStyle(
                  fontWeight: FontWeight.w800, fontSize: 13)),
          if (parts.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(parts.join(' · '),
                style: const TextStyle(
                    color: Colors.black54, fontSize: 11.5)),
          ],
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab: Summary
// ---------------------------------------------------------------------------

class _TabSummary extends StatelessWidget {
  const _TabSummary({required this.d});
  final ReservationDetailDto d;

  @override
  Widget build(BuildContext context) {
    final r = d.reservation;
    final totals = d.totals ??
        const ReservationTotals(
            estimatedPrice: 0,
            paid: 0,
            extensionsTotal: 0,
            damagesTotal: 0);
    final money = NumberFormat.decimalPattern('fr');
    final grand = totals.expected;
    final balance = grand - totals.paid;
    final days = r.startAt != null && r.endAt != null
        ? r.endAt!.difference(r.startAt!).inDays
        : 0;
    final kpiTiles = <_KpiTile>[
      _KpiTile(
          label: 'Durée location',
          value: '${days > 0 ? days : 1} jour${days > 1 ? 's' : ''}',
          color: const Color(0xFF4F46E5)),
      _KpiTile(
          label: 'Tarif / jour',
          value: totals.dailyRate > 0
              ? '${money.format(totals.dailyRate)} MAD'
              : (r.dailyRate != null
                  ? '${money.format(r.dailyRate)} MAD'
                  : '—'),
          color: const Color(0xFF2563EB)),
      _KpiTile(
          label: 'Montant total',
          value: '${money.format(grand)} MAD',
          color: const Color(0xFF1F2937)),
      _KpiTile(
          label: 'Payé',
          value: '${money.format(totals.paid)} MAD',
          color: const Color(0xFF059669)),
      _KpiTile(
          label: 'Solde restant',
          value: '${money.format(balance)} MAD',
          color: balance > 0
              ? const Color(0xFFE11D48)
              : const Color(0xFF059669)),
      _KpiTile(
          label: 'Caution',
          value: totals.depositAmount > 0
              ? '${money.format(totals.depositAmount)} MAD'
              : (r.depositAmount != null
                  ? '${money.format(r.depositAmount)} MAD'
                  : '—'),
          color: const Color(0xFFB45309)),
      _KpiTile(
          label: 'Km inclus',
          value: totals.allowedKm > 0
              ? '${totals.allowedKm.toStringAsFixed(0)} km/jour'
              : (r.allowedKmPerDay != null
                  ? '${r.allowedKmPerDay} km/jour'
                  : '—'),
          color: const Color(0xFF06B6D4)),
      _KpiTile(
          label: 'Extensions',
          value: '${money.format(totals.extensionsTotal)} MAD',
          color: const Color(0xFF7C3AED)),
      _KpiTile(
          label: 'Dommages',
          value: '${money.format(totals.damagesTotal)} MAD',
          color: const Color(0xFFEA580C)),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        GridView.count(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          childAspectRatio: 2.1,
          children: kpiTiles,
        ),
        const SizedBox(height: 12),
        _InfoRow(
            label: 'Type',
            value: r.reservationType != null
                ? reservationTypeFr(r.reservationType!)
                : '—'),
        _InfoRow(label: 'Adresse pickup', value: r.pickupAddress ?? '—'),
        _InfoRow(label: 'Adresse livraison', value: r.deliveryAddress ?? '—'),
      ],
    );
  }
}

class _KpiTile extends StatelessWidget {
  const _KpiTile(
      {required this.label, required this.value, required this.color});
  final String label;
  final String value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w800,
                  color: color.withOpacity(0.8),
                  letterSpacing: 1)),
          const SizedBox(height: 3),
          Text(value,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  color: color,
                  fontSize: 14,
                  fontWeight: FontWeight.w900)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 11.5,
                    color: Colors.black54,
                    fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Text(value,
                textAlign: TextAlign.right,
                style: const TextStyle(
                    fontSize: 12.5, fontWeight: FontWeight.w800)),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Tab: Contract
// ---------------------------------------------------------------------------

class _TabContract extends StatelessWidget {
  const _TabContract({required this.d});
  final ReservationDetailDto d;

  @override
  Widget build(BuildContext context) {
    if (d.contract == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 20),
        child: Text(
            'Aucun contrat lié. Utilisez « Générer contrat » pour en créer un.',
            style: TextStyle(color: Colors.black45, fontSize: 13)),
      );
    }
    final c = d.contract!;
    final money = NumberFormat.decimalPattern('fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _InfoRow(label: 'Numéro', value: c.number),
        _InfoRow(label: 'Statut', value: c.status),
        _InfoRow(
            label: 'Caution',
            value: c.depositAmount != null
                ? '${money.format(c.depositAmount)} MAD'
                : '—'),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Tab: Payments
// ---------------------------------------------------------------------------

class _TabPayments extends StatelessWidget {
  const _TabPayments({required this.d});
  final ReservationDetailDto d;

  @override
  Widget build(BuildContext context) {
    final money = NumberFormat.decimalPattern('fr');
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (d.deposits.isNotEmpty) ...[
          const Text('FRANCHISES',
              style: TextStyle(
                  color: Colors.black45,
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 1.3)),
          const SizedBox(height: 6),
          for (final dep in d.deposits)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _rowLine(
                context,
                title: '${money.format(dep.amount)} MAD',
                subtitle: [
                  kDepositStatusFr[dep.status] ?? dep.status,
                  if (dep.method != null)
                    kPaymentMethodFr[dep.method!] ?? dep.method!,
                  if (dep.collectedAt != null)
                    dateFmt.format(dep.collectedAt!),
                ].join(' · '),
              ),
            ),
          const SizedBox(height: 10),
        ],
        const Text('PAIEMENTS',
            style: TextStyle(
                color: Colors.black45,
                fontSize: 10.5,
                fontWeight: FontWeight.w800,
                letterSpacing: 1.3)),
        const SizedBox(height: 6),
        if (d.payments.isEmpty)
          const Text('Aucun paiement enregistré.',
              style: TextStyle(color: Colors.black45, fontSize: 12.5))
        else
          for (final p in d.payments)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _rowLine(
                context,
                title: '${money.format(p.amount)} MAD',
                subtitle: [
                  kPaymentMethodFr[p.method] ?? p.method,
                  if (p.type != null)
                    kPaymentTypeFr[p.type!] ?? p.type!,
                  if (p.paymentDate != null) dateFmt.format(p.paymentDate!),
                  if (p.isReversed) 'Refusé',
                ].join(' · '),
                strikethrough: p.isReversed,
              ),
            ),
      ],
    );
  }

  Widget _rowLine(BuildContext context,
      {required String title,
      required String subtitle,
      bool strikethrough = false}) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Theme.of(context).dividerColor),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title,
              style: TextStyle(
                  fontWeight: FontWeight.w900,
                  fontSize: 13,
                  decoration: strikethrough ? TextDecoration.lineThrough : null,
                  color: strikethrough ? Colors.black38 : Colors.black87)),
          const SizedBox(height: 2),
          Text(subtitle,
              style: const TextStyle(
                  color: Colors.black54, fontSize: 11.5)),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Shared: handover tab
// ---------------------------------------------------------------------------

class _TabHandover extends StatelessWidget {
  const _TabHandover({required this.reports, required this.empty});
  final List<HandoverReportDto> reports;
  final String empty;

  @override
  Widget build(BuildContext context) {
    if (reports.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Text(empty,
            style: const TextStyle(color: Colors.black45, fontSize: 13)),
      );
    }
    final dateFmt = DateFormat('dd/MM/yyyy HH:mm', 'fr');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final r in reports)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Theme.of(context).dividerColor),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    r.at != null
                        ? dateFmt.format(r.at!)
                        : 'Date inconnue',
                    style: const TextStyle(
                        fontWeight: FontWeight.w900, fontSize: 12.5)),
                const SizedBox(height: 4),
                Text(
                  [
                    if (r.odometer != null) '${r.odometer} km',
                    if (r.fuelLevel != null)
                      'Carburant ${r.fuelLevel!.toStringAsFixed(0)}%',
                    if (r.signature != null && r.signature!.isNotEmpty)
                      'Signé',
                  ].join(' · '),
                  style:
                      const TextStyle(fontSize: 11.5, color: Colors.black54),
                ),
                if (r.conditionNotes != null && r.conditionNotes!.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(r.conditionNotes!,
                        style: const TextStyle(
                            fontSize: 11.5, color: Colors.black87)),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// Shared: TabList
// ---------------------------------------------------------------------------

class _TabList<T> extends StatelessWidget {
  const _TabList({
    required this.items,
    required this.empty,
    required this.builder,
  });

  final List<T> items;
  final String empty;
  final Widget Function(T) builder;

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Text(empty,
            style: const TextStyle(color: Colors.black45, fontSize: 13)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [for (final it in items) builder(it)],
    );
  }
}

// ---------------------------------------------------------------------------
// Error
// ---------------------------------------------------------------------------

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onBack});
  final String message;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    String friendly = message;
    if (message.contains('DioException')) {
      final match = RegExp(r'status code of (\d+)').firstMatch(message);
      if (match != null) {
        friendly = 'Le serveur a répondu avec un code ${match[1]}.';
      } else {
        friendly = "Le serveur n'a pas pu renvoyer la fiche.";
      }
    }
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
          ],
        ),
        const SizedBox(height: 40),
        const Icon(Icons.cloud_off, size: 56, color: Colors.black26),
        const SizedBox(height: 12),
        const Center(
            child: Text('Fiche indisponible',
                style:
                    TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
        const SizedBox(height: 10),
        Center(
            child: Text(friendly,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(color: Colors.black54, fontSize: 13))),
      ],
    );
  }
}


