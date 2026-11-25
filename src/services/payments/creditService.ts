/**
 * Credit Management Service (MongoDB + Express API)
 * Handles all credit-related operations: checking balance, deducting credits, tracking usage
 */

import { apiRequest } from '../../lib/api';
import { toast } from 'react-toastify';

export interface CreditBalance {
    balance: number;
    total_earned: number;
    total_spent: number;
}

export interface CreditUsage {
    feature_type: string;
    feature_id?: string;
    credits_used: number;
    created_at: string;
    platform?: string;
}

const CREDITS_PER_GENERATION = 2;

/**
 * Profit-safe credit pricing per activity (protects 50%–85%+ margin even on Enterprise $0.096/credit floor).
 */
export const CREDIT_COSTS = {
    DESIGN_PER_VARIATION: 2, // 2 credits × variations (1=2, 2=4, 3=6, 4=8)
    AI_IMAGE: 2,             // 2 credits per generated AI image
    AI_EDIT: 2,              // 2 credits per AI image edit
    AI_UPSCALE: 2,           // 2 credits per AI image upscale
    RESIZE_PER_SIZE: 1,      // 1 credit per resized image (single or batch)
    EXTRACT_FACES: 1,        // 1 credit per face extraction
    ANALYZE_VIDEO: 1,        // 1 credit per video analysis
    REPURPOSE_BASE: 3,       // 3 credits for up to 5 viral clips
    REPURPOSE_LARGE: 5,      // 5 credits for 6+ viral clips
    AI_VIDEO: 10,            // 10 credits per AI video generation
} as const;

export async function getUserCredits(userId: string, forceRefresh: boolean = true): Promise<CreditBalance | null> {
    try {
        if (!forceRefresh && typeof window !== 'undefined') {
            const cached = localStorage.getItem(`credits_${userId}`);
            if (cached) {
                try {
                    const parsed = JSON.parse(cached);
                    if (parsed.lastUpdated && Date.now() - parsed.lastUpdated < 30000) {
                        getUserCredits(userId, true).catch(() => {});
                        return {
                            balance: parsed.balance,
                            total_earned: parsed.total_earned,
                            total_spent: parsed.total_spent,
                        };
                    }
                } catch {
                    // Invalid cache
                }
            }
        }

        const data = await apiRequest<CreditBalance>('/api/credits');

        if (typeof window !== 'undefined' && data) {
            localStorage.setItem(
                `credits_${userId}`,
                JSON.stringify({
                    ...data,
                    lastUpdated: Date.now(),
                })
            );
        }

        return data;
    } catch (error) {
        console.error('Exception fetching user credits:', error);
        return null;
    }
}

export async function hasEnoughCredits(
    userId: string,
    creditsNeeded: number = CREDITS_PER_GENERATION
): Promise<boolean> {
    const balance = await getUserCredits(userId);
    if (!balance) return false;
    return balance.balance >= creditsNeeded;
}

export async function deductCredits(
    userId: string,
    feature: string,
    credits: number = CREDITS_PER_GENERATION,
    metadata?: Record<string, any>
): Promise<boolean> {
    try {
        const hasCredits = await hasEnoughCredits(userId, credits);
        if (!hasCredits) {
            toast.error(
                `Insufficient credits. You need ${credits} credits to ${feature}. Please purchase credits to continue.`
            );
            return false;
        }

        const data = await apiRequest<{ success: boolean; error?: string }>('/api/credits/deduct', {
            method: 'POST',
            body: JSON.stringify({
                feature,
                amount: credits,
                metadata: metadata || {},
            }),
        });

        if (!data.success) {
            toast.error(data.error || 'Insufficient credits');
            return false;
        }

        return true;
    } catch (error: any) {
        console.error('Exception deducting credits:', error);
        toast.error(error?.message || 'An error occurred while processing credits.');
        return false;
    }
}

export async function addCredits(
    _userId: string,
    credits: number,
    description: string,
    referenceId: string,
    metadata?: Record<string, any>
): Promise<boolean> {
    try {
        const data = await apiRequest<{ success: boolean }>('/api/credits/add', {
            method: 'POST',
            body: JSON.stringify({
                amount: credits,
                description,
                referenceId,
                metadata: metadata || {},
            }),
        });
        return Boolean(data.success);
    } catch (error) {
        console.error('Exception adding credits:', error);
        return false;
    }
}

export async function getCreditUsageBreakdown(_userId: string, limit: number = 10): Promise<CreditUsage[]> {
    try {
        const data = await apiRequest<CreditUsage[]>(`/api/credits/usage?limit=${encodeURIComponent(limit)}`);
        return data || [];
    } catch (error) {
        console.error('Exception fetching credit usage:', error);
        return [];
    }
}

export async function getCreditTransactions(_userId: string, limit: number = 20) {
    try {
        const data = await apiRequest<any[]>(`/api/credits/transactions?limit=${encodeURIComponent(limit)}`);
        return data || [];
    } catch (error) {
        console.error('Exception fetching transactions:', error);
        return [];
    }
}

export async function getPaymentHistory(_userId: string, limit: number = 20) {
    try {
        const data = await apiRequest<any[]>(`/api/payments/history?limit=${encodeURIComponent(limit)}`);
        return data || [];
    } catch (error) {
        console.error('Exception fetching payment history:', error);
        return [];
    }
}

export { CREDITS_PER_GENERATION };
