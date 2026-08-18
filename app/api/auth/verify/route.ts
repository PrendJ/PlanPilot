import { NextResponse } from "next/server";
import { hashToken } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token"); if (!token) return NextResponse.redirect(new URL("/login?verified=invalid", request.url));
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(token) } }); if (!record || record.expiresAt < new Date()) return NextResponse.redirect(new URL("/login?verified=invalid", request.url));
  await prisma.$transaction([prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }), prisma.verificationToken.deleteMany({ where: { userId: record.userId } })]);
  return NextResponse.redirect(new URL("/login?verified=1", request.url));
}
