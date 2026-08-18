import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://js.stripe.com; connect-src 'self' https://openrouter.ai https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ] }];
  },
};

export default nextConfig;
