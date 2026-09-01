/**
 * FR-006 / FR-007: write text to the system clipboard.
 * Returns true on success; false when the write was rejected for any reason
 * (permission denied, insecure context, unsupported API). Never throws.
 */
export async function writeClipboard(text: string): Promise<boolean> {
  try {
    const clipboard = navigator.clipboard;
    if (!clipboard || typeof clipboard.writeText !== 'function') return false;
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
