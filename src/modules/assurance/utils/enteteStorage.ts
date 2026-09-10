import { EnteteConfig, defaultEnteteConfig } from '../types';

// Printing helpers read the active host configuration. Persistence belongs to
// Reception's ticketSettings, not a second localStorage business database.
let currentConfig = defaultEnteteConfig;
export function setCurrentEnteteConfig(config: EnteteConfig): void { currentConfig = config; }
export function getStoredEnteteConfig(): EnteteConfig { return currentConfig; }
export function saveStoredEnteteConfig(config: EnteteConfig): void { currentConfig = config; }
export function resetStoredEnteteConfig(): EnteteConfig { return defaultEnteteConfig; }

/** One-time, non-destructive import of the previous workstation preference. */
export function readLegacyEnteteConfig(): EnteteConfig | null {
  try {
    const raw = localStorage.getItem('suivi_assurance_entete_config');
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value && typeof value.etablissement === 'string' ? { ...defaultEnteteConfig, ...value } : null;
  } catch { return null; }
}
