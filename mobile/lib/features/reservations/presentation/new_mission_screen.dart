import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../core/api/api_client.dart';
import '../../../core/widgets/module_scaffold.dart';

/// Création d'une mission liée à une réservation — pendant mobile de
/// `MissionCreationDrawer.tsx` du web. On conserve les mêmes types,
/// priorités et durées préréglées ; le payload POST
/// `/v1/reservations/{id}/create-mission` matche exactement celui
/// qu'`opsApi.createMission` envoie côté web.
class NewMissionScreen extends ConsumerStatefulWidget {
  const NewMissionScreen({
    super.key,
    required this.reservationId,
    this.reservationNumber,
    this.customerName,
    this.vehicleLabel,
    this.vehiclePlate,
    this.pickupAddress,
    this.deliveryAddress,
    this.customerId,
    this.contractId,
  });

  final String reservationId;
  final String? reservationNumber;
  final String? customerName;
  final String? vehicleLabel;
  final String? vehiclePlate;
  final String? pickupAddress;
  final String? deliveryAddress;
  final String? customerId;
  final String? contractId;

  @override
  ConsumerState<NewMissionScreen> createState() =>
      _NewMissionScreenState();
}

const _kMissionTypes = <(String, String)>[
  ('delivery', 'Livraison'),
  ('pickup', 'Récupération'),
  ('transfer', 'Transfert'),
  ('convoy', 'Convoyage'),
  ('inspection', 'Inspection'),
  ('cleaning', 'Nettoyage'),
  ('workshop', 'Atelier'),
  ('fuel', 'Carburant'),
  ('other', 'Autre'),
];

const _kPriorities = <(String, String, Color, Color)>[
  ('low', 'Faible', Color(0xFFF1F5F9), Color(0xFF475569)),
  ('normal', 'Normale', Color(0xFFDBEAFE), Color(0xFF1E40AF)),
  ('high', 'Haute', Color(0xFFFEF3C7), Color(0xFF92400E)),
  ('urgent', 'Urgente', Color(0xFFFEE2E2), Color(0xFFB91C1C)),
];

const _kDurationPresets = <(int, String)>[
  (30, '30 min'),
  (60, '1 h'),
  (90, '1h30'),
  (120, '2 h'),
  (180, '3 h'),
];

const _kTolerances = <(int, String)>[
  (15, '± 15 min'),
  (30, '± 30 min'),
  (60, '± 1 h'),
];

class _NewMissionScreenState extends ConsumerState<NewMissionScreen> {
  String _type = 'delivery';
  String _priority = 'normal';
  DateTime? _date;
  TimeOfDay _time = const TimeOfDay(hour: 9, minute: 0);
  int _duration = 60;
  final _customDuration = TextEditingController();
  int _tolerance = 30;
  String? _agentId;
  bool _assignLater = false;
  final _originAddress = TextEditingController();
  final _destinationAddress = TextEditingController();
  final _pickupAddress = TextEditingController();
  final _dropoffAddress = TextEditingController();
  final _altContact = TextEditingController();
  final _clientInstructions = TextEditingController();
  final _notes = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _pickupAddress.text = widget.pickupAddress ?? '';
    _dropoffAddress.text = widget.deliveryAddress ?? '';
    _destinationAddress.text = widget.deliveryAddress ?? '';
  }

  @override
  void dispose() {
    _customDuration.dispose();
    _originAddress.dispose();
    _destinationAddress.dispose();
    _pickupAddress.dispose();
    _dropoffAddress.dispose();
    _altContact.dispose();
    _clientInstructions.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final api = ref.read(apiClientProvider);
      String? scheduledStart;
      if (_date != null) {
        final d = DateTime(_date!.year, _date!.month, _date!.day,
            _time.hour, _time.minute);
        scheduledStart = DateFormat("yyyy-MM-dd'T'HH:mm:ss").format(d);
      }
      final durationMin =
          int.tryParse(_customDuration.text.trim()) ?? _duration;
      final body = <String, dynamic>{
        'mission_type': _type,
        'priority': _priority,
        if (!_assignLater && _agentId != null) 'assigned_user_id': _agentId,
        if (scheduledStart != null) 'scheduled_start_at': scheduledStart,
        if (durationMin > 0) 'estimated_duration_minutes': durationMin,
        'tolerance_minutes': _tolerance,
        if (_originAddress.text.trim().isNotEmpty)
          'origin_address': _originAddress.text.trim(),
        if (_destinationAddress.text.trim().isNotEmpty)
          'destination_address': _destinationAddress.text.trim(),
        if (_pickupAddress.text.trim().isNotEmpty)
          'pickup_address': _pickupAddress.text.trim(),
        if (_dropoffAddress.text.trim().isNotEmpty)
          'dropoff_address': _dropoffAddress.text.trim(),
        if (widget.customerId != null) 'client_id': widget.customerId,
        if (widget.contractId != null) 'contract_id': widget.contractId,
        if (_clientInstructions.text.trim().isNotEmpty)
          'client_instructions': _clientInstructions.text.trim(),
        if (_notes.text.trim().isNotEmpty) 'notes': _notes.text.trim(),
        if (_altContact.text.trim().isNotEmpty)
          'alt_contact': _altContact.text.trim(),
        if (!_assignLater && _agentId != null) 'status': 'assigned',
      };
      await api.raw.post(
        '/reservations/${widget.reservationId}/create-mission',
        data: body,
      );
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Mission créée.')),
      );
      Navigator.of(context).pop(true);
    } catch (e) {
      final msg = e is DioException
          ? (e.response?.data is Map
              ? (e.response?.data['message']?.toString() ?? e.message ?? '$e')
              : (e.message ?? '$e'))
          : '$e';
      setState(() => _error = msg);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final dateFmt = DateFormat('dd/MM/yyyy', 'fr');
    return Scaffold(
      appBar: AppBar(title: const Text('Nouvelle mission')),
      body: ModuleBackground(
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ─── Résumé réservation ─────────────────────────────────
            ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('Réservation',
                      style:
                          TextStyle(fontSize: 11, color: Colors.black45)),
                  const SizedBox(height: 6),
                  ModuleKV(
                      label: 'N° Réservation',
                      value: widget.reservationNumber ??
                          widget.reservationId.substring(0, 8)),
                  if (widget.customerName != null)
                    ModuleKV(label: 'Client', value: widget.customerName!),
                  if (widget.vehicleLabel != null)
                    ModuleKV(
                        label: 'Véhicule',
                        value: widget.vehiclePlate == null
                            ? widget.vehicleLabel!
                            : '${widget.vehicleLabel} · ${widget.vehiclePlate}'),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ─── Infos générales ───────────────────────────────────
            _Section('1 — Informations générales'),
            ModuleCard(
              child: Column(
                children: [
                  _LabeledDropdown<String>(
                    label: 'Type de mission *',
                    value: _type,
                    items: _kMissionTypes,
                    onChanged: (v) => setState(() => _type = v ?? _type),
                  ),
                  const SizedBox(height: 10),
                  _LabeledDropdown<String>(
                    label: 'Priorité',
                    value: _priority,
                    items: [for (final p in _kPriorities) (p.$1, p.$2)],
                    onChanged: (v) =>
                        setState(() => _priority = v ?? _priority),
                  ),
                  const SizedBox(height: 8),
                  _PriorityChip(priority: _priority),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ─── Planification ─────────────────────────────────────
            _Section('2 — Planification'),
            ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _DateCell(
                          label: 'Date prévue',
                          value: _date == null
                              ? 'Choisir'
                              : dateFmt.format(_date!),
                          onTap: () async {
                            final picked = await showDatePicker(
                              context: context,
                              initialDate: _date ?? DateTime.now(),
                              firstDate: DateTime(2020),
                              lastDate: DateTime(2100),
                              locale: const Locale('fr'),
                            );
                            if (picked != null) {
                              setState(() => _date = picked);
                            }
                          },
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _DateCell(
                          label: 'Heure prévue',
                          value:
                              '${_time.hour.toString().padLeft(2, '0')}:${_time.minute.toString().padLeft(2, '0')}',
                          onTap: () async {
                            final picked = await showTimePicker(
                                context: context, initialTime: _time);
                            if (picked != null) {
                              setState(() => _time = picked);
                            }
                          },
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const _MicroLabel('Durée estimée'),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final d in _kDurationPresets)
                        _ChipPill(
                          label: d.$2,
                          selected: _duration == d.$1 &&
                              _customDuration.text.isEmpty,
                          onTap: () => setState(() {
                            _duration = d.$1;
                            _customDuration.clear();
                          }),
                        ),
                      SizedBox(
                        width: 110,
                        child: TextField(
                          controller: _customDuration,
                          keyboardType: TextInputType.number,
                          decoration: _dec(hint: 'Autre (min)'),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 10),
                  const _MicroLabel('Fenêtre de tolérance'),
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: [
                      for (final t in _kTolerances)
                        _ChipPill(
                          label: t.$2,
                          selected: _tolerance == t.$1,
                          onTap: () => setState(() => _tolerance = t.$1),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ─── Affectation ──────────────────────────────────────
            _Section('3 — Affectation'),
            ModuleCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    controlAffinity: ListTileControlAffinity.leading,
                    dense: true,
                    value: _assignLater,
                    onChanged: (v) => setState(() {
                      _assignLater = v ?? false;
                      if (_assignLater) _agentId = null;
                    }),
                    title: const Text('Affecter plus tard',
                        style: TextStyle(
                            fontSize: 12.5, fontWeight: FontWeight.w800)),
                  ),
                  if (!_assignLater)
                    _AgentPicker(
                      value: _agentId,
                      onChanged: (id) => setState(() => _agentId = id),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ─── Localisation ─────────────────────────────────────
            _Section('4 — Localisation'),
            ModuleCard(
              child: Column(
                children: [
                  TextField(
                    controller: _originAddress,
                    decoration: _dec(label: "Adresse d'origine"),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _destinationAddress,
                    decoration: _dec(label: 'Adresse de destination'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _pickupAddress,
                    decoration: _dec(label: 'Adresse Pickup'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _dropoffAddress,
                    decoration: _dec(label: 'Adresse Drop-off'),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ─── Contact / notes ──────────────────────────────────
            _Section('5 — Contact & instructions'),
            ModuleCard(
              child: Column(
                children: [
                  TextField(
                    controller: _altContact,
                    decoration: _dec(label: 'Contact alternatif'),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _clientInstructions,
                    maxLines: 2,
                    decoration: _dec(
                        label: 'Instructions client',
                        hint:
                            "Appeler avant d'arriver, portail bleu, apt 5…"),
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _notes,
                    maxLines: 3,
                    decoration: _dec(label: 'Notes internes'),
                  ),
                ],
              ),
            ),

            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFFCA5A5)),
                ),
                child: Text(_error!,
                    style: const TextStyle(
                        fontSize: 12, color: Color(0xFF7F1D1D))),
              ),
            ],

            const SizedBox(height: 20),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed:
                        _busy ? null : () => Navigator.of(context).pop(),
                    child: const Text('Annuler'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  flex: 2,
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _submit,
                    icon: const Icon(Icons.check, size: 18),
                    label: Text(_busy ? 'Création…' : 'Créer la mission'),
                    style: FilledButton.styleFrom(
                      backgroundColor: const Color(0xFFB8933F),
                      minimumSize: const Size.fromHeight(48),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Petits widgets internes ───────────────────────────────────────────

class _Section extends StatelessWidget {
  const _Section(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, left: 2),
      child: Text(text.toUpperCase(),
          style: const TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w900,
              color: Colors.black45,
              letterSpacing: 1.1)),
    );
  }
}

class _MicroLabel extends StatelessWidget {
  const _MicroLabel(this.text);
  final String text;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6, top: 2),
      child: Text(text.toUpperCase(),
          style: const TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w900,
              color: Colors.black45,
              letterSpacing: 0.6)),
    );
  }
}

class _LabeledDropdown<T> extends StatelessWidget {
  const _LabeledDropdown({
    required this.label,
    required this.value,
    required this.items,
    required this.onChanged,
  });
  final String label;
  final T? value;
  final List<(T, String)> items;
  final ValueChanged<T?> onChanged;
  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<T>(
      value: value,
      isExpanded: true,
      decoration: _dec(label: label),
      items: [
        for (final e in items)
          DropdownMenuItem(value: e.$1, child: Text(e.$2)),
      ],
      onChanged: onChanged,
    );
  }
}

class _PriorityChip extends StatelessWidget {
  const _PriorityChip({required this.priority});
  final String priority;
  @override
  Widget build(BuildContext context) {
    final p = _kPriorities.firstWhere((e) => e.$1 == priority,
        orElse: () => _kPriorities.first);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      decoration: BoxDecoration(
          color: p.$3, borderRadius: BorderRadius.circular(999)),
      child: Text(p.$2.toUpperCase(),
          style: TextStyle(
              color: p.$4,
              fontSize: 10,
              fontWeight: FontWeight.w900,
              letterSpacing: 0.4)),
    );
  }
}

class _ChipPill extends StatelessWidget {
  const _ChipPill({
    required this.label,
    required this.selected,
    required this.onTap,
  });
  final String label;
  final bool selected;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color:
              selected ? const Color(0xFFB8933F) : const Color(0xFFF1F5F9),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 11.5,
                fontWeight: FontWeight.w900,
                color: selected ? Colors.white : const Color(0xFF475569))),
      ),
    );
  }
}

class _DateCell extends StatelessWidget {
  const _DateCell(
      {required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
        decoration: BoxDecoration(
          color: const Color(0xFFF5F6FB),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Theme.of(context).dividerColor),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label,
                style: const TextStyle(
                    color: Colors.black54,
                    fontSize: 11,
                    fontWeight: FontWeight.w800)),
            const SizedBox(height: 4),
            Text(value,
                style: const TextStyle(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w800,
                    color: Colors.black87)),
          ],
        ),
      ),
    );
  }
}

/// Dropdown de recherche d'un agent AGENT_LIVRAISON. Charge
/// `/v1/users?role=AGENT_LIVRAISON&status=active` et filtre côté client.
class _AgentPicker extends ConsumerStatefulWidget {
  const _AgentPicker({required this.value, required this.onChanged});
  final String? value;
  final ValueChanged<String?> onChanged;
  @override
  ConsumerState<_AgentPicker> createState() => _AgentPickerState();
}

class _AgentPickerState extends ConsumerState<_AgentPicker> {
  final _search = TextEditingController();

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(_agentsProvider);
    return async.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: 10),
        child: Center(
            child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Text("Impossible de charger les agents : $e",
            style: const TextStyle(fontSize: 11, color: Colors.redAccent)),
      ),
      data: (agents) {
        final q = _search.text.toLowerCase();
        final filtered = q.isEmpty
            ? agents
            : agents.where((a) {
                final n = (a['name'] ?? a['email'] ?? '').toString().toLowerCase();
                return n.contains(q);
              }).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextField(
              controller: _search,
              onChanged: (_) => setState(() {}),
              decoration: _dec(label: 'Agent', hint: 'Rechercher…'),
            ),
            const SizedBox(height: 6),
            Container(
              constraints: const BoxConstraints(maxHeight: 220),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: filtered.isEmpty ? 1 : filtered.length,
                separatorBuilder: (_, __) =>
                    const Divider(height: 1, color: Color(0xFFF1F5F9)),
                itemBuilder: (_, i) {
                  if (filtered.isEmpty) {
                    return const Padding(
                      padding: EdgeInsets.all(10),
                      child: Text('Aucun agent trouvé.',
                          style: TextStyle(
                              fontSize: 11.5, color: Colors.black54)),
                    );
                  }
                  final a = filtered[i];
                  final id = a['id']?.toString();
                  final selected = widget.value == id;
                  return ListTile(
                    dense: true,
                    selected: selected,
                    selectedTileColor: const Color(0xFFEEF0FB),
                    title: Text(
                        (a['name'] ?? a['email'] ?? '—').toString(),
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800)),
                    subtitle: Text(
                        [a['email'], a['phone']]
                            .where((v) => v != null && v.toString().isNotEmpty)
                            .join(' · '),
                        style: const TextStyle(fontSize: 11)),
                    trailing: selected
                        ? const Icon(Icons.check_circle,
                            color: Color(0xFF059669), size: 18)
                        : null,
                    onTap: () => widget.onChanged(id),
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

final _agentsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final resp = await api.raw.get('/users', queryParameters: {
    'role': 'AGENT_LIVRAISON',
    'status': 'active',
    'per_page': 100,
  });
  final body = resp.data;
  final list = body is Map ? body['data'] : body;
  if (list is! List) return const [];
  return [
    for (final a in list)
      if (a is Map) a.map((k, v) => MapEntry(k.toString(), v)),
  ];
});

InputDecoration _dec({String? label, String? hint}) {
  return InputDecoration(
    labelText: label,
    hintText: hint,
    isDense: true,
    border: const OutlineInputBorder(),
    contentPadding:
        const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
  );
}
