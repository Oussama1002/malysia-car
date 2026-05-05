import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import fr from '@/locales/fr.json';
import en from '@/locales/en.json';
import ar from '@/locales/ar.json';

void i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: localStorage.getItem('df_lang') ?? 'fr',
  fallbackLng: 'fr',
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: 'fr' | 'en' | 'ar'): void {
  localStorage.setItem('df_lang', lng);
  document.documentElement.lang = lng;
  document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr';
  void i18n.changeLanguage(lng);
}

const initial = (localStorage.getItem('df_lang') ?? 'fr') as 'fr' | 'en' | 'ar';
document.documentElement.lang = initial;
document.documentElement.dir = initial === 'ar' ? 'rtl' : 'ltr';

export default i18n;
