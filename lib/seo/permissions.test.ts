import { describe, expect, it } from "vitest";
import type { AuthUser } from "@/lib/auth";
import { canAdminSeo, canManageSeo, canManageSeoIntegrations, canViewSeo } from "@/lib/seo/permissions";

function user(role: string): AuthUser {
  return { id: "u1", email: "a@purocode.com", name: "A", age: null, passwordHash: null, role };
}

describe("seo permissions", () => {
  it("lets any authenticated user view SEO", () => {
    expect(canViewSeo(user("MEMBER"))).toBe(true);
    expect(canViewSeo(user("FINANCE"))).toBe(true);
    expect(canViewSeo(null)).toBe(false);
  });

  it("limits manage to ADMIN and MANAGER", () => {
    expect(canManageSeo(user("ADMIN"))).toBe(true);
    expect(canManageSeo(user("MANAGER"))).toBe(true);
    expect(canManageSeo(user("FINANCE"))).toBe(false);
    expect(canManageSeo(user("MEMBER"))).toBe(false);
  });

  it("limits Google OAuth to ADMIN", () => {
    expect(canManageSeoIntegrations(user("ADMIN"))).toBe(true);
    expect(canManageSeoIntegrations(user("MANAGER"))).toBe(false);
    expect(canAdminSeo(user("ADMIN"))).toBe(true);
  });
});
