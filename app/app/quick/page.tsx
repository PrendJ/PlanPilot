import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * PWA shortcut "Quick voice update": opens the most recently updated board with the microphone ready.
 */
export default async function QuickCapture() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/quick");
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id, role: { not: "GUEST" }, workspace: { lifecycleStatus: "ACTIVE" } },
    orderBy: { workspace: { updatedAt: "desc" } },
    select: { workspace: { select: { slug: true } } },
  });
  redirect(membership ? `/app/${membership.workspace.slug}?dictate=1` : "/app");
}
