"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { languages, translations, type Language } from "./translations";

const STORAGE_KEY = "bth-language";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

type LanguageContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TranslateFn;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

function isLanguage(value: string | null): value is Language {
  return !!value && (languages as string[]).includes(value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en");

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of a client-only preference from localStorage
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, params) => {
      const template = translations[language][key] ?? translations.en[key] ?? key;
      if (!params) return template;
      return Object.entries(params).reduce(
        (result, [paramKey, paramValue]) => result.replaceAll(`{{${paramKey}}}`, String(paramValue)),
        template,
      );
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useTranslation must be used within a LanguageProvider");
  return context;
}
