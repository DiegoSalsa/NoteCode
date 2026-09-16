import { describe, expect, it } from "vitest";
import { createOauthState, verifyOauthState } from "@/lib/seo/google-oauth";

describe("seo oauth state", () => {
  it("signs and verifies a state bound to the user", () => {
    const state = createOauthState("user-42");
    const parsed = verifyOauthState(state);
    expect(parsed?.userId).toBe("user-42");
    expect(parsed?.nonce).toBeTruthy();
  });

  it("rejects tampered or empty state", () => {
    const state = createOauthState("user-42");
    expect(verifyOauthState(state.slice(0, -2) + "ff")).toBeNull();
    expect(verifyOauthState("")).toBeNull();
    expect(verifyOauthState("not-a-token")).toBeNull();
  });

  it("rejects a state minted for another user when compared by caller", () => {
    const state = createOauthState("user-42");
    const parsed = verifyOauthState(state);
    expect(parsed?.userId === "user-99").toBe(false);
  });
});
