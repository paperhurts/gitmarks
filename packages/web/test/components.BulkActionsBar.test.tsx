import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TagsFile } from "@gitmarks/core";
import { BulkActionsBar } from "../src/components/BulkActionsBar.js";

const tagsFile: TagsFile = {
  version: 1,
  tags: {
    daily: { color: "#00FFFF", description: null },
    reference: { color: "#00FF88", description: null },
  },
};

function noopHandlers() {
  return {
    onAddTag: vi.fn().mockResolvedValue(undefined),
    onRemoveTag: vi.fn().mockResolvedValue(undefined),
    onSetFolder: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn().mockResolvedValue(undefined),
    onClear: vi.fn(),
  };
}

describe("BulkActionsBar", () => {
  it("shows the selection count", () => {
    render(<BulkActionsBar count={3} tagsFile={tagsFile} {...noopHandlers()} />);
    expect(screen.getByText(/3 selected/i)).toBeInTheDocument();
  });

  it("calls onAddTag with the typed tag", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.type(screen.getByLabelText(/add tag/i), "weekly");
    await user.click(screen.getByRole("button", { name: /^add$/i }));
    expect(handlers.onAddTag).toHaveBeenCalledWith("weekly");
  });

  it("calls onRemoveTag with the picked tag", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.selectOptions(screen.getByLabelText(/remove tag/i), "reference");
    await user.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(handlers.onRemoveTag).toHaveBeenCalledWith("reference");
  });

  it("calls onSetFolder with the typed folder", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.type(screen.getByLabelText(/set folder/i), "Archive");
    await user.click(screen.getByRole("button", { name: /^set$/i }));
    expect(handlers.onSetFolder).toHaveBeenCalledWith("Archive");
  });

  it("calls onDelete when Move to trash is clicked", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.click(screen.getByRole("button", { name: /move to trash/i }));
    expect(handlers.onDelete).toHaveBeenCalled();
  });

  it("calls onClear when Clear is clicked", async () => {
    const user = userEvent.setup();
    const handlers = noopHandlers();
    render(<BulkActionsBar count={2} tagsFile={tagsFile} {...handlers} />);
    await user.click(screen.getByRole("button", { name: /^clear$/i }));
    expect(handlers.onClear).toHaveBeenCalled();
  });
});
