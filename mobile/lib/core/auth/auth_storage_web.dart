// ignore: avoid_web_libraries_in_flutter
import 'dart:html' as html;

String? readKey(String key) => html.window.localStorage[key];
void writeKey(String key, String value) {
  html.window.localStorage[key] = value;
}
void deleteKey(String key) {
  html.window.localStorage.remove(key);
}
