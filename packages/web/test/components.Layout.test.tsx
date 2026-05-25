import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("renders nav links for List and Tags", () => {
    rendered();
    expect(screen.getByRole("link", { name: /list/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /tags/i })).toHaveAttribute("href", "/tags");
  });

  it("shows the status pill", () => {
    rendered();
    expect(screen.getByText(/synced 12s ago/i)).toBeInTheDocument();
  });
});
