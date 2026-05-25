import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagsFile } from "@gitmarks/core";
import { TagManager } from "../src/components/TagManager.js";

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: "open every morning" },
    "to-read": { color: "#FFFF00", description: null },
  },
};

describe("TagManager", () => {
  it("lists existing tags", () => {
    render(<TagManager tagsFile={tagsFile} onMutate={vi.fn()} />);
    expect(screen.getByDisplayValue("daily")).toBeInTheDocument();
    expect(screen.getByDisplayValue("to-read")).toBeInTheDocument();
  });

  it("calls onMutate with a renaming mutator when the name input is committed", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const input = screen.getByDisplayValue("daily");
    await user.clear(input);
    await user.type(input, "morning");
    await user.tab();
    expect(onMutate).toHaveBeenCalledOnce();
    const mutator = onMutate.mock.calls[0]![0];
    const next = mutator(tagsFile);
    expect(next.tags["morning"]).toBeDefined();
    expect(next.tags["daily"]).toBeUndefined();
  });

  it("calls onMutate with a color mutator when the color input changes", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const colorInput = screen.getByLabelText(/color for daily/i) as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: "#123456" } });
    expect(onMutate).toHaveBeenCalled();
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["daily"]?.color).toBe("#123456");
  });

  it("calls onMutate with a delete mutator when the delete button is clicked", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    await user.click(screen.getByRole("button", { name: /delete daily/i }));
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["daily"]).toBeUndefined();
  });

  it("adds a new tag through the new-tag row", async () => {
    const onMutate = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    await user.type(screen.getByLabelText(/new tag name/i), "reference");
    await user.click(screen.getByRole("button", { name: /add tag/i }));
    const mutator = onMutate.mock.calls[0]![0];
    expect(mutator(tagsFile).tags["reference"]).toEqual({ color: "#22d3ee", description: null });
  });

  it("surfaces a validation error inline without calling onMutate", async () => {
    const onMutate = vi.fn();
    const user = userEvent.setup();
    render(<TagManager tagsFile={tagsFile} onMutate={onMutate} />);
    const input = screen.getByDisplayValue("daily");
    await user.clear(input);
    await user.type(input, "to-read");
    await user.tab();
    expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    expect(onMutate).not.toHaveBeenCalled();
  });
});
