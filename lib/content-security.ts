export function contentSecurityPolicy(nonce: string, production: boolean) {
  return `default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self' https://checkout.stripe.com; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${production ? "" : " 'unsafe-eval'"} https://js.stripe.com; connect-src 'self' https://openrouter.ai https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://checkout.stripe.com`;
}
