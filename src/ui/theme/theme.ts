import { useEffect } from 'react';
import type { AccentSeed, AppearanceSettings, ThemeMode } from '@/domain/types';

/** Accent palettes for Material You-style dynamic theming. */
const ACCENTS: Record<AccentSeed, Record<string, string>> = {
  blue: {
    '--accent-50': '236 245 255',
    '--accent-100': '214 234 255',
    '--accent-200': '176 216 255',
    '--accent-300': '126 190 255',
    '--accent-400': '72 158 255',
    '--accent-500': '38 128 245',
    '--accent-600': '24 98 220',
    '--accent-700': '26 78 188',
    '--accent-800': '30 64 150',
    '--accent-900': '32 56 122',
    '--accent-950': '21 34 75',
  },
  green: {
    '--accent-50': '237 252 242',
    '--accent-100': '208 248 224',
    '--accent-200': '164 238 196',
    '--accent-300': '112 220 162',
    '--accent-400': '64 196 130',
    '--accent-500': '34 168 104',
    '--accent-600': '24 138 84',
    '--accent-700': '24 110 70',
    '--accent-800': '26 88 58',
    '--accent-900': '24 72 50',
    '--accent-950': '10 44 28',
  },
  teal: {
    '--accent-50': '236 253 252',
    '--accent-100': '204 248 245',
    '--accent-200': '156 237 234',
    '--accent-300': '98 218 214',
    '--accent-400': '46 194 190',
    '--accent-500': '20 168 164',
    '--accent-600': '14 134 132',
    '--accent-700': '16 108 108',
    '--accent-800': '20 86 88',
    '--accent-900': '20 72 74',
    '--accent-950': '4 40 42',
  },
  amber: {
    '--accent-50': '255 251 235',
    '--accent-100': '254 243 199',
    '--accent-200': '253 230 138',
    '--accent-300': '252 211 77',
    '--accent-400': '251 189 30',
    '--accent-500': '245 158 11',
    '--accent-600': '217 119 6',
    '--accent-700': '180 83 9',
    '--accent-800': '146 64 14',
    '--accent-900': '120 53 15',
    '--accent-950': '69 26 3',
  },
  rose: {
    '--accent-50': '255 241 242',
    '--accent-100': '255 228 230',
    '--accent-200': '254 205 211',
    '--accent-300': '253 164 175',
    '--accent-400': '251 113 133',
    '--accent-500': '244 63 94',
    '--accent-600': '225 29 72',
    '--accent-700': '190 18 60',
    '--accent-800': '155 21 56',
    '--accent-900': '131 24 50',
    '--accent-950': '76 5 25',
  },
  violet: {
    '--accent-50': '245 243 255',
    '--accent-100': '237 233 254',
    '--accent-200': '221 214 254',
    '--accent-300': '195 181 253',
    '--accent-400': '167 139 250',
    '--accent-500': '139 92 246',
    '--accent-600': '124 58 237',
    '--accent-700': '109 40 217',
    '--accent-800': '91 33 182',
    '--accent-900': '76 29 149',
    '--accent-950': '46 16 101',
  },
};

const THEME_CLASS: Record<ThemeMode, string> = {
  light: '',
  dark: 'dark',
  amoled: 'amoled',
};

export function applyTheme(appearance: AppearanceSettings): void {
  const root = document.documentElement;
  root.classList.remove('dark', 'amoled', 'high-contrast', 'large-fonts');
  const cls = THEME_CLASS[appearance.theme];
  if (cls) root.classList.add(cls);
  if (appearance.highContrast) root.classList.add('high-contrast');
  if (appearance.largeFonts) root.classList.add('large-fonts');

  const accent = ACCENTS[appearance.accent];
  for (const [k, v] of Object.entries(accent)) {
    root.style.setProperty(k, v);
  }
}

/** React hook that keeps the DOM in sync with appearance settings. */
export function useThemeSync(appearance: AppearanceSettings): void {
  useEffect(() => {
    applyTheme(appearance);
  }, [appearance]);
}
