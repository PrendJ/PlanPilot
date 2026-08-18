import Stripe from "stripe";
export function stripe(){const key=process.env.STRIPE_SECRET_KEY;if(!key)throw new Error("Billing is not configured");return new Stripe(key)}
export const PRICE_ENV={SOLO:"STRIPE_PRICE_SOLO",TEAM:"STRIPE_PRICE_TEAM",STUDIO:"STRIPE_PRICE_STUDIO"} as const;
