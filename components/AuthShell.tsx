import Link from "next/link";
import { Brand } from "./Brand";
import { PublicFooter } from "./PublicFooter";

/** Layout shared by sign-in, sign-up, recovery and invite pages. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="shell auth-shell">
      <main id="main" className="auth-page">
        <div className="auth-card">
          <Link href="/" aria-label="BoardCue">
            <Brand />
          </Link>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
          {children}
          {footer && <div className="auth-alt">{footer}</div>}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
