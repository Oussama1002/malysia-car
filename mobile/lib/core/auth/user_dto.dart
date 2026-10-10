/// Profil complet de l'utilisateur connecté — reproduit `UserResource`
/// du backend (clés camelCase/snake_case tolérées).
class UserDto {
  const UserDto({
    required this.id,
    required this.email,
    this.name,
    this.firstName,
    this.lastName,
    this.phone,
    this.role,
    this.avatar,
    this.status,
    this.locale,
    this.companyId,
    this.branchId,
    this.lastLoginAt,
    this.createdAt,
    this.roles = const [],
    this.branches = const [],
    this.permissions = const [],
  });

  final String id;
  final String email;
  final String? name;
  final String? firstName;
  final String? lastName;
  final String? phone;
  final String? role;
  final String? avatar;
  final String? status;
  final String? locale;
  final String? companyId;
  final String? branchId;
  final DateTime? lastLoginAt;
  final DateTime? createdAt;
  final List<UserRoleDto> roles;
  final List<UserBranchDto> branches;
  final List<String> permissions;

  String get displayName {
    if (name != null && name!.trim().isNotEmpty) return name!.trim();
    final full = '${firstName ?? ''} ${lastName ?? ''}'.trim();
    if (full.isNotEmpty) return full;
    return email.split('@').first;
  }

  String get initials {
    final src = displayName;
    final parts = src.split(RegExp(r'\s+')).where((e) => e.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    final letters = parts.take(2).map((p) => p[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }

  UserBranchDto? get primaryBranch =>
      branches.where((b) => b.isPrimary).firstOrNull ??
      (branches.isNotEmpty ? branches.first : null);

  factory UserDto.fromJson(Map<String, dynamic> j) {
    return UserDto(
      id: j['id']?.toString() ?? '',
      email: j['email']?.toString() ?? '',
      name: j['name']?.toString(),
      firstName: j['first_name']?.toString(),
      lastName: j['last_name']?.toString(),
      phone: j['phone']?.toString(),
      role: j['role']?.toString(),
      avatar: j['avatar']?.toString(),
      status: j['status']?.toString(),
      locale: j['locale']?.toString(),
      companyId: j['company_id']?.toString(),
      branchId: j['branch_id']?.toString(),
      lastLoginAt: _date(j['last_login_at']),
      createdAt: _date(j['created_at']),
      roles: (j['roles'] is List)
          ? (j['roles'] as List)
              .whereType<Map>()
              .map((m) => UserRoleDto.fromJson(
                  m.map((k, v) => MapEntry(k.toString(), v))))
              .toList()
          : const [],
      branches: (j['branches'] is List)
          ? (j['branches'] as List)
              .whereType<Map>()
              .map((m) => UserBranchDto.fromJson(
                  m.map((k, v) => MapEntry(k.toString(), v))))
              .toList()
          : const [],
      permissions: (j['permissions'] is List)
          ? (j['permissions'] as List).map((e) => e.toString()).toList()
          : const [],
    );
  }
}

class UserRoleDto {
  const UserRoleDto(
      {required this.id, required this.code, required this.name});
  final String id;
  final String code;
  final String name;
  factory UserRoleDto.fromJson(Map<String, dynamic> j) => UserRoleDto(
        id: j['id']?.toString() ?? '',
        code: j['code']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
      );
}

class UserBranchDto {
  const UserBranchDto({
    required this.id,
    required this.name,
    this.code,
    this.isPrimary = false,
  });
  final String id;
  final String name;
  final String? code;
  final bool isPrimary;
  factory UserBranchDto.fromJson(Map<String, dynamic> j) => UserBranchDto(
        id: j['id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        code: j['code']?.toString(),
        isPrimary: j['is_primary'] == true,
      );
}

DateTime? _date(dynamic v) {
  if (v == null) return null;
  return DateTime.tryParse(v.toString());
}

/// Mapping lisible des codes de rôles. Aligne mobile sur ce qu'un admin
/// voit en français côté backoffice.
const Map<String, String> kRoleFr = {
  'ADMIN': 'Administrateur',
  'DIRECTEUR': 'Directeur',
  'GESTIONNAIRE_FLOTTE': 'Gestionnaire de flotte',
  'AGENT_COMMERCIAL': 'Agent commercial',
  'COMPTABLE': 'Comptable',
  'MECANICIEN': 'Mécanicien',
  'ANALYSTE_CREDIT': 'Analyste crédit',
  'CLIENT_PORTAL': 'Portail client',
};

String roleFr(String? code) => code == null
    ? '—'
    : (kRoleFr[code.toUpperCase()] ?? code);
