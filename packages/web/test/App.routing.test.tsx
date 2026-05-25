import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireSettings } from "../src/App.js";
import { SetupPage } from "../src/routes/SetupPage.js";
import { saveSettings } from "../src/lib/settings.js";

function AppRoutes({ initialPath = "/" }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route element={<RequireSettings />}>
          <Route path="/" element={<div data-testid="list-page">list</div>} />
          <Route path="/tags" element={<div data-testid="tags-page">tags</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("redirects to /setup when no settings are stored", async () => {
    render(<AppRoutes />);
    expect(await screen.findByRole("heading", { name: /set up gitmarks/i })).toBeInTheDocument();
  });

  it("renders the list page when settings are present", () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    render(<AppRoutes />);
    expect(screen.getByTestId("list-page")).toBeInTheDocument();
  });

  it("navigates to /tags via the nav link", () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    render(<AppRoutes initialPath="/tags" />);
    expect(screen.getByTestId("tags-page")).toBeInTheDocument();
  });
});
