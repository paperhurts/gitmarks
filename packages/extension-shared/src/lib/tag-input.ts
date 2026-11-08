import { normalizeTag, mergeTags } from "@gitmarks/core";

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export interface TagInputOptions {
  /** Element the chip box + suggestion row are appended to. */
  container: HTMLElement;
  /** Ranked suggestions for the current selection and typed text. */
  getSuggestions?: (selected: readonly string[], query: string) => string[];
  /** Map a cleaned tag onto an existing spelling (e.g. "rust" -> "Rust"). */
  canonicalize?: (tag: string) => string;
  /** Raw `tags.json` color for a tag, if any. Validated before use. */
  colorFor?: (tag: string) => string | undefined;
  /** Enter pressed with nothing typed — the popup treats this as "save". */
  onSubmit?: () => void;
  onChange?: (tags: readonly string[]) => void;
}

/**
 * Chip-style tag entry for the popup. Enter or comma commits the typed text as
 * a chip; Enter on an empty box submits; Backspace on an empty box removes the
 * last chip. All DOM is built with createElement/textContent — tag names are
 * user data synced from GitHub and never touch innerHTML (AMO, issue #75).
 */
export class TagInput {
  readonly box: HTMLDivElement;
  readonly input: HTMLInputElement;
  readonly suggestRow: HTMLDivElement;
  private selected: string[] = [];
  private readonly opts: TagInputOptions;

  constructor(opts: TagInputOptions) {
    this.opts = opts;
    const doc = opts.container.ownerDocument;

    this.box = doc.createElement("div");
    this.box.className = "tagbox";
    this.input = doc.createElement("input");
    this.input.type = "text";
    this.input.placeholder = "add tags…";
    this.input.setAttribute("aria-label", "Tags");
    this.input.autocomplete = "off";
    this.input.spellcheck = false;
    this.box.appendChild(this.input);
    // Clicking anywhere in the box focuses the text field.
    this.box.addEventListener("click", (e) => {
      if (e.target === this.box) this.input.focus();
    });

    this.suggestRow = doc.createElement("div");
    this.suggestRow.className = "suggest";

    opts.container.appendChild(this.box);
    opts.container.appendChild(this.suggestRow);

    this.input.addEventListener("keydown", (e) => this.onKeyDown(e));
    this.input.addEventListener("input", () => {
      if (this.input.value.includes(",")) {
        this.commitPending();
      } else {
        this.renderSuggestions();
      }
    });
    this.renderSuggestions();
  }

  get tags(): readonly string[] {
    return this.selected;
  }

  /** Replace the chip set (e.g. prefill an already-saved bookmark's tags). */
  setTags(tags: readonly string[]): void {
    this.selected = mergeTags(
      tags.map((t) => normalizeTag(t)).filter((t): t is string => t != null),
      [],
    );
    this.render();
  }

  /** Commit whatever is typed (comma-separated) as chips. Safe to call before save. */
  commitPending(): void {
    const parts = this.input.value.split(",");
    this.input.value = "";
    let added: string[] = [];
    for (const part of parts) {
      const cleaned = normalizeTag(part);
      if (cleaned == null) continue;
      added.push(this.opts.canonicalize?.(cleaned) ?? cleaned);
    }
    added = mergeTags(this.selected, added);
    if (added.length !== this.selected.length) {
      this.selected = added;
      this.render();
    } else {
      this.renderSuggestions();
    }
  }

  add(tag: string): void {
    this.input.value = tag;
    this.commitPending();
    this.input.focus();
  }

  remove(tag: string): void {
    const next = this.selected.filter((t) => t !== tag);
    if (next.length === this.selected.length) return;
    this.selected = next;
    this.render();
  }

  /** Re-rank suggestions (call once remote data has loaded). */
  refresh(): void {
    this.render();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.key === "Enter") {
      e.preventDefault();
      if (this.input.value.trim() === "") {
        this.opts.onSubmit?.();
      } else {
        this.commitPending();
      }
    } else if (e.key === "Backspace" && this.input.value === "" && this.selected.length > 0) {
      e.preventDefault();
      this.remove(this.selected[this.selected.length - 1]!);
    }
  }

  private render(): void {
    for (const chip of Array.from(this.box.querySelectorAll(".chip"))) chip.remove();
    const doc = this.box.ownerDocument;
    for (const tag of this.selected) {
      const chip = doc.createElement("span");
      chip.className = "chip";
      this.applyColor(chip, tag);
      const label = doc.createElement("span");
      label.textContent = tag;
      const x = doc.createElement("button");
      x.type = "button";
      x.className = "chip-x";
      x.textContent = "×";
      x.setAttribute("aria-label", `Remove tag ${tag}`);
      x.addEventListener("click", () => {
        this.remove(tag);
        this.input.focus();
      });
      chip.append(label, x);
      this.box.insertBefore(chip, this.input);
    }
    this.renderSuggestions();
    this.opts.onChange?.(this.selected);
  }

  private renderSuggestions(): void {
    this.suggestRow.replaceChildren();
    const list = this.opts.getSuggestions?.(this.selected, this.input.value) ?? [];
    const doc = this.suggestRow.ownerDocument;
    for (const tag of list) {
      const b = doc.createElement("button");
      b.type = "button";
      b.className = "chip ghost";
      this.applyColor(b, tag);
      b.textContent = tag;
      b.title = `Add tag ${tag}`;
      b.addEventListener("click", () => this.add(tag));
      this.suggestRow.appendChild(b);
    }
  }

  private applyColor(el: HTMLElement, tag: string): void {
    const raw = this.opts.colorFor?.(tag);
    // Same guard as the web UI's TagChip: only a strict #RRGGBB reaches style.
    if (raw != null && COLOR_RE.test(raw)) el.style.setProperty("--tag", raw);
  }
}
