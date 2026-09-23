import { NextResponse } from "next/server";
import { getCurrentSession, hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/email";
import { safeNextPath } from "@/lib/navigation";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const next = safeNextPath(url.searchParams.get("next"), "/app");
  const session = await getCurrentSession();
  const redirect = (verified: "1" | "invalid") => {
    // Already signed in (the usual case now that accounts work before verification): stay in the app.
    if (session) {
      const target = new URL(appUrl(next, request));
      target.searchParams.set("verified", verified);
      return NextResponse.redirect(target);
    }
    const query = new URLSearchParams({ verified });
    if (next !== "/app") query.set("next", next);
    return NextResponse.redirect(appUrl(`/login?${query.toString()}`, request));
  };
  if (!token) return redirect("invalid");
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record || record.expiresAt < new Date()) return redirect("invalid");
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.verificationToken.deleteMany({ where: { userId: record.userId } }),
  ]);
  return redirect("1");
}
