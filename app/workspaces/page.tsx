import { redirect } from "next/navigation";

/** Boards now live on the single home page. Kept for old links and bookmarks. */
export default function WorkspacesPage() {
  redirect("/app");
}
