/**
 * Direct Stripe Checkout Service (Express API)
 */

import { getStripe, redirectToCheckout } from './stripeService';

export { getStripe };

export async function redirectToCheckoutDirect(priceId: string): Promise<void> {
    return redirectToCheckout(priceId);
}
