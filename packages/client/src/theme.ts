/**
 * Light or dark. The person can choose Light, Dark or System (the default) in the account
 * menu; System follows the device and changes with it. The result is `data-theme` on
 * <html>, which styles/theme.css reads. index.html sets it once before the first paint.
 */
import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark'];
const KEY = 'edw-theme';
const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null);

export function readThemeChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(choice: ThemeChoice = readThemeChoice()): void {
  const dark = choice === 'dark' || (choice === 'system' && !!query()?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/** Keeps System in step with the device. Call once at start-up. */
export function installThemeWatcher(): void {
  applyTheme();
  query()?.addEventListener?.('change', () => applyTheme());
}

export function useThemeChoice(): [ThemeChoice, (c: ThemeChoice) => void] {
  const [choice, setChoice] = useState<ThemeChoice>(readThemeChoice);
  useEffect(() => {
    try {
      if (choice === 'system') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, choice);
    } catch {
      /* private window: the choice lasts until the page closes */
    }
    applyTheme(choice);
  }, [choice]);
  return [choice, setChoice];
}
