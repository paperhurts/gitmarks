import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { RequireSettings } from "../src/App.js";
import { SetupPage } from "../src/routes/SetupPage.js";

describe("App", () => {
  it("renders the gitmarks heading", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route element={<RequireSettings />}>
            <Route path="/" element={<div>Home</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole("heading", { name: /gitmarks/i })).toBeInTheDocument();
  });
});
