import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { App } from "../src/App.js";

describe("App", () => {
  it("renders the gitmarks heading", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: /gitmarks/i })).toBeInTheDocument();
  });
});
