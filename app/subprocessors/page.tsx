import { permanentRedirect } from "next/navigation";
import { getTranslator } from "@/lib/i18n/server";

/** The supplier list now lives in the Privacy Policy; old links keep working. */
export default async function Subprocessors() {
  const { locale } = await getTranslator();
  permanentRedirect(`${locale === "en" ? "/en" : ""}/privacy#fornitori`);
}
