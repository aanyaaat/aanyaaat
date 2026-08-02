import { useEffect } from 'react';
import type { AccentSeed, AppearanceSettings, ThemeMode } from '@/domain/types';

/** Accent palettes for Material You-style dynamic theming. */
const ACCENTS: Record<AccentSeed, Record<string, string>> = {
  blue: {
    '--accent-50': '237 246 252',
    '--accent-100': '214 234 250',
    '--accent-200': '180 214 248',
    '--accent-300': '124 186 240',
    '--accent-400': '72 150 224',
    '--accent-500': '40 120 200',
    '--accent-600': '32 98 176',
    '--accent-700': '30 78 148',
    '--accent-800': '30 64 120',
    '--accent-900': '28 54 96',
    '--accent-950': '20 34 64',
  },
  green: {
    '--accent-50': '240 250 244',
    '--accent-100': '220 244 230',
    '--accent-200': '188 236 208',
    '--accent-300': '140 220 178',
    '--accent-400': '92 196 144',
    '--accent-500': '60 168 112',
    '--accent-600': '44 138 92',
    '--accent-700': '38 110 76',
    '--accent-800': '34 88 64',
    '--accent-900': '30 72 54',
    '--accent-950': '14 44 34',
  },
  teal: {
    '--accent-50': '238 252 251',
    '--accent-100': '206 248 245',
    '--accent-200': '160 238 234',
    '--accent-300': '104 220 214',
    '--accent-400': '52 194 190',
    '--accent-500': '26 168 164',
    '--accent-600': '18 134 132',
    '--accent-700': '20 108 108',
    '--accent-800': '24 86 88',
    '--accent-900': '24 72 74',
    '--accent-950': '8 40 42',
  },
  amber: {
    '--accent-50': '254 250 238',
    '--accent-100': '254 242 200',
    '--accent-200': '253 230 140',
    '--accent-300': '252 211 80',
    '--accent-400': '251 189 32',
    '--accent-500': '240 158 12',
    '--accent-600': '212 119 8',
    '--accent-700': '176 83 10',
    '--accent-800': '144 64 14',
    '--accent-900': '118 53 15',
    '--accent-950': '68 26 4',
  },
  rose: {
    '--accent-50': '252 244 247',
    '--accent-100': '248 232 239',
    '--accent-200': '247 200 216',
    '--accent-300': '233 165 181',
    '--accent-400': '181 131 141',
    '--accent-500': '181 131 141',
    '--accent-600': '165 110 122',
    '--accent-700': '140 88 98',
    '--accent-800': '112 70 80',
    '--accent-900': '90 56 66',
    '--accent-950': '60 36 44',
  },
  violet: {
    '--accent-50': '246 244 254',
    '--accent-100': '238 234 252',
    '--accent-200': '224 214 248',
    '--accent-300': '198 182 240',
    '--accent-400': '168 140 228',
    '--accent-500': '142 110 208',
    '--accent-600': '126 84 188',
    '--accent-700': '110 66 168',
    '--accent-800': '92 52 140',
    '--accent-900': '78 44 116',
    '--accent-950': '48 24 76',
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
