import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// React Router's hash history listener fires a navigation when window.location.hash
// changes in jsdom. That navigation calls `new Request()` whose AbortSignal is a jsdom
// instance that undici doesn't recognise. Silence that specific rejection so it
// doesn't cause false-positive test failures.
process.on("unhandledRejection", (reason) => {
  if (
    reason instanceof TypeError &&
    typeof reason.message === "string" &&
    reason.message.includes('Expected signal ("AbortSignal') &&
    reason.message.includes("to be an instance of AbortSignal")
  ) {
    return;
  }
  throw reason;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});
