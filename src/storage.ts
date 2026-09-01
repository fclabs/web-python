import { STARTER_PROGRAM } from './starter';

/** localStorage key holding the exact editor contents (Data & Interfaces). */
export const PROGRAM_KEY = 'pyplay.program.v1';

/** The subset of the Storage API this module needs. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Returns the origin's localStorage, or null when it is unreachable
 * (disabled, blocked by a privacy setting, or throwing on access).
 */
export function getLocalStorage(): StorageLike | null {
  try {
    const store = globalThis.localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

/**
 * FR-003 / FR-004: restore the persisted program byte-for-byte, falling back
 * to the starter program when the key is absent or unreadable.
 */
export function loadProgram(storage: StorageLike | null): string {
  if (!storage) return STARTER_PROGRAM;
  try {
    const value = storage.getItem(PROGRAM_KEY);
    return typeof value === 'string' ? value : STARTER_PROGRAM;
  } catch {
    return STARTER_PROGRAM;
  }
}

/**
 * FR-002 / FR-005: persist the program. Returns false when the write was
 * rejected (quota exceeded, private browsing, storage disabled).
 */
export function saveProgram(storage: StorageLike | null, code: string): boolean {
  if (!storage) return false;
  try {
    storage.setItem(PROGRAM_KEY, code);
    return true;
  } catch {
    return false;
  }
}
