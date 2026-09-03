import { STARTER_PROGRAM } from './starter';

/** A deliberately small, flat browser-local project for classroom exercises. */
export const WORKSPACE_KEY = 'pyplay.workspace.v1';
export const LEGACY_PROGRAM_KEY = 'pyplay.program.v1';
export const WORKSPACE_VERSION = 1;
export const WORKSPACE_MAX_BYTES = 2_000_000;
export const MAX_FILENAME_BYTES = 255;
export const MAIN_FILE = 'main.py';
export const STARTER_MAIN = STARTER_PROGRAM;

export interface WorkspaceFile {
  name: string;
  bytes: Uint8Array;
}

export interface WorkspaceSnapshot {
  activeFile: string | null;
  files: WorkspaceFile[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface PersistedWorkspace {
  version: number;
  activeFile: string | null;
  files: Array<{ name: string; dataBase64: string }>;
}

export function getWorkspaceStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function validateFileName(name: string): string | null {
  if (name.length === 0 || name === '.' || name === '..') return 'Enter a file name.';
  if (/[\\/\0]/.test(name)) return 'Files must stay at the workspace root.';
  if (new TextEncoder().encode(name).length > MAX_FILENAME_BYTES) return 'File name is too long.';
  return null;
}

export function isText(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export function encodeText(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function copy(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

function base64Encode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64Decode(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export class Workspace {
  private readonly entries = new Map<string, Uint8Array>();
  private currentActive: string | null;

  constructor(snapshot: WorkspaceSnapshot) {
    for (const file of snapshot.files) this.entries.set(file.name, copy(file.bytes));
    this.currentActive = snapshot.activeFile && this.entries.has(snapshot.activeFile)
      ? snapshot.activeFile
      : this.firstName();
  }

  static starter(): Workspace {
    return new Workspace({
      activeFile: MAIN_FILE,
      files: [{ name: MAIN_FILE, bytes: encodeText(STARTER_MAIN) }],
    });
  }

  get activeFile(): string | null {
    return this.currentActive;
  }

  get totalBytes(): number {
    let total = 0;
    for (const bytes of this.entries.values()) total += bytes.length;
    return total;
  }

  names(): string[] {
    return [...this.entries.keys()].sort((left, right) => {
      if (left === MAIN_FILE) return -1;
      if (right === MAIN_FILE) return 1;
      return left.localeCompare(right);
    });
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  get(name: string): Uint8Array | null {
    const bytes = this.entries.get(name);
    return bytes ? copy(bytes) : null;
  }

  select(name: string | null): void {
    this.currentActive = name !== null && this.entries.has(name) ? name : this.firstName();
  }

  put(name: string, bytes: Uint8Array): string | null {
    const invalid = validateFileName(name);
    if (invalid) return invalid;
    const previous = this.entries.get(name);
    const nextTotal = this.totalBytes - (previous?.length ?? 0) + bytes.length;
    if (nextTotal > WORKSPACE_MAX_BYTES) return 'Workspace is full (max 2 MB).';
    this.entries.set(name, copy(bytes));
    if (this.currentActive === null) this.currentActive = name;
    return null;
  }

  remove(name: string): void {
    this.entries.delete(name);
    if (this.currentActive === name) this.currentActive = this.firstName();
  }

  rename(from: string, to: string): string | null {
    const bytes = this.entries.get(from);
    if (!bytes) return 'File no longer exists.';
    const invalid = validateFileName(to);
    if (invalid) return invalid;
    if (from !== to && this.entries.has(to)) return 'A file with that name already exists.';
    this.entries.delete(from);
    this.entries.set(to, bytes);
    if (this.currentActive === from) this.currentActive = to;
    return null;
  }

  reset(): void {
    this.entries.clear();
    this.entries.set(MAIN_FILE, encodeText(STARTER_MAIN));
    this.currentActive = MAIN_FILE;
  }

  /** Replace files from the worker's authoritative post-run snapshot. */
  replaceFiles(files: WorkspaceFile[]): string | null {
    const next = new Map<string, Uint8Array>();
    let total = 0;
    for (const file of files) {
      const invalid = validateFileName(file.name);
      if (invalid || next.has(file.name)) return invalid ?? 'Duplicate file name.';
      total += file.bytes.length;
      if (total > WORKSPACE_MAX_BYTES) return 'Workspace is full (max 2 MB).';
      next.set(file.name, copy(file.bytes));
    }
    this.entries.clear();
    for (const [name, bytes] of next) this.entries.set(name, bytes);
    if (this.currentActive === null || !this.entries.has(this.currentActive)) this.currentActive = this.firstName();
    return null;
  }

  snapshot(): WorkspaceSnapshot {
    return {
      activeFile: this.currentActive,
      files: this.names().map((name) => ({ name, bytes: copy(this.entries.get(name)!) })),
    };
  }

  private firstName(): string | null {
    return this.names()[0] ?? null;
  }
}

export function serializeWorkspace(workspace: Workspace): string {
  const snapshot = workspace.snapshot();
  const stored: PersistedWorkspace = {
    version: WORKSPACE_VERSION,
    activeFile: snapshot.activeFile,
    files: snapshot.files.map((file) => ({ name: file.name, dataBase64: base64Encode(file.bytes) })),
  };
  return JSON.stringify(stored);
}

function parseWorkspace(raw: string): Workspace | null {
  try {
    const value = JSON.parse(raw) as PersistedWorkspace;
    if (value.version !== WORKSPACE_VERSION || !Array.isArray(value.files)) return null;
    const seen = new Set<string>();
    const files: WorkspaceFile[] = [];
    let total = 0;
    for (const item of value.files) {
      if (!item || typeof item.name !== 'string' || typeof item.dataBase64 !== 'string') return null;
      if (validateFileName(item.name) !== null || seen.has(item.name)) return null;
      const bytes = base64Decode(item.dataBase64);
      total += bytes.length;
      if (total > WORKSPACE_MAX_BYTES) return null;
      seen.add(item.name);
      files.push({ name: item.name, bytes });
    }
    return new Workspace({ activeFile: typeof value.activeFile === 'string' ? value.activeFile : null, files });
  } catch {
    return null;
  }
}

export function loadWorkspace(storage: StorageLike | null): Workspace {
  if (!storage) return Workspace.starter();
  try {
    const stored = storage.getItem(WORKSPACE_KEY);
    if (stored !== null) return parseWorkspace(stored) ?? Workspace.starter();
    const legacy = storage.getItem(LEGACY_PROGRAM_KEY);
    if (legacy === null) return Workspace.starter();
    const migrated = new Workspace({
      activeFile: MAIN_FILE,
      files: [{ name: MAIN_FILE, bytes: encodeText(legacy) }],
    });
    storage.setItem(WORKSPACE_KEY, serializeWorkspace(migrated));
    storage.removeItem(LEGACY_PROGRAM_KEY);
    return migrated;
  } catch {
    return Workspace.starter();
  }
}

export function saveWorkspace(storage: StorageLike | null, workspace: Workspace): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WORKSPACE_KEY, serializeWorkspace(workspace));
    return true;
  } catch {
    return false;
  }
}
