import type { Grants } from "./store";

/**
 * Cookie banner UI (markup: src/server/share/consent.ts). First layer: Reject all / Accept all /
 * Customize; "Customize" (or "Cookie settings" on the privacy page) opens the category panel and
 * turns the third button into "Save choices".
 */
export type BannerAction = "accept" | "reject" | "save";

export class Banner {
  private readonly panel: HTMLElement;
  private readonly customize: HTMLButtonElement;
  private readonly save: HTMLButtonElement;

  constructor(private readonly root: HTMLElement) {
    this.panel = root.querySelector<HTMLElement>(".ni-consent-p")!;
    this.customize = root.querySelector<HTMLButtonElement>('[data-consent-act="customize"]')!;
    this.save = root.querySelector<HTMLButtonElement>('[data-consent-act="save"]')!;
    this.customize.addEventListener("click", () => this.expand(true));
  }

  /** Categories offered on this page and the version of the request (server data-*). */
  get offered(): string[] {
    return (this.root.dataset.consentCats ?? "").split(" ").filter(Boolean);
  }

  get version(): number {
    return Number(this.root.dataset.consentV) || 1;
  }

  onAction(handler: (action: BannerAction) => void): void {
    for (const act of ["accept", "reject", "save"] as const) {
      this.root.querySelector(`[data-consent-act="${act}"]`)?.addEventListener("click", () => handler(act));
    }
  }

  /** Switch state of the panel (category → on). */
  checked(): Grants {
    const grants: Grants = {};
    for (const box of this.boxes()) grants[box.dataset.consentCat!] = box.checked;
    return grants;
  }

  /**
   * Shows the banner. `detailed` (Cookie settings): the panel opens with the current choices and takes
   * the focus; the automatic first-layer prompt does not move the focus (no button is pre-selected).
   */
  show(grants: Grants, detailed: boolean): void {
    for (const box of this.boxes()) box.checked = !!grants[box.dataset.consentCat!];
    this.expand(detailed);
    this.root.hidden = false;
    if (detailed) this.boxes()[0]?.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  private expand(on: boolean): void {
    const fromButton = document.activeElement === this.customize;
    this.panel.hidden = !on;
    this.customize.hidden = on;
    this.customize.setAttribute("aria-expanded", String(on));
    this.save.hidden = !on;
    if (on && fromButton) this.boxes()[0]?.focus();
  }

  private boxes(): HTMLInputElement[] {
    return [...this.panel.querySelectorAll<HTMLInputElement>("input[data-consent-cat]")];
  }
}
