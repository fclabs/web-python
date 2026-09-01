/** Non-blocking notice strip (FR-005, FR-007, BR-009). */
export class Notices {
  constructor(private readonly host: HTMLElement) {}

  show(text: string, kind: 'info' | 'warn' = 'warn'): void {
    const el = document.createElement('p');
    el.className = `notice notice--${kind}`;
    el.dataset.notice = text;
    el.textContent = text;
    this.host.append(el);
  }

  clear(): void {
    this.host.replaceChildren();
  }
}
