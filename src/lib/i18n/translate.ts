import { LANGUAGE_STORAGE_KEY, languages, translations, type Language } from "./translations";

function isLanguage(value: string | null): value is Language {
  return !!value && (languages as string[]).includes(value);
}

// Client-only: reads the persisted language preference outside of React,
// for use in plain helper functions (like the shared api() fetch wrapper)
// that run before any component has a chance to provide it via context.
export function getStoredLanguage(): Language {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(stored) ? stored : "en";
}

export function translate(language: Language, key: string, params?: Record<string, string | number>) {
  const template = translations[language][key] ?? translations.en[key] ?? key;
  if (!params) return template;
  return Object.entries(params).reduce(
    (result, [paramKey, paramValue]) => result.replaceAll(`{{${paramKey}}}`, String(paramValue)),
    template,
  );
}
