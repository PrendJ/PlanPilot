import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { canAccessWorkspace, getCurrentUser, twoFactorRequiredButMissing } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Topbar } from "@/components/Topbar";
import { Board } from "@/components/Board";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const workspace = await prisma.workspace.findUnique({ where: { slug }, select: { name: true } });
  return { title: workspace?.name || "Board", robots: { index: false } };
}

export default async function WorkspacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/app/${slug}`)}`);
  if (await twoFactorRequiredButMissing(user)) redirect("/account?require2fa=1#security");
  const workspace = await prisma.workspace.findUnique({ where: { slug }, select: { id: true, lifecycleStatus: true } });
  if (!workspace || workspace.lifecycleStatus !== "ACTIVE" || !(await canAccessWorkspace(user.id, workspace.id))) notFound();
  return (
    <div className="shell">
      <Topbar />
      <main id="main">
        <Suspense>
          <Board slug={slug} />
        </Suspense>
      </main>
    </div>
  );
}
