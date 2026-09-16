import type { AuthUser } from "@/lib/auth";
import { canManage } from "@/lib/auth";

/**
 * SEO permissions map onto the existing role model.
 * There is no separate RBAC table in NoteCode.
 *
 * SEO_VIEW          -> any authenticated staff user
 * SEO_MANAGE        -> ADMIN | MANAGER (link projects, trigger sync)
 * SEO_INTEGRATIONS  -> ADMIN (Google OAuth connect / disconnect)
 * SEO_REPORTS       -> same as VIEW in P0
 * SEO_ADMIN         -> ADMIN
 */
export function canViewSeo(user: AuthUser | null | undefined): user is AuthUser {
  return Boolean(user);
}

export function canManageSeo(user: AuthUser | null | undefined) {
  return Boolean(user && canManage(user));
}

export function canManageSeoIntegrations(user: AuthUser | null | undefined) {
  return user?.role === "ADMIN";
}

export function canAdminSeo(user: AuthUser | null | undefined) {
  return user?.role === "ADMIN";
}
