import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/date_symbol_data_local.dart';

import 'core/auth/auth_notifier.dart';
import 'core/theme/app_theme.dart';
import 'core/theme/theme_mode_provider.dart';
import 'features/auth/presentation/login_screen.dart';
import 'features/home/presentation/app_shell.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Charge les données locales FR pour les formats de date et de monnaie.
  await initializeDateFormatting('fr');
  runApp(const ProviderScope(child: DriveFlowApp()));
}

class DriveFlowApp extends ConsumerWidget {
  const DriveFlowApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final themeMode = ref.watch(themeModeProvider);

    return MaterialApp(
      title: 'DriveFlow',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: themeMode,
      locale: const Locale('fr'),
      supportedLocales: const [Locale('fr'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      // Le routing suit l'état d'authentification : un seul interrupteur, deux
      // écrans possibles. Dès qu'on ajoutera plus d'écrans, on passera à
      // go_router avec des routes et des redirections.
      home: switch (auth) {
        AuthReady() => const AppShell(),
        _ => const LoginScreen(),
      },
    );
  }
}
