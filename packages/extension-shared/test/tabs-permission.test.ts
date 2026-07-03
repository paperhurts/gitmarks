import { describe, it, expect } from "vitest";
import { chromeStub } from "./setup.js";
import { requestTabsPermission } from "../src/lib/tabs-permission.js";

describe("requestTabsPermission", () => {
  it("issues permissions.request synchronously within the caller's stack (gesture preservation, #68)", () => {
    chromeStub.permissions.request.mockReturnValue(Promise.resolve(true));

    void requestTabsPermission();

    // Firefox rejects permissions.request() once the user-input gesture is
    // lost, and any await before the call loses it — so the request must
    // already have been issued by the time requestTabsPermission returns,
    // not on a later microtask.
    expect(chromeStub.permissions.request).toHaveBeenCalledTimes(1);
    expect(chromeStub.permissions.request).toHaveBeenCalledWith({ permissions: ["tabs"] });
  });

  it("resolves granted:true when the user grants", async () => {
    chromeStub.permissions.request.mockResolvedValue(true);

    await expect(requestTabsPermission()).resolves.toEqual({ granted: true });
  });

  it("resolves granted:false with no error when the user declines", async () => {
    chromeStub.permissions.request.mockResolvedValue(false);

    await expect(requestTabsPermission()).resolves.toEqual({ granted: false, error: null });
  });

  it("converts a request() rejection into a result instead of rejecting (silent-failure guard, #68)", async () => {
    chromeStub.permissions.request.mockRejectedValue(
      new Error("permissions.request may only be called from a user input handler"),
    );

    await expect(requestTabsPermission()).resolves.toEqual({
      granted: false,
      error: "permissions.request may only be called from a user input handler",
    });
  });

  it("converts a synchronous request() throw into a result instead of throwing", async () => {
    chromeStub.permissions.request.mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(requestTabsPermission()).resolves.toEqual({ granted: false, error: "boom" });
  });
});
