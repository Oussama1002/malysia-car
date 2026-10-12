import 'package:flutter/material.dart';

/// Thème « White & Gold » — clair par défaut, avec une variante sombre
/// noir + or. Les accents or, les rayons et la taille des boutons sont
/// partagés pour une sensation homogène et luxueuse.
class AppTheme {
  // Palette champagne gold, alignée sur le design system web (index.css).
  static const Color _gold = Color(0xFFC9A24B); // brand-500
  static const Color _goldDeep = Color(0xFF9A7B2E); // brand-600
  static const Color _goldLight = Color(0xFFE3C77C); // brand-300
  static const Color _bronze = Color(0xFFB08D57); // accent
  static const Color _ink = Color(0xFF1F1A12); // texte espresso
  static const Color _inkOnGold = Color(0xFF2A2111);

  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    const ivory = Color(0xFFF8F5EE);
    final scheme = ColorScheme.fromSeed(
      seedColor: _gold,
      brightness: Brightness.light,
    ).copyWith(
      primary: _gold,
      onPrimary: _inkOnGold,
      secondary: _bronze,
      onSecondary: Colors.white,
      surface: Colors.white,
      onSurface: _ink,
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: ivory,
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.white,
        foregroundColor: _ink,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0x14503D16)),
        ),
      ),
      dividerColor: const Color(0x14503D16),
      inputDecorationTheme: InputDecorationTheme(
        border: const OutlineInputBorder(),
        filled: true,
        fillColor: Colors.white,
        focusedBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: _goldDeep, width: 1.6),
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _gold,
          foregroundColor: _inkOnGold,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: _goldDeep,
        foregroundColor: Colors.white,
      ),
    );
  }

  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    const surface = Color(0xFF16130D);
    const surfaceAlt = Color(0xFF0C0A07);
    final scheme = ColorScheme.fromSeed(
      seedColor: _gold,
      brightness: Brightness.dark,
    ).copyWith(
      primary: _goldLight,
      onPrimary: _inkOnGold,
      secondary: _bronze,
      surface: surface,
      onSurface: Colors.white.withOpacity(0.92),
    );
    return base.copyWith(
      colorScheme: scheme,
      scaffoldBackgroundColor: surfaceAlt,
      canvasColor: surface,
      cardColor: surface,
      dialogBackgroundColor: surface,
      dividerColor: const Color(0x1FC9A24B),
      appBarTheme: const AppBarTheme(
        backgroundColor: surface,
        foregroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: const BorderSide(color: Color(0x1FC9A24B)),
        ),
      ),
      bottomSheetTheme: const BottomSheetThemeData(backgroundColor: surface),
      drawerTheme: const DrawerThemeData(backgroundColor: surfaceAlt),
      inputDecorationTheme: InputDecorationTheme(
        border: const OutlineInputBorder(),
        filled: true,
        fillColor: surface,
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.55)),
        focusedBorder: OutlineInputBorder(
          borderSide: const BorderSide(color: _goldLight, width: 1.6),
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: _goldLight,
          foregroundColor: _inkOnGold,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
          textStyle: const TextStyle(fontWeight: FontWeight.w800),
        ),
      ),
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: _goldLight,
        foregroundColor: _inkOnGold,
      ),
    );
  }
}
