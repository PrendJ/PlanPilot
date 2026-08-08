import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function requireAdmin() {
  const user = await getCurrentUser();
  return user?.isAdmin ? user : null;
}

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const users = await prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: {
      id: true, email: true, name: true, isAdmin: true, canCreateWorkspaces: true,
      memberships: { select: { role: true, workspace: { select: { id: true, name: true, slug: true } } } },
    },
  });
  const workspaces = await prisma.workspace.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, slug: true } });
  return NextResponse.json({ users, workspaces });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const name = String(body.name || "").trim();
  const password = String(body.password || "");
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Email non valida" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nome richiesto" }, { status: 400 });
  if (password.length < 10) return NextResponse.json({ error: "La password deve avere almeno 10 caratteri" }, { status: 400 });
  try {
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: await bcrypt.hash(password, 12),
        isAdmin: Boolean(body.isAdmin),
        canCreateWorkspaces: Boolean(body.canCreateWorkspaces) || Boolean(body.isAdmin),
      },
      select: { id: true, email: true, name: true, isAdmin: true, canCreateWorkspaces: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create user";
    return NextResponse.json({ error: message.includes("Unique constraint") ? "Esiste già un utente con questa email" : message }, { status: 400 });
  }
}
