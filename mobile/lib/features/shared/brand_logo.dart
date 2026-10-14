import 'package:flutter/material.dart';

import '../../core/config/app_config.dart';

/// Logo d'une marque automobile, servi depuis `/brands/<slug>.png` sur
/// l'host de l'app (nginx sert `/var/www/driveflow/frontend/public/brands/`).
/// Pendant mobile de `BrandLogo.tsx` + `brandLogoUrl.ts` du web — mêmes
/// alias, même catalogue, même repli (initiales en cercle gris quand la
/// marque n'a pas de fichier ou que le chargement échoue).
class BrandLogo extends StatefulWidget {
  const BrandLogo({
    super.key,
    required this.brand,
    this.size = 28,
    this.uploadedUrl,
  });

  final String? brand;

  /// Logo téléversé par l'agence (prioritaire sur le logo livré). Peut
  /// être une URL absolue ou un chemin relatif à l'host (`/files/...`).
  final String? uploadedUrl;

  final double size;

  @override
  State<BrandLogo> createState() => _BrandLogoState();
}

class _BrandLogoState extends State<BrandLogo> {
  bool _failed = false;

  @override
  Widget build(BuildContext context) {
    final url = _resolveUrl();
    final initials =
        (widget.brand ?? '?').trim().isEmpty ? '?' : (widget.brand ?? '?').trim();
    final fallback = Container(
      width: widget.size,
      height: widget.size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: const Color(0xFFF1F5F9),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        initials.length <= 2 ? initials.toUpperCase() : initials.substring(0, 2).toUpperCase(),
        style: TextStyle(
          fontSize: widget.size * 0.38,
          fontWeight: FontWeight.w900,
          color: const Color(0xFF64748B),
        ),
      ),
    );
    if (url == null || _failed) return fallback;
    return SizedBox(
      width: widget.size,
      height: widget.size,
      child: Image.network(
        url,
        fit: BoxFit.contain,
        errorBuilder: (_, __, ___) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && !_failed) setState(() => _failed = true);
          });
          return fallback;
        },
      ),
    );
  }

  String? _resolveUrl() {
    final uploaded = widget.uploadedUrl?.trim();
    if (uploaded != null && uploaded.isNotEmpty) {
      if (uploaded.startsWith('http')) return uploaded;
      return '${_apiHost()}$uploaded';
    }
    final slugUrl = brandLogoUrl(widget.brand);
    if (slugUrl == null) return null;
    return '${_apiHost()}$slugUrl';
  }

  static String _apiHost() {
    return AppConfig.apiBaseUrl
        .replaceAll(RegExp(r'/api(/v\d+)?/?$'), '');
  }
}

/// Fichiers présents dans `public/brands/` (sans l'extension). Mirror du
/// `AVAILABLE` web (`frontend/modules/shared/brandLogo.ts`).
const Set<String> _kAvailableBrandSlugs = {
  'abarth', 'alfa-romeo', 'audi', 'bmw', 'chery', 'chevrolet', 'chrysler',
  'citroen', 'cupra', 'dacia', 'daihatsu', 'dfsk', 'dodge', 'ds', 'fiat',
  'ford', 'foton', 'gaz', 'honda', 'hummer', 'hyundai', 'isuzu', 'jaguar',
  'jeep', 'kia', 'lancia', 'land-rover', 'lexus', 'mahindra', 'maserati',
  'mazda', 'mercedes', 'mini', 'mitsubishi', 'nissan', 'opel', 'peugeot',
  'porsche', 'renault', 'seat', 'skoda', 'ssangyong', 'subaru', 'suzuki',
  'tesla', 'toyota', 'volkswagen', 'volvo',
};

/// Ce que les gens tapent → le fichier correspondant.
const Map<String, String> _kBrandAliases = {
  'mercedes-benz': 'mercedes',
  'mercedesbenz': 'mercedes',
  'mb': 'mercedes',
  'vw': 'volkswagen',
  'volks-wagen': 'volkswagen',
  'landrover': 'land-rover',
  'range-rover': 'land-rover',
  'rangerover': 'land-rover',
  'alfaromeo': 'alfa-romeo',
  'alfa': 'alfa-romeo',
  'ds-automobiles': 'ds',
  'citroën': 'citroen',
  'škoda': 'skoda',
  'ssang-yong': 'ssangyong',
  'byd': '',
};

/// URL relative du logo (`/brands/<slug>.png`) ou `null` si la marque
/// n'en a pas.
String? brandLogoUrl(String? brand) {
  if (brand == null || brand.trim().isEmpty) return null;
  final slug = _slugify(brand);
  if (slug.isEmpty) return null;
  final resolved = _kBrandAliases[slug] ?? slug;
  if (resolved.isEmpty) return null;
  if (_kAvailableBrandSlugs.contains(resolved)) {
    return '/brands/$resolved.png';
  }
  // « Mercedes Classe C » : la marque est parfois collée au modèle.
  final firstWord = resolved.split('-').first;
  if (_kAvailableBrandSlugs.contains(firstWord)) {
    return '/brands/$firstWord.png';
  }
  return null;
}

String _slugify(String brand) {
  final noAccents =
      brand.toLowerCase().replaceAll(RegExp('[àáâãäå]'), 'a')
          .replaceAll(RegExp('[èéêë]'), 'e')
          .replaceAll(RegExp('[ìíîï]'), 'i')
          .replaceAll(RegExp('[òóôõö]'), 'o')
          .replaceAll(RegExp('[ùúûü]'), 'u')
          .replaceAll('ç', 'c')
          .replaceAll('ñ', 'n');
  return noAccents
      .replaceAll(RegExp(r'[^a-z0-9]+'), '-')
      .replaceAll(RegExp(r'^-+|-+$'), '');
}
