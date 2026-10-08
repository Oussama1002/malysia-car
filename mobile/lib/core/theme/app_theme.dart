import 'package:flutter/material.dart';

/// Themes clair + sombre pour que l'icone dark_mode du top bar bascule
/// reellement l'ensemble de l'app. Les accents (indigo), les rayons et
/// la taille des boutons sont partages pour une sensation homogene.
class AppTheme {
  static ThemeData light() {
    final base = ThemeData.light(useMaterial3: true);
    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF4F46E5),
        brightness: Brightness.light,
      ),
      scaffoldBackgroundColor: const Color(0xFFF8FAFC),
      inputDecorationTheme: const InputDecorationTheme(
        border: OutlineInputBorder(),
        filled: true,
        fillColor: Colors.white,
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }

  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);
    const surface = Color(0xFF1E293B);
    const surfaceAlt = Color(0xFF0F172A);
    return base.copyWith(
      colorScheme: ColorScheme.fromSeed(
        seedColor: const Color(0xFF818CF8),
        brightness: Brightness.dark,
      ).copyWith(
        surface: surface,
        onSurface: Colors.white.withOpacity(0.92),
      ),
      scaffoldBackgroundColor: surfaceAlt,
      canvasColor: surface,
      cardColor: surface,
      dialogBackgroundColor: surface,
      dividerColor: Colors.white.withOpacity(0.08),
      cardTheme: const CardTheme(color: surface, elevation: 0),
      bottomSheetTheme: const BottomSheetThemeData(backgroundColor: surface),
      drawerTheme: const DrawerThemeData(backgroundColor: surfaceAlt),
      inputDecorationTheme: InputDecorationTheme(
        border: const OutlineInputBorder(),
        filled: true,
        fillColor: surface,
        hintStyle: TextStyle(color: Colors.white.withOpacity(0.55)),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }
}
