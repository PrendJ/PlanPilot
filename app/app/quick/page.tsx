import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * PWA shortcut "Quick voice update": starts capture on the cross-board assistant home.
 */
export default async function QuickCapture() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/app/quick");
  redirect("/app?quick=1");
}
