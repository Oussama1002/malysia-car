// Stub mobile — jamais appele car kIsWeb est false sur Android/iOS,
// mais Dart doit resoudre l'import conditionnel sur chaque plateforme.
String? readKey(String key) => null;
void writeKey(String key, String value) {}
void deleteKey(String key) {}
