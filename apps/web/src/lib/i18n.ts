import { create } from 'zustand';

export type Locale = 'en' | 'hi';

const en = {
  'app.name': 'SIGMA',
  'nav.workspaces': 'Workspaces',
  'nav.users': 'Users',
  'nav.audit': 'Audit log',
  'nav.ai': 'AI providers',
  'nav.security': 'Security',
  'nav.tokens': 'API tokens',
  'nav.changePassword': 'Change password',
  'nav.signOut': 'Sign out',
  'nav.language': 'Language',
  'auth.signIn': 'Sign in',
  'auth.signInSubtitle': 'Sign in to your workspace',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.signingIn': 'Signing in…',
  'auth.accountsByAdmin':
    'Accounts are created by an administrator. Ask yours for an invitation password.',
  'auth.twoFactorTitle': 'Two-factor authentication',
  'auth.twoFactorHint': 'Enter the 6-digit code from your authenticator app, or a recovery code.',
  'auth.code': 'Code',
  'auth.verify': 'Verify',
  'workspaces.title': 'Workspaces',
  'workspaces.subtitle': 'A workspace holds projects and the people who can work on them.',
  'workspaces.new': 'New workspace',
  'workspaces.empty': 'No workspaces yet. Create one, or ask a workspace owner to add you.',
  'common.create': 'Create',
  'common.cancel': 'Cancel',
  'common.name': 'Name',
  'common.loading': 'Loading…',
} as const;
export type TranslationKey = keyof typeof en;

const hi: Record<TranslationKey, string> = {
  'app.name': 'SIGMA',
  'nav.workspaces': 'वर्कस्पेस',
  'nav.users': 'उपयोगकर्ता',
  'nav.audit': 'ऑडिट लॉग',
  'nav.ai': 'AI प्रदाता',
  'nav.security': 'सुरक्षा',
  'nav.tokens': 'API टोकन',
  'nav.changePassword': 'पासवर्ड बदलें',
  'nav.signOut': 'साइन आउट',
  'nav.language': 'भाषा',
  'auth.signIn': 'साइन इन',
  'auth.signInSubtitle': 'अपने वर्कस्पेस में साइन इन करें',
  'auth.email': 'ईमेल',
  'auth.password': 'पासवर्ड',
  'auth.signingIn': 'साइन इन हो रहा है…',
  'auth.accountsByAdmin': 'खाते प्रशासक द्वारा बनाए जाते हैं। निमंत्रण पासवर्ड के लिए उनसे पूछें।',
  'auth.twoFactorTitle': 'दो-चरणीय प्रमाणीकरण',
  'auth.twoFactorHint': 'अपने ऑथेंटिकेटर ऐप का 6 अंकों का कोड या रिकवरी कोड दर्ज करें।',
  'auth.code': 'कोड',
  'auth.verify': 'सत्यापित करें',
  'workspaces.title': 'वर्कस्पेस',
  'workspaces.subtitle': 'एक वर्कस्पेस में प्रोजेक्ट और उन पर काम करने वाले लोग होते हैं।',
  'workspaces.new': 'नया वर्कस्पेस',
  'workspaces.empty': 'अभी कोई वर्कस्पेस नहीं। एक बनाएँ या किसी स्वामी से जुड़ने के लिए कहें।',
  'common.create': 'बनाएँ',
  'common.cancel': 'रद्द करें',
  'common.name': 'नाम',
  'common.loading': 'लोड हो रहा है…',
};

export const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { en, hi };
export const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'हिन्दी' },
];

const KEY = 'sigma:locale';
function initial(): Locale {
  try {
    const stored = localStorage.getItem(KEY) as Locale | null;
    if (stored && stored in DICTIONARIES) return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'en';
  return nav in DICTIONARIES ? (nav as Locale) : 'en';
}

interface I18nState {
  locale: Locale;
  setLocale(l: Locale): void;
}
export const useI18n = create<I18nState>((set) => ({
  locale: initial(),
  setLocale: (locale) => {
    try {
      localStorage.setItem(KEY, locale);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = locale;
    set({ locale });
  },
}));

export function translate(
  locale: Locale,
  key: TranslationKey,
  vars?: Record<string, string | number>,
): string {
  let text = DICTIONARIES[locale][key] ?? en[key] ?? key;
  for (const [k, v] of Object.entries(vars ?? {})) text = text.replace(`{${k}}`, String(v));
  return text;
}

/** Hook returning the translator for the active locale. */
export function useT(): (key: TranslationKey, vars?: Record<string, string | number>) => string {
  const locale = useI18n((s) => s.locale);
  return (key, vars) => translate(locale, key, vars);
}
