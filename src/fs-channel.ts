import { MAX_FILENAME_BYTES, WORKSPACE_MAX_BYTES } from './workspace';

export type FsMutation =
  | { kind: 'replace'; name: string; data: Uint8Array }
  | { kind: 'write'; name: string; offset: number; data: Uint8Array }
  | { kind: 'truncate'; name: string; size: number }
  | { kind: 'rename'; name: string; to: string }
  | { kind: 'delete'; name: string };

const HEADER_INTS = 9;
const HEADER_BYTES = HEADER_INTS * Int32Array.BYTES_PER_ELEMENT;
const CONTROL = 0;
const OPERATION = 1;
const NAME_LENGTH = 2;
const TO_LENGTH = 3;
const DATA_LENGTH = 4;
const OFFSET = 5;
const SIZE = 6;
const SEQUENCE = 7;
const STOPPED = 8;
const EMPTY = 0;
const READY = 1;

const OPS = { replace: 1, write: 2, truncate: 3, rename: 4, delete: 5 } as const;
const decoder = new TextDecoder('utf-8', { fatal: true });
const encoder = new TextEncoder();

export const FS_BUFFER_BYTES = HEADER_BYTES + MAX_FILENAME_BYTES * 2 + WORKSPACE_MAX_BYTES;

export function createFsBuffer(): SharedArrayBuffer {
  return new SharedArrayBuffer(FS_BUFFER_BYTES);
}

function views(buffer: SharedArrayBuffer): { header: Int32Array; bytes: Uint8Array } {
  return {
    header: new Int32Array(buffer, 0, HEADER_INTS),
    bytes: new Uint8Array(buffer, HEADER_BYTES),
  };
}

function encodeMutation(mutation: FsMutation): {
  op: number;
  name: Uint8Array;
  to: Uint8Array;
  data: Uint8Array;
  offset: number;
  size: number;
} {
  const name = encoder.encode(mutation.name);
  const to = encoder.encode(mutation.kind === 'rename' ? mutation.to : '');
  const data = mutation.kind === 'replace' || mutation.kind === 'write' ? mutation.data : new Uint8Array();
  return {
    op: OPS[mutation.kind],
    name,
    to,
    data,
    offset: mutation.kind === 'write' ? mutation.offset : 0,
    size: mutation.kind === 'truncate' ? mutation.size : 0,
  };
}

/** Publish one completed FS operation and wait until the page mirrors it. */
export function publishFsMutation(
  buffer: SharedArrayBuffer,
  mutation: FsMutation,
  sequence: number,
  onReady: () => void,
): boolean {
  const { header, bytes } = views(buffer);
  if (Atomics.load(header, STOPPED) === 1) return false;
  const encoded = encodeMutation(mutation);
  const length = encoded.name.length + encoded.to.length + encoded.data.length;
  if (length > bytes.length) throw new Error('Filesystem mutation exceeds the workspace limit.');
  let cursor = 0;
  bytes.set(encoded.name, cursor);
  cursor += encoded.name.length;
  bytes.set(encoded.to, cursor);
  cursor += encoded.to.length;
  bytes.set(encoded.data, cursor);
  Atomics.store(header, OPERATION, encoded.op);
  Atomics.store(header, NAME_LENGTH, encoded.name.length);
  Atomics.store(header, TO_LENGTH, encoded.to.length);
  Atomics.store(header, DATA_LENGTH, encoded.data.length);
  Atomics.store(header, OFFSET, encoded.offset);
  Atomics.store(header, SIZE, encoded.size);
  Atomics.store(header, SEQUENCE, sequence);
  Atomics.store(header, CONTROL, READY);
  Atomics.notify(header, CONTROL);
  onReady();
  Atomics.wait(header, CONTROL, READY);
  return Atomics.load(header, STOPPED) === 0;
}

/** Read and acknowledge the mailbox. Returns null when it is empty. */
export function takeFsMutation(buffer: SharedArrayBuffer): { sequence: number; mutation: FsMutation } | null {
  const { header, bytes } = views(buffer);
  if (Atomics.load(header, CONTROL) !== READY) return null;
  const nameLength = Atomics.load(header, NAME_LENGTH);
  const toLength = Atomics.load(header, TO_LENGTH);
  const dataLength = Atomics.load(header, DATA_LENGTH);
  const total = nameLength + toLength + dataLength;
  if (nameLength < 0 || toLength < 0 || dataLength < 0 || total > bytes.length) {
    Atomics.store(header, CONTROL, EMPTY);
    Atomics.notify(header, CONTROL);
    return null;
  }
  let cursor = 0;
  const name = decoder.decode(bytes.slice(cursor, cursor + nameLength));
  cursor += nameLength;
  const to = decoder.decode(bytes.slice(cursor, cursor + toLength));
  cursor += toLength;
  const data = bytes.slice(cursor, cursor + dataLength);
  const op = Atomics.load(header, OPERATION);
  const sequence = Atomics.load(header, SEQUENCE);
  const offset = Atomics.load(header, OFFSET);
  const size = Atomics.load(header, SIZE);
  let mutation: FsMutation;
  switch (op) {
    case OPS.replace: mutation = { kind: 'replace', name, data }; break;
    case OPS.write: mutation = { kind: 'write', name, offset, data }; break;
    case OPS.truncate: mutation = { kind: 'truncate', name, size }; break;
    case OPS.rename: mutation = { kind: 'rename', name, to }; break;
    case OPS.delete: mutation = { kind: 'delete', name }; break;
    default: {
      Atomics.store(header, CONTROL, EMPTY);
      Atomics.notify(header, CONTROL);
      return null;
    }
  }
  Atomics.store(header, CONTROL, EMPTY);
  Atomics.notify(header, CONTROL);
  return { sequence, mutation };
}

export function stopFsMutations(buffer: SharedArrayBuffer): void {
  const { header } = views(buffer);
  Atomics.store(header, STOPPED, 1);
  Atomics.notify(header, CONTROL);
}
