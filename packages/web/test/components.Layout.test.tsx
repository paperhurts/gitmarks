import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Layout } from "../src/components/Layout.js";

function rendered(initial = "/") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Layout
        status={{ kind: "ok", message: "synced 12s ago" }}
        onRefresh={() => {}}
        refreshing={false}
      >
        <div data-testid="outlet">content</div>
      </Layout>
    </MemoryRouter>,
  );
}

describe("Layout", () => {
  it("renders the children", () => {
    rendered();
    expect(screen.getByTestId("outlet")).toBeInTheDocument();
  });

  it("renders nav links for List, Tags, and Trash", () => {
    rendered();
    expect(screen.getByRole("link", { name: /list/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /tags/i })).toHaveAttribute("href", "/tags");
    expect(screen.getByRole("link", { name: /trash/i })).toHaveAttribute("href", "/trash");
  });

  it("shows the status pill", () => {
    rendered();
    expect(screen.getByText(/synced 12s ago/i)).toBeInTheDocument();
  });

  it("renders an Export button when onExport is provided and invokes it", async () => {
    const onExport = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <Layout
          status={{ kind: "ok", message: "synced" }}
          onRefresh={() => {}}
          onExport={onExport}
          refreshing={false}
        >
          <div />
        </Layout>
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /export/i }));
    expect(onExport).toHaveBeenCalled();
  });
});
