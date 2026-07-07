"use client";

import { languageLabels, languages } from "./translations";
import { useTranslation } from "./LanguageProvider";

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { language, setLanguage, t } = useTranslation();

  return (
    <label className={`flex items-center gap-2 text-xs font-medium text-stone-500 ${className}`}>
      <span className="sr-only">{t("language.label")}</span>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value as typeof language)}
        className="border border-[#ECDFC8] bg-white px-2 py-1 text-xs font-semibold uppercase tracking-[0.08em] text-stone-700 focus:border-[#b8860b] focus:outline-none"
        aria-label={t("language.label")}
      >
        {languages.map((code) => (
          <option key={code} value={code}>
            {languageLabels[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
