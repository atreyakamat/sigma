import { describe, expect, it } from 'vitest';
import { DICTIONARIES, translate, useI18n } from '../i18n';

describe('i18n', () => {
  it('has every key in every locale and falls back to English', () => {
    const keys = Object.keys(DICTIONARIES.en);
    for (const locale of Object.keys(DICTIONARIES) as (keyof typeof DICTIONARIES)[]) {
      for (const k of keys)
        expect(
          DICTIONARIES[locale][k as keyof typeof DICTIONARIES.en],
          `${locale}.${k}`,
        ).toBeTruthy();
    }
    expect(translate('hi', 'auth.signIn')).toBe('साइन इन');
    expect(translate('en', 'auth.signIn')).toBe('Sign in');
  });
  it('persists the chosen locale', () => {
    useI18n.getState().setLocale('hi');
    expect(useI18n.getState().locale).toBe('hi');
    expect(localStorage.getItem('sigma:locale')).toBe('hi');
    useI18n.getState().setLocale('en');
  });
});
