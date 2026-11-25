/**
 * Stripe Payment Service (Express + MongoDB API)
 * Handles Stripe Checkout session creation and payment processing
 */

import { loadStripe, Stripe } from '@stripe/stripe-js';
import { apiRequest, getAuthToken } from '../../lib/api';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
    if (!stripePromise) {
        const publishableKey =
            import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ||
            import.meta.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
            (import.meta.env as any).STRIPE_PUBLISHABLE_KEY;

        if (!publishableKey) {
            console.error('Stripe publishable key not found in environment variables');
            return Promise.resolve(null);
        }
        stripePromise = loadStripe(publishableKey);
    }
    return stripePromise;
}

export async function redirectToCheckout(priceId: string): Promise<void> {
    try {
        if (!getAuthToken()) {
            throw new Error('Please sign in to purchase credits');
        }

        const data = await apiRequest<{ sessionId?: string; url?: string }>('/api/stripe/create-checkout-session', {
            method: 'POST',
            body: JSON.stringify({ priceId }),
        });

        if (data.url) {
            window.location.href = data.url;
        } else if (data.sessionId) {
            window.location.href = `https://checkout.stripe.com/c/pay/${data.sessionId}`;
        } else {
            throw new Error('Invalid response from checkout server. No session ID or URL provided.');
        }
    } catch (error: any) {
        console.error('Error redirecting to checkout:', error);
        throw error;
    }
}

export async function getCreditPackByPriceId(priceId: string) {
    try {
        return await apiRequest(`/api/credit-packs/${encodeURIComponent(priceId)}`);
    } catch (error) {
        console.error('Exception fetching credit pack:', error);
        return null;
    }
}
