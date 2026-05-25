import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";
import { saveSettings } from "../src/lib/settings.js";

describe("App routing", () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
  });

  it("redirects to /setup when no settings are stored", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /set up gitmarks/i })).toBeInTheDocument();
  });

  it("renders the list page when settings are present", () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    render(<App />);
    expect(screen.getByTestId("list-page")).toBeInTheDocument();
  });

  it("navigates to /tags via the nav link", async () => {
    saveSettings({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
    window.location.hash = "#/tags";
    render(<App />);
    expect(screen.getByTestId("tags-page")).toBeInTheDocument();
  });
});
