/** Structured data for search engines and AI answer engines. Escaping "<" keeps the payload from closing the script tag. */
import { headers } from "next/headers";
export async function JsonLd({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const nonce = (await headers()).get("x-nonce") || undefined;
  return <script nonce={nonce} type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}
