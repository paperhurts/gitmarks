import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// Simulate the copy bundled in the extension: settings come from the
// extension's storage, never from localStorage or the PAT form.
const ext = vi.hoisted(() => ({
  settings: null as null | { token: string; owner: string; repo: string; branch: string },
  openOptions: vi.fn(),
}));
vi.mock("../src/lib/settings.js", async (orig) => ({
  ...(await orig<typeof import("../src/lib/settings.js")>()),
  isExtensionPage: () => true,
  loadExtensionSettings: async () => ext.settings,
  openExtensionOptions: ext.openOptions,
}));

const { RequireSettings } = await import("../src/App.js");
const { SetupPage } = await import("../src/routes/SetupPage.js");

function AppRoutes({ initialPath = "/" }: { initialPath?: string }) {
  return (
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route element={<RequireSettings />}>
          <Route path="/" element={<div data-testid="list-page">list</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("App routing inside the extension", () => {
  beforeEach(() => {
    localStorage.clear();
    ext.settings = null;
    ext.openOptions.mockClear();
  });

  it("uses the extension's settings — no second setup", async () => {
    ext.settings = { token: "ghp_x", owner: "kid", repo: "bookmarks", branch: "main" };
    render(<AppRoutes />);
    expect(await screen.findByTestId("list-page")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /set up gitmarks/i })).toBeNull();
  });

  it("when the extension isn't set up, points to its settings instead of the PAT form", async () => {
    render(<AppRoutes />);
    const btn = await screen.findByRole("button", { name: /open gitmarks settings/i });
    expect(screen.queryByLabelText("token")).toBeNull();
    btn.click();
    expect(ext.openOptions).toHaveBeenCalledTimes(1);
  });

  it("/setup shows the notice, not the PAT form", () => {
    render(<AppRoutes initialPath="/setup" />);
    expect(screen.getByTestId("extension-setup-notice")).toBeInTheDocument();
    expect(screen.queryByLabelText("token")).toBeNull();
  });
});
