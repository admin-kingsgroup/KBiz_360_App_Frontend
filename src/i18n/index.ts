import { en } from './en';

// i18n groundwork — a typed dictionary + t() lookup, no native dependency.
// Adding a language = add a file like en.ts (e.g. fr.ts for DRC, sw.ts for Kenya/Tanzania)
// and register it in DICTIONARIES. Device-locale detection can later come from
// expo-localization (needs a native build); until then the language is explicit.
//
// Usage:   import { t } from '../i18n';   t('common.retry')
// Interpolation: t('chat.membersCount', { n: 4 }) with "{n} members" in the dictionary.

export type TranslationKey = keyof typeof en;
const DICTIONARIES: Record<string, Record<TranslationKey, string>> = { en };

let current = 'en';
export function setLanguage(lang: string): void {
  if (DICTIONARIES[lang]) current = lang;
}
export function getLanguage(): string {
  return current;
}

export function t(key: TranslationKey, vars?: Record<string, string | number>): string {
  const dict = DICTIONARIES[current] ?? en;
  let out: string = dict[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}
