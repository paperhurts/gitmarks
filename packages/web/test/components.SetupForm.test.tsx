import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SetupForm } from "../src/components/SetupForm.js";
import { loadSettings } from "../src/lib/settings.js";

import type { ValidateResult } from "../src/lib/client.js";

type ValidateFn = (s: any) => Promise<ValidateResult>;

function renderForm(validate: ValidateFn) {
  return render(
    <MemoryRouter>
      <SetupForm validate={validate} />
    </MemoryRouter>,
  );
}

describe("SetupForm", () => {
  beforeEach(() => localStorage.clear());

  it("disables Save until Validate succeeds", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "ok-with-files" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "ghp_fake");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");

    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /validate/i }));
    expect(await screen.findByText(/valid PAT/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("shows auth-failed error when validate returns auth-failed", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "auth-failed" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "bad");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");
    await user.click(screen.getByRole("button", { name: /validate/i }));

    expect(await screen.findByText(/invalid token/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
  });

  it("persists settings to localStorage on Save", async () => {
    const user = userEvent.setup();
    const validate = vi.fn().mockResolvedValue({ status: "ok-with-files" });
    renderForm(validate);

    await user.type(screen.getByLabelText(/token/i), "ghp_fake");
    await user.type(screen.getByLabelText(/owner/i), "paperhurts");
    await user.type(screen.getByLabelText(/^repo$/i), "bookmarks");
    await user.click(screen.getByRole("button", { name: /validate/i }));
    await screen.findByText(/valid PAT/i);
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(loadSettings()).toEqual({
      token: "ghp_fake",
      owner: "paperhurts",
      repo: "bookmarks",
      branch: "main",
    });
  });
});
