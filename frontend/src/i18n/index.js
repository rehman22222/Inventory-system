import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import ur from "./locales/ur.json";
import hi from "./locales/hi.json";
import bn from "./locales/bn.json";
import ar from "./locales/ar.json";
import ga from "./locales/ga.json";

// Languages offered in the switcher. `native` is shown in the menu.
export const LANGUAGES = [
  { code: "en", label: "English", native: "English", dir: "ltr" },
  { code: "ur", label: "Urdu", native: "اردو", dir: "rtl" },
  { code: "hi", label: "Hindi", native: "हिन्दी", dir: "ltr" },
  { code: "bn", label: "Bengali", native: "বাংলা", dir: "ltr" },
  { code: "ar", label: "Arabic", native: "العربية", dir: "rtl" },
  { code: "ga", label: "Irish", native: "Gaeilge", dir: "ltr" },
];

const RTL_LANGS = ["ur", "ar"];

// Applies text direction + lang to <html> so the choice affects the whole app.
export function applyDirection(lng) {
  const base = (lng || "en").split("-")[0];
  document.documentElement.setAttribute("dir", RTL_LANGS.includes(base) ? "rtl" : "ltr");
  document.documentElement.setAttribute("lang", base);
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      ur: { translation: ur },
      hi: { translation: hi },
      bn: { translation: bn },
      ar: { translation: ar },
      ga: { translation: ga },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "ur", "hi", "bn", "ar", "ga"],
    load: "languageOnly",
    nonExplicitSupportedLngs: true,
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "lang",
    },
    interpolation: { escapeValue: false },
    returnObjects: true,
  });

applyDirection(i18n.language);
i18n.on("languageChanged", applyDirection);

export default i18n;
