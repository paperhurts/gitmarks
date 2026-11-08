import { describe, it, expect, vi, beforeEach } from "vitest";
import { TagInput } from "../src/lib/tag-input.js";

function key(el: HTMLElement, k: string) {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}
function type(input: HTMLInputElement, text: string) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
const chips = (ti: TagInput) =>
  Array.from(ti.box.querySelectorAll(".chip > span")).map((s) => s.textContent);

describe("TagInput", () => {
  let container: HTMLDivElement;
  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("Enter commits typed text as a cleaned, canonicalized chip", () => {
    const ti = new TagInput({ container, canonicalize: (t) => (t.toLowerCase() === "rust" ? "Rust" : t) });
    type(ti.input, "  rust ");
    key(ti.input, "Enter");
    expect(ti.tags).toEqual(["Rust"]);
    expect(chips(ti)).toEqual(["Rust"]);
    expect(ti.input.value).toBe("");
  });

  it("Enter on an empty box submits instead", () => {
    const onSubmit = vi.fn();
    const ti = new TagInput({ container, onSubmit });
    key(ti.input, "Enter");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(ti.tags).toEqual([]);
  });

  it("comma commits, and duplicates are ignored case-insensitively", () => {
    const ti = new TagInput({ container });
    type(ti.input, "dev,");
    type(ti.input, "DEV,");
    expect(ti.tags).toEqual(["dev"]);
  });

  it("Backspace on empty removes the last chip; × removes a specific one", () => {
    const ti = new TagInput({ container });
    ti.setTags(["a", "b", "c"]);
    key(ti.input, "Backspace");
    expect(ti.tags).toEqual(["a", "b"]);
    (ti.box.querySelector('[aria-label="Remove tag a"]') as HTMLButtonElement).click();
    expect(ti.tags).toEqual(["b"]);
  });

  it("commitPending picks up text typed but not yet committed", () => {
    const ti = new TagInput({ container });
    ti.input.value = "x, y";
    ti.commitPending();
    expect(ti.tags).toEqual(["x", "y"]);
  });

  it("renders suggestions from the provider and clicking one adds it", () => {
    const getSuggestions = vi.fn((selected: readonly string[], q: string) =>
      ["docs", "dev"].filter((t) => !selected.includes(t) && t.includes(q)),
    );
    const ti = new TagInput({ container, getSuggestions });
    const btns = () => Array.from(ti.suggestRow.querySelectorAll("button")).map((b) => b.textContent);
    expect(btns()).toEqual(["docs", "dev"]);
    type(ti.input, "do");
    expect(btns()).toEqual(["docs"]);
    (ti.suggestRow.querySelector("button") as HTMLButtonElement).click();
    expect(ti.tags).toEqual(["docs"]);
    expect(btns()).toEqual(["dev"]);
  });

  it("never puts tag text into innerHTML and only applies valid colors", () => {
    const ti = new TagInput({
      container,
      colorFor: (t) => (t === "good" ? "#22d3ee" : "red;background:url(x)"),
    });
    ti.setTags(["good", "<img src=x onerror=alert(1)>"]);
    expect(container.querySelector("img")).toBeNull();
    const [good, evil] = Array.from(ti.box.querySelectorAll<HTMLElement>(".chip"));
    expect(good!.style.getPropertyValue("--tag")).toBe("#22d3ee");
    expect(evil!.style.getPropertyValue("--tag")).toBe("");
  });

  it("notifies onChange with the current set", () => {
    const onChange = vi.fn();
    const ti = new TagInput({ container, onChange });
    ti.setTags(["a"]);
    expect(onChange).toHaveBeenLastCalledWith(["a"]);
  });
});
