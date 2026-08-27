import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export type PlatformRoleKey = "USER" | "SUPPORT" | "BILLING" | "SUPERADMIN";
export type PlatformCapability = "METADATA" | "SUPPORT" | "BILLING" | "LICENSE" | "LIFECYCLE" | "PLATFORM_ADMIN";

export function platformRoleOf(user: { platformRole?: string | null; isAdmin?: boolean }): PlatformRoleKey {
  if (user.platformRole === "SUPERADMIN" || user.isAdmin) return "SUPERADMIN";
  if (user.platformRole === "SUPPORT" || user.platformRole === "BILLING") return user.platformRole;
  return "USER";
}

export function hasPlatformCapability(user: { platformRole?: string | null; isAdmin?: boolean }, capability: PlatformCapability) {
  const role = platformRoleOf(user);
  if (role === "SUPERADMIN") return true;
  if (capability === "METADATA") return role === "SUPPORT" || role === "BILLING";
  if (capability === "SUPPORT") return role === "SUPPORT";
  if (capability === "BILLING" || capability === "LICENSE") return role === "BILLING";
  return false;
}

export async function requirePlatform(capability: PlatformCapability) {
  const user = await getCurrentUser();
  if (!user || !hasPlatformCapability(user, capability)) return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) } as const;
  return { user } as const;
}
