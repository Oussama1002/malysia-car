import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Retour « intelligent » : si l'écran courant a été poussé (push /
/// MaterialPageRoute), on dépile ; sinon on retourne à la Home via
/// go_router. Les écrans de module (/flotte, /reservations, …) sont
/// atteints par `context.go(...)` qui remplace la pile — un simple
/// `Navigator.maybePop()` ne faisait rien là-dessus, d'où les boutons
/// retour qui semblaient cassés.
void goBackOrHome(BuildContext context) {
  final nav = Navigator.of(context);
  if (nav.canPop()) {
    nav.pop();
  } else {
    context.go('/');
  }
}
