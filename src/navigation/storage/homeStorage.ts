import type { HomeLocation } from '@/navigation/domain/types';

const HOME_KEY = 'aanyaa.home';

export function getHome(): HomeLocation | null {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeLocation;
    if (
      typeof parsed.latitude === 'number' &&
      typeof parsed.longitude === 'number' &&
      typeof parsed.label === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function setHome(home: HomeLocation): void {
  localStorage.setItem(HOME_KEY, JSON.stringify(home));
}

export function deleteHome(): void {
  localStorage.removeItem(HOME_KEY);
}
