import { mediaPreview, type MediaKind, type MediaStore } from "./media";

/** Short-post media: thumbnails / audio bars under the text (published after the text, in this order). */
export class Tray {
  private ids: string[] = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly store: MediaStore,
    private readonly removeLabel: string,
    private readonly onChange: () => void,
  ) {}

  add(ids: string[]): void {
    this.ids.push(...ids);
    this.render();
  }

  /** Removes and returns every entry (switching to an article moves them into the editor). */
  take(): string[] {
    const ids = this.ids;
    this.ids = [];
    this.render();
    return ids;
  }

  list(): readonly string[] {
    return this.ids;
  }

  count(kind: MediaKind): number {
    return this.ids.filter((id) => this.store.get(id)?.kind === kind).length;
  }

  private render(): void {
    this.el.replaceChildren(
      ...this.ids.map((id) =>
        mediaPreview(this.store.get(id), this.removeLabel, () => {
          this.ids = this.ids.filter((x) => x !== id);
          this.render();
          this.onChange();
        }),
      ),
    );
    this.el.hidden = this.ids.length === 0;
  }
}
