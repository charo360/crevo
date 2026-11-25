import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';

import {
    User,
    UserCredits,
    CreditTransaction,
    CreditUsage,
    CreditPack,
    Payment,
    RepurposedVideo,
    ViralClip,
    MLAnalysis,
    RepurposeJob,
    NewsletterSubscriber,
    FreeTrialUsage,
    UserWork,
} from './models.js';
import { signToken, requireAuth } from './authMiddleware.js';
import jwt from 'jsonwebtoken';
import { generateWithOpenRouter } from './openrouter.js';
import {
    sendWelcomeEmail,
    sendAdminNewSignupAlert,
    sendPasswordResetEmail,
    sendPasswordChangedEmail,
    sendPaymentReceiptEmail,
    sendAdminNewSaleAlert,
    sendSubscriptionCancelledEmail,
    sendAdminSubscriptionCancelledAlert,
    sendBonusCreditsEmail,
    sendNewsletterWelcomeEmail,
} from './emailService.js';
import {
    listMailMessages,
    getMailMessage,
    deleteMailMessage,
    sendMailMessage,
} from './mailbuxService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local first (overrides), then .env
dotenv.config({ path: path.join(rootDir, '.env.local') });
dotenv.config({ path: path.join(rootDir, '.env') });

const PORT = Number(process.env.API_PORT || process.env.PORT || 4000);
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'revo3';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey) : null;

const app = express();
app.set('trust proxy', 1);

app.use(
    cors({
        origin: true,
        credentials: true,
    })
);

// Stripe webhook needs raw body before express.json()
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    if (!stripe) {
        return res.status(500).json({ error: 'Stripe is not configured on the server' });
    }

    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;
    try {
        if (webhookSecret && sig) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            event = JSON.parse(req.body.toString('utf8'));
        }
    } catch (err) {
        console.error('Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.metadata?.user_id || session.client_reference_id;
        const credits = Number(session.metadata?.credits || 0);
        const packName = session.metadata?.pack_name || `${credits} Credits`;
        const isSubscription = session.mode === 'subscription' || session.metadata?.billing_mode === 'subscription';

        if (userId && credits > 0) {
            try {
                await UserCredits.findOneAndUpdate(
                    { user_id: userId },
                    { $inc: { balance: credits, total_earned: credits } },
                    { upsert: true, new: true }
                );

                await CreditTransaction.create({
                    user_id: userId,
                    amount: credits,
                    transaction_type: 'purchase',
                    description: isSubscription
                        ? `Subscribed to ${packName} (+${credits} credits)`
                        : `Purchased ${credits} credits (${packName})`,
                    reference_id: session.id,
                    metadata: session.metadata || {},
                });

                await Payment.create({
                    user_id: userId,
                    stripe_session_id: session.id,
                    amount_cents: session.amount_total || 0,
                    credits,
                    credits_purchased: credits,
                    status: 'completed',
                    metadata: { pack_name: packName, mode: isSubscription ? 'subscription' : 'payment' },
                    credit_packs: {
                        name: packName,
                        credits,
                        price_cents: session.amount_total || 0,
                    },
                });

                const customerEmail = session.customer_details?.email || session.customer_email;
                if (customerEmail) {
                    sendPaymentReceiptEmail({
                        toEmail: customerEmail,
                        packName,
                        amountCents: session.amount_total || 0,
                        credits,
                        isSubscription,
                        isRenewal: false,
                    }).catch(() => {});
                    sendAdminNewSaleAlert({
                        customerEmail,
                        packName,
                        amountCents: session.amount_total || 0,
                        credits,
                        isSubscription,
                        isRenewal: false,
                    }).catch(() => {});
                }
            } catch (err) {
                console.error('Failed to process completed checkout session:', err);
            }
        }
    } else if (event.type === 'invoice.paid') {
        const invoice = event.data.object;
        // Only credit monthly renewals (initial checkout is already credited in checkout.session.completed)
        if (invoice.billing_reason === 'subscription_cycle') {
            try {
                const customerEmail = String(invoice.customer_email || '').trim().toLowerCase();
                const priceId = invoice.lines?.data?.[0]?.price?.id || '';
                const user = customerEmail ? await User.findOne({ email: customerEmail }) : null;
                const pack = priceId ? await CreditPack.findOne({ stripe_price_id: priceId }).lean() : null;
                const amountCents = Number(invoice.amount_paid || 0);
                const credits = pack?.credits || (amountCents >= 9000 ? 1000 : amountCents >= 2500 ? 200 : 50);
                const packName = pack?.name || (amountCents >= 9000 ? 'Enterprise Plan' : 'Pro Plan');

                if (user && credits > 0) {
                    const userId = user._id.toString();
                    await UserCredits.findOneAndUpdate(
                        { user_id: userId },
                        { $inc: { balance: credits, total_earned: credits } },
                        { upsert: true, new: true }
                    );
                    await CreditTransaction.create({
                        user_id: userId,
                        amount: credits,
                        transaction_type: 'purchase',
                        description: `Monthly subscription renewal — ${packName} (+${credits} credits)`,
                        reference_id: invoice.id,
                    });
                    await Payment.create({
                        user_id: userId,
                        stripe_session_id: invoice.id,
                        amount_cents: amountCents,
                        credits,
                        credits_purchased: credits,
                        status: 'completed',
                        metadata: { pack_name: packName, mode: 'subscription_renewal' },
                    });

                    sendPaymentReceiptEmail({
                        toEmail: user.email,
                        packName,
                        amountCents,
                        credits,
                        isSubscription: true,
                        isRenewal: true,
                    }).catch(() => {});
                    sendAdminNewSaleAlert({
                        customerEmail: user.email,
                        packName,
                        amountCents,
                        credits,
                        isSubscription: true,
                        isRenewal: true,
                    }).catch(() => {});
                }
            } catch (err) {
                console.error('Failed to process subscription renewal invoice:', err);
            }
        }
    } else if (event.type === 'customer.subscription.deleted') {
        try {
            const sub = event.data.object;
            const customerId = sub.customer;
            let customerEmail = '';
            if (customerId && stripe) {
                const customer = await stripe.customers.retrieve(String(customerId));
                if (customer && !customer.deleted && customer.email) {
                    customerEmail = customer.email;
                }
            }
            const priceId = sub.items?.data?.[0]?.price?.id || '';
            const pack = priceId ? await CreditPack.findOne({ stripe_price_id: priceId }).lean() : null;
            const packName = pack?.name || 'Crevo AI Subscription';

            if (customerEmail) {
                sendSubscriptionCancelledEmail(customerEmail, packName).catch(() => {});
                sendAdminSubscriptionCancelledAlert(customerEmail, packName).catch(() => {});
            }
        } catch (err) {
            console.error('Failed to process subscription cancellation webhook:', err);
        }
    }

    return res.json({ received: true });
});

app.use(express.json({ limit: '25mb' }));

const formatUser = (user) => ({
    id: user._id.toString(),
    email: user.email,
    created_at: user.created_at ? new Date(user.created_at).toISOString() : new Date().toISOString(),
});

// Health check
app.get('/api/health', (_req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    res.json({
        ok: mongoose.connection.readyState === 1,
        database: states[mongoose.connection.readyState] || 'unknown',
    });
});

// ==================== ANTI-ABUSE HELPERS ====================

const DISPOSABLE_EMAIL_DOMAINS = new Set([
    'mailinator.com', 'guerrillamail.com', 'guerrillamailblock.com', 'sharklasers.com',
    'tempmail.com', 'temp-mail.org', 'temp-mail.io', '10minutemail.com', '10minutemail.net',
    'yopmail.com', 'yopmail.fr', 'trashmail.com', 'dispostable.com', 'getnada.com',
    'mohmal.com', 'fakeinbox.com', 'throwawaymail.com', 'maildrop.cc', 'mintemail.com',
    'emailondeck.com', 'burnermail.io', 'grr.la', 'mailnesia.com', 'spamgourmet.com',
]);

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.trim()) {
        return xff.split(',')[0].trim();
    }
    const xReal = req.headers['x-real-ip'];
    if (typeof xReal === 'string' && xReal.trim()) {
        return xReal.trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getClientFingerprint(req) {
    const fp = req.headers['x-client-fp'];
    if (typeof fp !== 'string') return '';
    return fp.trim().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '');
}

function normalizeCanonicalEmail(email) {
    const lower = String(email || '').trim().toLowerCase();
    const parts = lower.split('@');
    if (parts.length !== 2) return lower;
    let [local, domain] = parts;
    if (domain === 'googlemail.com') domain = 'gmail.com';
    // Strip +alias tags (e.g. user+1@gmail.com -> user@gmail.com)
    const plusIdx = local.indexOf('+');
    if (plusIdx !== -1) local = local.slice(0, plusIdx);
    // Gmail ignores dots in the local part
    if (domain === 'gmail.com') {
        local = local.replace(/\./g, '');
    }
    return `${local}@${domain}`;
}

function isDisposableEmail(email) {
    const domain = String(email || '').trim().toLowerCase().split('@')[1] || '';
    return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

// ==================== AUTH ROUTES ====================

app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'Please provide a valid email address.' });
        }
        if (!password || typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const normalizedEmail = email.trim().toLowerCase();
        if (isDisposableEmail(normalizedEmail)) {
            return res.status(400).json({ error: 'Disposable or temporary email addresses are not allowed. Please use a permanent email.' });
        }

        const canonicalEmail = normalizeCanonicalEmail(normalizedEmail);
        const existing = await User.findOne({
            $or: [{ email: normalizedEmail }, { canonicalEmail }],
        });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists. Please sign in instead.' });
        }

        const signupIp = getClientIp(req);
        if (signupIp && signupIp !== 'unknown') {
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const recentIpSignups = await User.countDocuments({
                signupIp,
                created_at: { $gte: thirtyDaysAgo },
            });
            if (recentIpSignups >= 2) {
                return res.status(429).json({
                    error: 'Account creation limit reached for this network. Please sign in to your existing account.',
                });
            }
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            canonicalEmail,
            signupIp,
            passwordHash,
        });

        await UserCredits.create({
            user_id: user._id.toString(),
            balance: 0,
            total_earned: 0,
            total_spent: 0,
        });

        const token = signToken(user);

        // Fire-and-forget Welcome Email to user + New Signup Alert to Admin
        sendWelcomeEmail(normalizedEmail).catch(() => {});
        sendAdminNewSignupAlert(normalizedEmail, signupIp).catch(() => {});

        return res.status(201).json({
            user: formatUser(user),
            token,
        });
    } catch (err) {
        console.error('Signup error:', err);
        if (err.code === 11000) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }
        return res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body || {};
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
        if (!user) {
            return res.status(401).json({ error: 'Invalid login credentials' });
        }

        const valid = await bcrypt.compare(String(password), user.passwordHash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid login credentials' });
        }

        const token = signToken(user);
        return res.json({
            user: formatUser(user),
            token,
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ error: 'Failed to sign in. Please try again.' });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const email = String(req.body?.email || '').trim().toLowerCase();
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: 'Please enter a valid email address.' });
        }

        const canonicalEmail = normalizeCanonicalEmail(email);
        const user = await User.findOne({ $or: [{ email }, { canonicalEmail }] });

        if (user) {
            const rawToken = crypto.randomBytes(32).toString('hex');
            const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
            user.resetPasswordTokenHash = tokenHash;
            user.resetPasswordExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            const baseUrl = (process.env.FRONTEND_URL || 'https://crevo.app').replace(/\/$/, '');
            const resetUrl = `${baseUrl}/reset-password?token=${rawToken}`;
            await sendPasswordResetEmail(user.email, resetUrl);
        }

        return res.json({
            ok: true,
            message: 'If an account exists with that email, a password reset link has been sent.',
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({ error: 'Failed to process password reset request.' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const token = String(req.body?.token || '').trim();
        const password = String(req.body?.password || '');

        if (!token || token.length < 32) {
            return res.status(400).json({ error: 'Invalid or missing password reset token.' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'New password must be at least 6 characters.' });
        }

        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
        const user = await User.findOne({
            resetPasswordTokenHash: tokenHash,
            resetPasswordExpiresAt: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
        }

        user.passwordHash = await bcrypt.hash(password, 10);
        user.resetPasswordTokenHash = null;
        user.resetPasswordExpiresAt = null;
        await user.save();

        sendPasswordChangedEmail(user.email).catch(() => {});

        return res.json({
            ok: true,
            message: 'Password updated successfully! You can now sign in.',
        });
    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({ error: 'Failed to reset password.' });
    }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        return res.json({ user: formatUser(user) });
    } catch (err) {
        console.error('Get current user error:', err);
        return res.status(500).json({ error: 'Failed to fetch user profile' });
    }
});

app.patch('/api/auth/profile', requireAuth, async (req, res) => {
    try {
        const { email, password } = req.body || {};
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (email) {
            const normalizedEmail = String(email).trim().toLowerCase();
            if (!normalizedEmail.includes('@')) {
                return res.status(400).json({ error: 'Please provide a valid email address.' });
            }
            const conflict = await User.findOne({ email: normalizedEmail, _id: { $ne: user._id } });
            if (conflict) {
                return res.status(409).json({ error: 'That email is already in use.' });
            }
            user.email = normalizedEmail;
        }

        if (password) {
            if (String(password).length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters.' });
            }
            user.passwordHash = await bcrypt.hash(String(password), 10);
        }

        await user.save();
        const token = signToken(user);
        return res.json({ user: formatUser(user), token });
    } catch (err) {
        console.error('Update profile error:', err);
        return res.status(500).json({ error: 'Failed to update profile' });
    }
});

// ==================== CREDITS & PAYMENTS ROUTES ====================

app.get('/api/credits', requireAuth, async (req, res) => {
    try {
        let credits = await UserCredits.findOne({ user_id: req.user.id }).lean();
        if (!credits) {
            credits = await UserCredits.create({
                user_id: req.user.id,
                balance: 0,
                total_earned: 0,
                total_spent: 0,
            });
        }
        return res.json({
            balance: credits.balance,
            total_earned: credits.total_earned,
            total_spent: credits.total_spent,
        });
    } catch (err) {
        console.error('Get credits error:', err);
        return res.status(500).json({ error: 'Failed to fetch credits' });
    }
});

app.post('/api/credits/deduct', requireAuth, async (req, res) => {
    try {
        const { feature, amount, metadata } = req.body || {};
        const creditsToDeduct = Number(amount || 0);
        if (creditsToDeduct <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid credit amount' });
        }

        const updated = await UserCredits.findOneAndUpdate(
            { user_id: req.user.id, balance: { $gte: creditsToDeduct } },
            { $inc: { balance: -creditsToDeduct, total_spent: creditsToDeduct } },
            { new: true }
        );

        if (!updated) {
            return res.status(400).json({ success: false, error: 'Insufficient credits' });
        }

        const tx = await CreditTransaction.create({
            user_id: req.user.id,
            amount: -creditsToDeduct,
            transaction_type: 'usage',
            description: `Used ${creditsToDeduct} credits for ${feature || 'generation'}`,
            metadata: metadata || {},
        });

        const featureTypeMap = {
            'improve thumbnail': 'thumbnail',
            'youtube thumbnail': 'thumbnail',
            'podcast cover': 'thumbnail',
            'tiktok cover': 'thumbnail',
            'twitter card': 'thumbnail',
            'content repurpose': 'repurpose',
            'video generation': 'video_generation',
            'image generation': 'image_generation',
        };
        const featureType = featureTypeMap[String(feature || '').toLowerCase()] || 'premium';

        await CreditUsage.create({
            user_id: req.user.id,
            transaction_id: tx._id.toString(),
            feature_type: featureType,
            feature_id: metadata?.feature_id || null,
            credits_used: creditsToDeduct,
            platform: metadata?.platform || null,
            metadata: metadata || {},
        });

        return res.json({
            success: true,
            transaction_id: tx._id.toString(),
            balance: updated.balance,
            total_earned: updated.total_earned,
            total_spent: updated.total_spent,
        });
    } catch (err) {
        console.error('Deduct credits error:', err);
        return res.status(500).json({ success: false, error: 'Failed to deduct credits' });
    }
});

app.post('/api/credits/add', requireAuth, async (req, res) => {
    try {
        const { amount, description, referenceId, metadata } = req.body || {};
        const creditsToAdd = Number(amount || 0);
        if (creditsToAdd <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid credit amount' });
        }

        const updated = await UserCredits.findOneAndUpdate(
            { user_id: req.user.id },
            { $inc: { balance: creditsToAdd, total_earned: creditsToAdd } },
            { upsert: true, new: true }
        );

        await CreditTransaction.create({
            user_id: req.user.id,
            amount: creditsToAdd,
            transaction_type: 'purchase',
            description: description || `Added ${creditsToAdd} credits`,
            reference_id: referenceId || null,
            metadata: metadata || {},
        });

        return res.json({
            success: true,
            balance: updated.balance,
            total_earned: updated.total_earned,
            total_spent: updated.total_spent,
        });
    } catch (err) {
        console.error('Add credits error:', err);
        return res.status(500).json({ success: false, error: 'Failed to add credits' });
    }
});

app.get('/api/credits/usage', requireAuth, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 10), 100);
        const rows = await CreditUsage.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();
        return res.json(rows);
    } catch (err) {
        console.error('Get credit usage error:', err);
        return res.status(500).json({ error: 'Failed to fetch credit usage' });
    }
});

app.get('/api/credits/transactions', requireAuth, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 20), 100);
        const rows = await CreditTransaction.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();
        return res.json(rows.map((r) => ({ ...r, id: r._id.toString() })));
    } catch (err) {
        console.error('Get credit transactions error:', err);
        return res.status(500).json({ error: 'Failed to fetch credit transactions' });
    }
});

app.get('/api/payments/history', requireAuth, async (req, res) => {
    try {
        const limit = Math.min(Number(req.query.limit || 20), 100);
        const rows = await Payment.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .limit(limit)
            .lean();
        return res.json(rows.map((r) => ({ ...r, id: r._id.toString() })));
    } catch (err) {
        console.error('Get payment history error:', err);
        return res.status(500).json({ error: 'Failed to fetch payment history' });
    }
});

app.get('/api/credit-packs/:priceId', async (req, res) => {
    try {
        const pack = await CreditPack.findOne({ stripe_price_id: req.params.priceId }).lean();
        if (!pack) {
            return res.status(404).json({ error: 'Credit pack not found' });
        }
        return res.json({ ...pack, id: pack._id.toString() });
    } catch (err) {
        console.error('Get credit pack error:', err);
        return res.status(500).json({ error: 'Failed to fetch credit pack' });
    }
});

app.post('/api/stripe/create-checkout-session', requireAuth, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({
                error: 'Stripe is not configured on the server. Add STRIPE_SECRET_KEY to .env.local.',
            });
        }

        const { priceId } = req.body || {};
        if (!priceId) {
            return res.status(400).json({ error: 'priceId is required' });
        }

        const pack = await CreditPack.findOne({ stripe_price_id: priceId }).lean();
        const origin = req.headers.origin || process.env.FRONTEND_URL || 'https://crevo.app';

        // Auto-detect whether this Stripe Price is recurring (subscription) or one-time ($9 pay-as-you-go)
        let checkoutMode = 'payment';
        try {
            const stripePrice = await stripe.prices.retrieve(priceId);
            if (stripePrice?.type === 'recurring') {
                checkoutMode = 'subscription';
            }
        } catch (priceErr) {
            console.warn('Could not inspect Stripe price type, defaulting to payment:', priceErr?.message);
        }

        const session = await stripe.checkout.sessions.create({
            mode: checkoutMode,
            customer_email: req.user.email,
            client_reference_id: req.user.id,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/dashboard/credits?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/dashboard/credits?payment=cancelled`,
            metadata: {
                user_id: req.user.id,
                credits: String(pack?.credits || 0),
                pack_name: pack?.name || '',
                billing_mode: checkoutMode,
            },
        });

        return res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
        console.error('Create checkout session error:', err);
        return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
});

// ==================== CONTENT REPURPOSE ROUTES ====================

app.put('/api/repurpose/videos/:id', requireAuth, async (req, res) => {
    try {
        const video = { ...req.body, id: req.params.id, user_id: req.user.id };
        await RepurposedVideo.findOneAndUpdate({ id: req.params.id }, video, { upsert: true, new: true });
        return res.json({ ok: true });
    } catch (err) {
        console.error('Save repurposed video error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/repurpose/videos/:id', requireAuth, async (req, res) => {
    try {
        const video = await RepurposedVideo.findOne({ id: req.params.id, user_id: req.user.id }).lean();
        return res.json(video || null);
    } catch (err) {
        console.error('Get repurposed video error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/repurpose/videos', requireAuth, async (req, res) => {
    try {
        const videos = await RepurposedVideo.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .lean();
        return res.json(videos);
    } catch (err) {
        console.error('Get user repurposed videos error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/repurpose/clips', requireAuth, async (req, res) => {
    try {
        const clips = Array.isArray(req.body?.clips) ? req.body.clips : [];
        if (clips.length > 0) {
            await ViralClip.bulkWrite(
                clips.map((clip) => ({
                    updateOne: {
                        filter: { id: clip.id },
                        update: { $set: clip },
                        upsert: true,
                    },
                }))
            );
        }
        return res.json({ ok: true });
    } catch (err) {
        console.error('Save viral clips error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/repurpose/clips/:videoId', requireAuth, async (req, res) => {
    try {
        const clips = await ViralClip.find({ repurposed_video_id: req.params.videoId })
            .sort({ virality_score: -1 })
            .lean();
        return res.json(clips);
    } catch (err) {
        console.error('Get viral clips error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.put('/api/repurpose/analyses/:id', requireAuth, async (req, res) => {
    try {
        const analysis = { ...req.body, id: req.params.id };
        await MLAnalysis.findOneAndUpdate({ id: req.params.id }, analysis, { upsert: true, new: true });
        return res.json({ ok: true });
    } catch (err) {
        console.error('Save ML analysis error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.get('/api/repurpose/analyses/:videoId', requireAuth, async (req, res) => {
    try {
        const analysis = await MLAnalysis.findOne({ repurposed_video_id: req.params.videoId }).lean();
        return res.json(analysis || null);
    } catch (err) {
        console.error('Get ML analysis error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.post('/api/repurpose/jobs', requireAuth, async (req, res) => {
    try {
        const job = { ...req.body, user_id: req.user.id };
        await RepurposeJob.create(job);
        return res.status(201).json({ ok: true });
    } catch (err) {
        console.error('Create repurpose job error:', err);
        return res.status(500).json({ error: err.message });
    }
});

app.patch('/api/repurpose/jobs/:id', requireAuth, async (req, res) => {
    try {
        await RepurposeJob.findOneAndUpdate(
            { id: req.params.id, user_id: req.user.id },
            { $set: { ...req.body, updated_at: new Date().toISOString() } }
        );
        return res.json({ ok: true });
    } catch (err) {
        console.error('Update repurpose job error:', err);
        return res.status(500).json({ error: err.message });
    }
});

// ==================== AI GENERATION ROUTE (OpenRouter) ====================

app.post('/api/ai/generate', requireAuth, async (req, res) => {
    try {
        const { model, contents, config } = req.body || {};
        if (!contents) {
            return res.status(400).json({ error: 'contents is required' });
        }

        // Enforce credit balance on paid image generation calls so credits cannot be bypassed from the browser
        const modalities = Array.isArray(config?.responseModalities)
            ? config.responseModalities.map((m) => String(m).toUpperCase())
            : [];
        const isImageCall =
            modalities.includes('IMAGE') ||
            String(model || '').toLowerCase().includes('image') ||
            String(model || '').toLowerCase().includes('banana');

        if (isImageCall) {
            const credits = await UserCredits.findOne({ user_id: req.user.id }).lean();
            if (!credits || credits.balance < 1) {
                return res.status(402).json({
                    error: 'Insufficient credits. Please add credits to generate images.',
                });
            }
        }

        const result = await generateWithOpenRouter({ model, contents, config });
        return res.json(result);
    } catch (err) {
        const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
        console.error('OpenRouter AI error:', err.message);
        return res.status(status).json({ error: err.message || 'AI generation failed' });
    }
});

// ==================== YOUTUBE TRANSCRIPT ROUTE ====================

function extractYouTubeVideoId(input) {
    if (!input) return null;
    const str = String(input).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    try {
        const parsed = new URL(str);
        if (parsed.hostname.includes('youtu.be')) {
            return parsed.pathname.split('/').filter(Boolean)[0] || null;
        }
        const v = parsed.searchParams.get('v');
        if (v) return v;
        const pathMatch = parsed.pathname.match(/\/(shorts|embed|live|v)\/([a-zA-Z0-9_-]{11})/);
        if (pathMatch) return pathMatch[2];
    } catch {
        // fallback regex
    }
    const fallback = str.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})(?:[?&/]|$)/);
    return fallback ? fallback[1] : null;
}

function decodeXmlEntities(text) {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)));
}

function formatTimestamp(totalSeconds) {
    const secs = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function cleanCaptionText(raw) {
    return decodeXmlEntities(raw)
        .replace(/<[^>]+>/g, ' ')
        .replace(/>>\s*/g, '')
        .replace(/\s+([,.;:!?])/g, '$1')
        .replace(/([“"'])\s+/g, '$1')
        .replace(/\s+([”"'])/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

function parseYouTubeCaptionXml(xml) {
    const rawSegments = [];

    // Format 3 (<p t="ms" d="ms">...</p>)
    const pRegex = /<p\b([^>]*)>([\s\S]*?)<\/p>/gi;
    let match;
    while ((match = pRegex.exec(xml)) !== null) {
        const attrs = match[1];
        const inner = match[2];
        const tMatch = attrs.match(/\bt="(\d+)"/);
        const seconds = tMatch ? Number(tMatch[1]) / 1000 : 0;
        const hasSpeakerChange = />>/.test(inner);
        const text = cleanCaptionText(inner);
        if (text) {
            rawSegments.push({ seconds, text, hasSpeakerChange });
        }
    }

    // Fallback Format 1 (<text start="sec" dur="sec">...</text>)
    if (rawSegments.length === 0) {
        const textRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
        while ((match = textRegex.exec(xml)) !== null) {
            const attrs = match[1];
            const inner = match[2];
            const startMatch = attrs.match(/\bstart="([\d.]+)"/);
            const seconds = startMatch ? Number(startMatch[1]) : 0;
            const hasSpeakerChange = />>/.test(inner);
            const text = cleanCaptionText(inner);
            if (text) {
                rawSegments.push({ seconds, text, hasSpeakerChange });
            }
        }
    }

    // Group short caption lines into clean, readable blocks (new block on speaker change or every ~20s / ~240 chars)
    const grouped = [];
    let current = null;

    for (const seg of rawSegments) {
        const shouldStartNew =
            !current ||
            seg.hasSpeakerChange ||
            seg.seconds - current.seconds >= 20 ||
            current.text.length >= 240;

        if (shouldStartNew) {
            if (current) grouped.push(current);
            current = {
                seconds: seg.seconds,
                time: formatTimestamp(seg.seconds),
                text: seg.text,
            };
        } else {
            current.text = `${current.text} ${seg.text}`;
        }
    }
    if (current) grouped.push(current);

    return grouped;
}

app.get('/api/youtube/transcript', async (req, res) => {
    try {
        const videoUrl = String(req.query.url || '');
        const videoId = extractYouTubeVideoId(videoUrl);
        if (!videoId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const playerRes = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)',
            },
            body: JSON.stringify({
                context: {
                    client: {
                        clientName: 'ANDROID',
                        clientVersion: '20.10.38',
                    },
                },
                videoId,
            }),
        });

        if (!playerRes.ok) {
            return res.json({ transcript: null, reason: 'unavailable' });
        }

        const playerData = await playerRes.json();
        const tracks = playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (!Array.isArray(tracks) || tracks.length === 0) {
            return res.json({ transcript: null, reason: 'no_captions' });
        }

        // Prefer English if available, otherwise use the video's primary caption track
        const preferredTrack =
            tracks.find((t) => t.languageCode === 'en' && t.kind !== 'asr') ||
            tracks.find((t) => t.languageCode === 'en') ||
            tracks[0];

        const capRes = await fetch(preferredTrack.baseUrl);
        if (!capRes.ok) {
            return res.json({ transcript: null, reason: 'caption_fetch_failed' });
        }

        const xml = await capRes.text();
        const segments = parseYouTubeCaptionXml(xml);

        if (segments.length === 0) {
            const fallbackText = cleanCaptionText(xml.replace(/<head[\s\S]*?<\/head>/gi, ' '));
            if (!fallbackText) {
                return res.json({ transcript: null, reason: 'empty_captions' });
            }
            return res.json({
                transcript: fallbackText,
                timestampedTranscript: `[00:00] ${fallbackText}`,
                segments: [{ seconds: 0, time: '00:00', text: fallbackText }],
                language: preferredTrack.languageCode || 'unknown',
            });
        }

        const transcript = segments.map((s) => s.text).join('\n\n');
        const timestampedTranscript = segments.map((s) => `[${s.time}] ${s.text}`).join('\n\n');

        return res.json({
            transcript,
            timestampedTranscript,
            segments,
            language: preferredTrack.languageCode || 'unknown',
        });
    } catch (err) {
        console.error('YouTube transcript error:', err.message);
        return res.json({ transcript: null, reason: 'error' });
    }
});

// ==================== PROXY ROUTE (YouTube thumbnails & transcripts) ====================

const ALLOWED_PROXY_HOSTS = new Set([
    'i.ytimg.com',
    'img.youtube.com',
    'yt3.ggpht.com',
    'yt-trans.vercel.app',
]);

app.get('/api/proxy', async (req, res) => {
    try {
        const targetUrl = String(req.query.url || '');
        if (!targetUrl) {
            return res.status(400).json({ error: 'Missing url parameter' });
        }

        let parsed;
        try {
            parsed = new URL(targetUrl);
        } catch {
            return res.status(400).json({ error: 'Invalid URL' });
        }

        if (parsed.protocol !== 'https:' || !ALLOWED_PROXY_HOSTS.has(parsed.hostname)) {
            return res.status(403).json({ error: 'Host not allowed' });
        }

        const upstream = await fetch(parsed.toString());
        if (!upstream.ok) {
            return res.status(upstream.status).send(await upstream.text());
        }

        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        const buffer = Buffer.from(await upstream.arrayBuffer());
        return res.send(buffer);
    } catch (err) {
        console.error('Proxy error:', err);
        return res.status(502).json({ error: 'Failed to fetch upstream resource' });
    }
});

// ==================== NEWSLETTER ROUTE ====================

app.post('/api/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body || {};
        if (!email || typeof email !== 'string' || !email.includes('@')) {
            return res.status(400).json({ error: 'Please enter a valid email address' });
        }
        const normalized = email.trim().toLowerCase();
        await NewsletterSubscriber.findOneAndUpdate(
            { email: normalized },
            { email: normalized },
            { upsert: true, new: true }
        );
        sendNewsletterWelcomeEmail(normalized).catch(() => {});
        return res.json({ ok: true });
    } catch (err) {
        console.error('Newsletter subscribe error:', err);
        return res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ==================== NATIVE FFMPEG VIDEO CLIPPING ====================

const execFileAsync = promisify(execFile);
const VIDEO_TMP_DIR = path.join(os.tmpdir(), 'revo3-videos');
const MAX_VIDEO_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB
const VIDEO_TTL_MS = 30 * 60 * 1000; // 30 minutes

function ensureVideoTmpDir() {
    if (!fs.existsSync(VIDEO_TMP_DIR)) {
        fs.mkdirSync(VIDEO_TMP_DIR, { recursive: true });
    }
}

function cleanupOldTempVideos() {
    try {
        ensureVideoTmpDir();
        const now = Date.now();
        for (const entry of fs.readdirSync(VIDEO_TMP_DIR)) {
            const fullPath = path.join(VIDEO_TMP_DIR, entry);
            try {
                const stat = fs.statSync(fullPath);
                if (now - stat.mtimeMs > VIDEO_TTL_MS) {
                    fs.unlinkSync(fullPath);
                }
            } catch {
                // ignore individual file errors
            }
        }
    } catch {
        // ignore cleanup errors
    }
}

function isValidUploadId(id) {
    return typeof id === 'string' && /^[a-f0-9-]{16,64}$/i.test(id);
}

async function hasAudioStream(inputPath) {
    try {
        const { stdout } = await execFileAsync('ffprobe', [
            '-v', 'error',
            '-select_streams', 'a:0',
            '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0',
            inputPath,
        ]);
        return stdout.trim().length > 0;
    } catch {
        return false;
    }
}

function formatAssTime(sec) {
    const clamped = Math.max(0, Number(sec) || 0);
    const hrs = Math.floor(clamped / 3600);
    const mins = Math.floor((clamped % 3600) / 60);
    const secs = Math.floor(clamped % 60);
    const centis = Math.floor((clamped - Math.floor(clamped)) * 100);
    return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

function escapeAssText(text) {
    return String(text || '')
        .replace(/\\/g, '')
        .replace(/\{/g, '(')
        .replace(/\}/g, ')')
        .replace(/\r?\n/g, ' ')
        .trim();
}

async function generateClipCaptionsAss(inputPath, start, duration, width, height) {
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (!openrouterKey) return null;

    const audioPath = path.join(VIDEO_TMP_DIR, `audio_${crypto.randomUUID()}.mp3`);
    const assPath = path.join(VIDEO_TMP_DIR, `subs_${crypto.randomUUID()}.ass`);

    try {
        await execFileAsync('ffmpeg', [
            '-y',
            '-ss', start.toFixed(3),
            '-i', inputPath,
            '-t', duration.toFixed(3),
            '-vn',
            '-ac', '1',
            '-ar', '16000',
            '-b:a', '32k',
            audioPath,
        ], { maxBuffer: 5 * 1024 * 1024 });

        if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 256) {
            return null;
        }

        const audioB64 = fs.readFileSync(audioPath).toString('base64');
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openrouterKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://revo3.ai',
                'X-Title': 'Revo3.ai Auto Captions',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                temperature: 0.1,
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: `Transcribe the spoken words in this ${duration.toFixed(1)}-second audio clip into short, punchy social-media subtitle cues (2 to 5 words per cue).
Return ONLY valid JSON: {"cues":[{"start":0.0,"end":2.2,"text":"short phrase"}]}.
Rules:
- Timestamps must be in seconds from 0.0 to ${duration.toFixed(1)}.
- Keep each cue 2-5 words so it looks clean on vertical video.
- If there is only music, wind, background noise, or no clear speech, return {"cues":[]}.
- No markdown fences, no commentary, ONLY JSON.`,
                            },
                            {
                                type: 'input_audio',
                                input_audio: {
                                    data: audioB64,
                                    format: 'mp3',
                                },
                            },
                        ],
                    },
                ],
            }),
        });

        if (!response.ok) return null;
        const data = await response.json();
        const raw = String(data?.choices?.[0]?.message?.content || '').trim();
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;

        const parsed = JSON.parse(jsonMatch[0]);
        const cues = Array.isArray(parsed?.cues) ? parsed.cues : [];
        const validCues = cues
            .map((c) => ({
                start: Math.max(0, Math.min(duration, Number(c.start) || 0)),
                end: Math.max(0, Math.min(duration, Number(c.end) || 0)),
                text: escapeAssText(c.text),
            }))
            .filter((c) => c.text.length > 0 && c.end > c.start + 0.15);

        if (validCues.length === 0) return null;

        const fontSize = width < height ? 46 : 38;
        const marginV = width < height ? 210 : 70;
        const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Viral,DejaVu Sans,${fontSize},&H00FFFFFF,&H0000FFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,2,2,40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
        const lines = validCues.map(
            (c) => `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Viral,,0,0,0,,${c.text.toUpperCase()}`
        );
        fs.writeFileSync(assPath, header + lines.join('\n') + '\n', 'utf8');
        return assPath;
    } catch (err) {
        console.warn('Auto-caption generation skipped:', err?.message || err);
        return null;
    } finally {
        try {
            if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
        } catch {
            // ignore
        }
    }
}

app.post('/api/video/upload', requireAuth, (req, res) => {
    cleanupOldTempVideos();
    ensureVideoTmpDir();

    const uploadId = crypto.randomUUID();
    const filePath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
    const writeStream = fs.createWriteStream(filePath);
    let totalBytes = 0;
    let aborted = false;

    const cleanup = () => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
            // ignore
        }
    };

    req.on('data', (chunk) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_VIDEO_UPLOAD_BYTES) {
            aborted = true;
            writeStream.destroy();
            cleanup();
            if (!res.headersSent) {
                res.status(413).json({ error: 'Video file exceeds 5 GB limit' });
            }
            req.destroy();
        }
    });

    req.on('error', (err) => {
        aborted = true;
        writeStream.destroy();
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ error: `Upload stream error: ${err.message}` });
        }
    });

    writeStream.on('error', (err) => {
        aborted = true;
        cleanup();
        if (!res.headersSent) {
            res.status(500).json({ error: `Disk write error: ${err.message}` });
        }
    });

    writeStream.on('finish', () => {
        if (aborted || res.headersSent) return;
        if (totalBytes === 0) {
            cleanup();
            return res.status(400).json({ error: 'Empty video upload' });
        }
        return res.json({ uploadId, size: totalBytes });
    });

    req.pipe(writeStream);
});

app.post('/api/video/clip', requireAuth, async (req, res) => {
    const {
        uploadId,
        startTime = 0,
        endTime = 15,
        aspectRatio = '9:16',
        fps = 30,
        includeAudio = true,
        includeTransitions = false,
        includeCaptions = false,
    } = req.body || {};

    if (!isValidUploadId(uploadId)) {
        return res.status(400).json({ error: 'Invalid uploadId' });
    }

    const inputPath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
    if (!fs.existsSync(inputPath)) {
        return res.status(404).json({ error: 'Uploaded video expired or not found. Please try again.' });
    }

    const start = Math.max(0, Number(startTime) || 0);
    const end = Math.max(start + 1, Number(endTime) || start + 15);
    const duration = Math.max(1, end - start);

    let outputWidth = 720;
    let outputHeight = 1280;
    if (aspectRatio === '16:9') {
        outputWidth = 1280;
        outputHeight = 720;
    } else if (aspectRatio === '1:1') {
        outputWidth = 720;
        outputHeight = 720;
    } else if (aspectRatio === '4:5') {
        outputWidth = 720;
        outputHeight = 900;
    }

    const targetFps = Math.min(60, Math.max(15, Number(fps) || 30));
    const outputPath = path.join(VIDEO_TMP_DIR, `clip_${crypto.randomUUID()}.mp4`);
    let assPath = null;

    const removeTempFiles = () => {
        try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {
            // ignore
        }
        try {
            if (assPath && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        } catch {
            // ignore
        }
    };

    try {
        const audioAvailable = includeAudio !== false ? await hasAudioStream(inputPath) : false;

        if (includeCaptions && audioAvailable) {
            assPath = await generateClipCaptionsAss(inputPath, start, duration, outputWidth, outputHeight);
        }

        const videoFilters = [
            `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase`,
            `crop=${outputWidth}:${outputHeight}`,
        ];

        if (assPath && fs.existsSync(assPath)) {
            const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            videoFilters.push(`ass='${escapedAss}'`);
        }

        if (includeTransitions && duration >= 1.5) {
            // Keep instant hook at 0:00 (no black opening frame!) and apply smooth outro fade
            const fadeDur = 0.4;
            const fadeOutStart = Math.max(0, duration - fadeDur).toFixed(3);
            videoFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeDur}`);
        }

        const filterParts = [`[0:v]${videoFilters.join(',')}[v]`];
        let useAudioFilter = false;
        if (audioAvailable && includeTransitions && duration >= 1.5) {
            const aFadeDur = 0.35;
            const aFadeOutStart = Math.max(0, duration - aFadeDur).toFixed(3);
            filterParts.push(`[0:a]afade=t=out:st=${aFadeOutStart}:d=${aFadeDur}[a]`);
            useAudioFilter = true;
        }

        const args = [
            '-y',
            '-ss', start.toFixed(3),
            '-i', inputPath,
            '-t', duration.toFixed(3),
            '-filter_complex', filterParts.join(';'),
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'ultrafast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-r', String(targetFps),
            '-movflags', '+faststart',
        ];

        if (audioAvailable) {
            args.push('-map', useAudioFilter ? '[a]' : '0:a', '-c:a', 'aac', '-b:a', '128k');
        } else {
            args.push('-an');
        }

        args.push(outputPath);

        await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
        const stat = fs.statSync(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('X-Clip-Width', String(outputWidth));
        res.setHeader('X-Clip-Height', String(outputHeight));
        res.setHeader('X-Captions-Applied', assPath ? 'true' : 'false');
        const readStream = fs.createReadStream(outputPath);
        readStream.on('close', removeTempFiles);
        readStream.on('error', (err) => {
            removeTempFiles();
            if (!res.headersSent) {
                res.status(500).json({ error: `Failed to stream clip: ${err.message}` });
            }
        });
        return readStream.pipe(res);
    } catch (err) {
        removeTempFiles();
        if (err && err.code === 'ENOENT') {
            return res.status(501).json({
                error: 'Native FFmpeg is not installed on this server',
                code: 'FFMPEG_UNAVAILABLE',
            });
        }
        console.error('Native FFmpeg clip error:', err?.stderr || err?.message || err);
        return res.status(500).json({
            error: `FFmpeg failed to cut clip: ${err?.message || 'unknown error'}`,
        });
    }
});

app.delete('/api/video/upload/:uploadId', requireAuth, (req, res) => {
    const { uploadId } = req.params;
    if (isValidUploadId(uploadId)) {
        const filePath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
            // ignore
        }
    }
    return res.json({ ok: true });
});

// ==================== PUBLIC FREE TRIAL AI RESIZE (IP + FINGERPRINT GUARDED) ====================

const PUBLIC_FREE_AI_RESIZE_LIMIT = 2;

async function countFreeTrialUses(tool, ip, fingerprint) {
    const orClauses = [{ ip }];
    if (fingerprint) {
        orClauses.push({ fingerprint });
    }
    return FreeTrialUsage.countDocuments({ tool, $or: orClauses });
}

app.get('/api/public/trial-status', async (req, res) => {
    try {
        const tool = String(req.query.tool || 'ai_resize');
        const ip = getClientIp(req);
        const fingerprint = getClientFingerprint(req);
        const used = await countFreeTrialUses(tool, ip, fingerprint);
        const limit = PUBLIC_FREE_AI_RESIZE_LIMIT;
        return res.json({
            tool,
            used,
            limit,
            remaining: Math.max(0, limit - used),
        });
    } catch (err) {
        console.error('Trial status error:', err);
        return res.json({ tool: 'ai_resize', used: 0, limit: PUBLIC_FREE_AI_RESIZE_LIMIT, remaining: PUBLIC_FREE_AI_RESIZE_LIMIT });
    }
});

app.post('/api/public/ai-resize', async (req, res) => {
    try {
        const ip = getClientIp(req);
        const fingerprint = getClientFingerprint(req);
        const used = await countFreeTrialUses('ai_resize', ip, fingerprint);

        if (used >= PUBLIC_FREE_AI_RESIZE_LIMIT) {
            return res.status(429).json({
                error: 'You have used your 2 free AI Smart Resizes. Create a free Crevo account to continue!',
                code: 'FREE_TRIAL_LIMIT_REACHED',
                used,
                limit: PUBLIC_FREE_AI_RESIZE_LIMIT,
                remaining: 0,
            });
        }

        const { imageBase64, mimeType = 'image/jpeg', aspectRatio = '16:9', targetLabel = 'YouTube Thumbnail (16:9)' } = req.body || {};
        if (!imageBase64 || typeof imageBase64 !== 'string') {
            return res.status(400).json({ error: 'Please upload an image to resize.' });
        }

        const validRatios = new Set(['16:9', '9:16', '1:1', '4:5', '1.91:1', '4:3', '3:4']);
        const safeRatio = validRatios.has(aspectRatio) ? aspectRatio : '16:9';
        const openrouterRatio = safeRatio === '1.91:1' ? '16:9' : safeRatio;

        const prompt = `Recompose and smart-resize this exact image to fit a ${safeRatio} (${targetLabel}) frame.
STRICT RULES:
1. Keep the EXACT same main subject, faces, products, colors, lighting, and any existing text sharp, uncropped, and centered cleanly in the new ${safeRatio} composition.
2. Intelligently extend/outpaint the background naturally to fill the new ${safeRatio} aspect ratio — NEVER stretch or distort the subject, and NEVER add black bars or borders.
3. Do NOT add any new watermarks, aspect ratio labels, or extra text that was not in the original image.
4. Output a crisp, studio-quality ${safeRatio} image ready for publishing.`;

        const contents = {
            parts: [
                { inlineData: { data: imageBase64, mimeType } },
                { text: prompt },
            ],
        };

        let result = null;
        const models = ['google/gemini-nano-banana-2.1', 'google/gemini-3.1-flash-image'];
        let lastErr = null;
        for (const model of models) {
            try {
                result = await generateWithOpenRouter({
                    model,
                    contents,
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                        imageConfig: { aspectRatio: openrouterRatio },
                    },
                });
                const imgPart = result?.candidates?.[0]?.content?.parts?.find((p) => p?.inlineData?.data);
                if (imgPart?.inlineData?.data) {
                    await FreeTrialUsage.create({ tool: 'ai_resize', ip, fingerprint });
                    const newUsed = used + 1;
                    return res.json({
                        imageDataUrl: `data:${imgPart.inlineData.mimeType || 'image/png'};base64,${imgPart.inlineData.data}`,
                        used: newUsed,
                        limit: PUBLIC_FREE_AI_RESIZE_LIMIT,
                        remaining: Math.max(0, PUBLIC_FREE_AI_RESIZE_LIMIT - newUsed),
                    });
                }
            } catch (err) {
                lastErr = err;
                console.warn(`Public AI resize failed on ${model}:`, err?.message || err);
            }
        }

        return res.status(502).json({
            error: lastErr?.message || 'AI Smart Resize failed. Please try again.',
        });
    } catch (err) {
        console.error('Public AI resize error:', err);
        return res.status(500).json({ error: 'Failed to process AI Smart Resize.' });
    }
});

// ==================== ADMIN ROUTES (OWNER-ONLY) ====================

const ADMIN_EMAIL_SET = new Set(
    (process.env.ADMIN_EMAILS || 'sarcharo@gmail.com')
        .split(',')
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
);

function requireAdmin(req, res, next) {
    return requireAuth(req, res, () => {
        const email = String(req.user?.email || '').trim().toLowerCase();
        if (!email || !ADMIN_EMAIL_SET.has(email)) {
            return res.status(403).json({ error: 'Admin access required' });
        }
        return next();
    });
}

app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
    try {
        const [
            users,
            allCredits,
            payments,
            repurposedCount,
            viralClipsCount,
            freeTrials,
            subscribers,
        ] = await Promise.all([
            User.find({}, { passwordHash: 0 }).sort({ created_at: -1 }).lean(),
            UserCredits.find({}).lean(),
            Payment.find({}).sort({ created_at: -1 }).limit(100).lean(),
            RepurposedVideo.countDocuments({}),
            ViralClip.countDocuments({}),
            FreeTrialUsage.find({}).sort({ created_at: -1 }).limit(100).lean(),
            NewsletterSubscriber.find({}).sort({ created_at: -1 }).limit(100).lean(),
        ]);

        const creditsByUser = new Map();
        let totalCreditsBalance = 0;
        let totalCreditsSpent = 0;
        for (const c of allCredits) {
            creditsByUser.set(String(c.user_id), c);
            totalCreditsBalance += Number(c.balance || 0);
            totalCreditsSpent += Number(c.total_spent || 0);
        }

        const paidByUser = new Map();
        const userEmailById = new Map();
        for (const u of users) {
            userEmailById.set(String(u._id), u.email);
        }

        let totalRevenueCents = 0;
        const paidUserIds = new Set();
        for (const p of payments) {
            const isPaid = p.status === 'succeeded' || p.status === 'completed' || p.status === 'paid';
            if (isPaid) {
                const cents = Number(p.amount_cents || 0);
                totalRevenueCents += cents;
                const uid = String(p.user_id);
                paidUserIds.add(uid);
                paidByUser.set(uid, (paidByUser.get(uid) || 0) + cents);
            }
        }

        const formattedUsers = users.map((u) => {
            const uid = String(u._id);
            const cred = creditsByUser.get(uid);
            const paidCents = paidByUser.get(uid) || 0;
            return {
                id: uid,
                email: u.email,
                signup_ip: u.signupIp || '-',
                created_at: u.created_at,
                balance: Number(cred?.balance || 0),
                total_earned: Number(cred?.total_earned || 0),
                total_spent: Number(cred?.total_spent || 0),
                total_paid_cents: paidCents,
                is_paid: paidCents > 0,
            };
        });

        const formattedPayments = payments.map((p) => ({
            id: String(p._id),
            user_id: String(p.user_id),
            email: userEmailById.get(String(p.user_id)) || p.user_id,
            amount_cents: Number(p.amount_cents || 0),
            currency: p.currency || 'usd',
            credits_purchased: Number(p.credits_purchased || 0),
            status: p.status || 'pending',
            pack_name: p.metadata?.pack_name || '',
            created_at: p.created_at,
        }));

        const totalFreeTrials = await FreeTrialUsage.countDocuments({});

        return res.json({
            summary: {
                total_users: users.length,
                paid_users: paidUserIds.size,
                free_users: Math.max(0, users.length - paidUserIds.size),
                total_revenue_cents: totalRevenueCents,
                total_credits_balance: totalCreditsBalance,
                total_credits_spent: totalCreditsSpent,
                total_repurposed_videos: repurposedCount,
                total_viral_clips: viralClipsCount,
                total_free_trials: totalFreeTrials,
                total_subscribers: subscribers.length,
            },
            users: formattedUsers,
            payments: formattedPayments,
            free_trials: freeTrials.map((t) => ({
                id: String(t._id),
                tool: t.tool,
                ip: t.ip,
                fingerprint: t.fingerprint || '-',
                created_at: t.created_at,
            })),
            subscribers: subscribers.map((s) => ({
                id: String(s._id),
                email: s.email,
                created_at: s.created_at,
            })),
        });
    } catch (err) {
        console.error('Admin overview error:', err);
        return res.status(500).json({ error: 'Failed to load admin overview' });
    }
});

app.post('/api/admin/users/:userId/credits', requireAdmin, async (req, res) => {
    try {
        const { userId } = req.params;
        const amount = Number(req.body?.amount);
        const note = String(req.body?.note || 'Admin bonus credits').trim().slice(0, 140);

        if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 100000) {
            return res.status(400).json({ error: 'Please provide a valid non-zero credit amount.' });
        }

        const updated = await UserCredits.findOneAndUpdate(
            { user_id: userId },
            {
                $inc: {
                    balance: amount,
                    ...(amount > 0 ? { total_earned: amount } : {}),
                },
                $set: { updated_at: new Date() },
            },
            { upsert: true, returnDocument: 'after' }
        );

        await CreditTransaction.create({
            user_id: userId,
            amount,
            transaction_type: amount > 0 ? 'bonus' : 'adjustment',
            description: note,
        });

        if (amount > 0) {
            const targetUser = await User.findById(userId, { email: 1 }).lean();
            if (targetUser?.email) {
                sendBonusCreditsEmail(targetUser.email, amount, note, updated.balance).catch(() => {});
            }
        }

        return res.json({
            ok: true,
            balance: updated.balance,
            total_earned: updated.total_earned,
        });
    } catch (err) {
        console.error('Admin credit update error:', err);
        return res.status(500).json({ error: 'Failed to update user credits' });
    }
});

// ==================== ADMIN MAILBUX INBOX (OWNER-ONLY) ====================

app.get('/api/admin/mail/messages', requireAdmin, async (req, res) => {
    try {
        const folder = String(req.query.folder || 'inbox');
        const limit = Number(req.query.limit || 30);
        const result = await listMailMessages(folder, limit);
        return res.json(result);
    } catch (err) {
        console.error('Admin mail list error:', err?.message || err);
        return res.status(500).json({ error: err?.message || 'Failed to load mailbox' });
    }
});

app.get('/api/admin/mail/messages/:id', requireAdmin, async (req, res) => {
    try {
        const msg = await getMailMessage(req.params.id);
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        return res.json(msg);
    } catch (err) {
        console.error('Admin mail get error:', err?.message || err);
        return res.status(500).json({ error: err?.message || 'Failed to load message' });
    }
});

app.delete('/api/admin/mail/messages/:id', requireAdmin, async (req, res) => {
    try {
        await deleteMailMessage(req.params.id);
        return res.json({ ok: true });
    } catch (err) {
        console.error('Admin mail delete error:', err?.message || err);
        return res.status(500).json({ error: err?.message || 'Failed to delete message' });
    }
});

app.post('/api/admin/mail/send', requireAdmin, async (req, res) => {
    try {
        const { to, subject, body, inReplyTo } = req.body || {};
        if (!to || !subject || !body) {
            return res.status(400).json({ error: 'Recipient, subject, and message body are required.' });
        }
        const result = await sendMailMessage({ to, subject, body, inReplyTo });
        return res.json(result);
    } catch (err) {
        console.error('Admin mail send error:', err?.message || err);
        return res.status(500).json({ error: err?.message || 'Failed to send email' });
    }
});

// ==================== 7-DAY TEMPORARY USER WORK LIBRARY ====================

const LIBRARY_DIR = process.env.USER_WORK_DIR || path.join(os.tmpdir(), 'revo3-library');
const LIBRARY_TTL_DAYS = 7;
const LIBRARY_TTL_MS = LIBRARY_TTL_DAYS * 24 * 60 * 60 * 1000;
const MAX_LIBRARY_CLIP_BYTES = 200 * 1024 * 1024; // 200 MB per saved clip

function ensureLibraryDir() {
    if (!fs.existsSync(LIBRARY_DIR)) {
        fs.mkdirSync(LIBRARY_DIR, { recursive: true });
    }
}

async function cleanupExpiredUserWork() {
    try {
        ensureLibraryDir();
        const now = new Date();
        const expired = await UserWork.find({ expires_at: { $lte: now } }).lean();
        if (expired.length === 0) return;

        for (const item of expired) {
            const fullPath = path.join(LIBRARY_DIR, path.basename(item.file_name));
            try {
                if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch {
                // ignore file deletion error
            }
        }
        await UserWork.deleteMany({ _id: { $in: expired.map((i) => i._id) } });
        console.log(`[Library] Cleaned up ${expired.length} expired work item(s).`);
    } catch (err) {
        console.warn('[Library] Cleanup error:', err?.message || err);
    }
}

app.post('/api/library/save-image', requireAuth, async (req, res) => {
    try {
        ensureLibraryDir();
        const { dataUrl, type = 'thumbnail', title = 'Untitled Design', platform = '', aspectRatio = '' } = req.body || {};
        if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
            return res.status(400).json({ error: 'Valid image dataUrl is required' });
        }

        const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
        if (!match) {
            return res.status(400).json({ error: 'Malformed image dataUrl' });
        }

        const mimeType = match[1];
        const ext = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
        const buffer = Buffer.from(match[2], 'base64');
        if (buffer.length > 25 * 1024 * 1024) {
            return res.status(413).json({ error: 'Image exceeds 25 MB limit' });
        }

        const fileName = `${crypto.randomUUID()}.${ext}`;
        fs.writeFileSync(path.join(LIBRARY_DIR, fileName), buffer);

        const safeType = type === 'resize' ? 'resize' : 'thumbnail';
        const doc = await UserWork.create({
            user_id: req.user.id,
            type: safeType,
            title: String(title || 'Untitled Design').slice(0, 120),
            platform: String(platform || '').slice(0, 60),
            aspect_ratio: String(aspectRatio || '').slice(0, 20),
            mime_type: mimeType,
            file_name: fileName,
            file_size: buffer.length,
            expires_at: new Date(Date.now() + LIBRARY_TTL_MS),
        });

        return res.status(201).json({
            id: doc._id.toString(),
            expires_at: doc.expires_at,
        });
    } catch (err) {
        console.error('Library save-image error:', err);
        return res.status(500).json({ error: 'Failed to save image to library' });
    }
});

app.post('/api/library/save-video', requireAuth, (req, res) => {
    ensureLibraryDir();
    const fileName = `${crypto.randomUUID()}.mp4`;
    const filePath = path.join(LIBRARY_DIR, fileName);
    const writeStream = fs.createWriteStream(filePath);
    let totalBytes = 0;
    let aborted = false;

    const removePartial = () => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
            // ignore
        }
    };

    req.on('data', (chunk) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_LIBRARY_CLIP_BYTES) {
            aborted = true;
            writeStream.destroy();
            removePartial();
            if (!res.headersSent) res.status(413).json({ error: 'Clip exceeds 200 MB limit' });
            req.destroy();
        }
    });

    req.on('error', () => {
        aborted = true;
        writeStream.destroy();
        removePartial();
        if (!res.headersSent) res.status(500).json({ error: 'Upload stream failed' });
    });

    writeStream.on('error', () => {
        aborted = true;
        removePartial();
        if (!res.headersSent) res.status(500).json({ error: 'Failed writing clip to disk' });
    });

    writeStream.on('finish', async () => {
        if (aborted || res.headersSent) return;
        if (totalBytes === 0) {
            removePartial();
            return res.status(400).json({ error: 'Empty clip upload' });
        }
        try {
            const doc = await UserWork.create({
                user_id: req.user.id,
                type: 'clip',
                title: String(req.query.title || 'Viral Short Clip').slice(0, 120),
                platform: String(req.query.platform || '9:16').slice(0, 80),
                aspect_ratio: String(req.query.aspectRatio || '9:16').slice(0, 20),
                mime_type: 'video/mp4',
                file_name: fileName,
                file_size: totalBytes,
                expires_at: new Date(Date.now() + LIBRARY_TTL_MS),
            });
            return res.status(201).json({
                id: doc._id.toString(),
                expires_at: doc.expires_at,
            });
        } catch (err) {
            removePartial();
            console.error('Library save-video DB error:', err);
            return res.status(500).json({ error: 'Failed to save clip record' });
        }
    });

    req.pipe(writeStream);
});

app.get('/api/library', requireAuth, async (req, res) => {
    try {
        const now = new Date();
        const items = await UserWork.find({
            user_id: req.user.id,
            expires_at: { $gt: now },
        })
            .sort({ created_at: -1 })
            .limit(100)
            .lean();

        return res.json({
            retention_days: LIBRARY_TTL_DAYS,
            items: items.map((item) => {
                const msLeft = Math.max(0, new Date(item.expires_at).getTime() - now.getTime());
                const daysLeft = Math.max(1, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
                return {
                    id: item._id.toString(),
                    type: item.type,
                    title: item.title,
                    platform: item.platform,
                    aspect_ratio: item.aspect_ratio,
                    mime_type: item.mime_type,
                    file_size: item.file_size,
                    created_at: item.created_at,
                    expires_at: item.expires_at,
                    days_left: daysLeft,
                    file_url: `/api/library/file/${item._id.toString()}`,
                };
            }),
        });
    } catch (err) {
        console.error('Library list error:', err);
        return res.status(500).json({ error: 'Failed to load library' });
    }
});

app.get('/api/library/file/:id', async (req, res) => {
    try {
        let token = '';
        const authHeader = req.headers.authorization || '';
        if (authHeader.startsWith('Bearer ')) {
            token = authHeader.slice(7).trim();
        } else if (typeof req.query.token === 'string') {
            token = req.query.token.trim();
        }
        if (!token) {
            return res.status(401).json({ error: 'Authentication required' });
        }

        let payload;
        try {
            payload = jwt.verify(token, process.env.JWT_SECRET || 'revo3-dev-jwt-secret-change-in-production');
        } catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const item = await UserWork.findOne({ _id: req.params.id, user_id: String(payload.sub || payload.id) }).lean();
        if (!item) {
            return res.status(404).json({ error: 'File not found or expired' });
        }

        const fullPath = path.join(LIBRARY_DIR, path.basename(item.file_name));
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'File no longer exists on server' });
        }

        res.setHeader('Content-Type', item.mime_type || 'application/octet-stream');
        res.setHeader('Cache-Control', 'private, max-age=3600');
        return res.sendFile(fullPath);
    } catch (err) {
        console.error('Library stream error:', err);
        return res.status(500).json({ error: 'Failed to load file' });
    }
});

app.delete('/api/library/:id', requireAuth, async (req, res) => {
    try {
        const item = await UserWork.findOne({ _id: req.params.id, user_id: req.user.id });
        if (!item) {
            return res.status(404).json({ error: 'Item not found' });
        }
        const fullPath = path.join(LIBRARY_DIR, path.basename(item.file_name));
        try {
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch {
            // ignore
        }
        await item.deleteOne();
        return res.json({ ok: true });
    } catch (err) {
        console.error('Library delete error:', err);
        return res.status(500).json({ error: 'Failed to delete item' });
    }
});

// ==================== PRODUCTION STATIC FRONTEND + SERVER-SIDE SEO META ====================

const SSR_SEO_ROUTES = {
    '/': {
        title: 'Crevo AI — YouTube Thumbnail Generator & Viral Short Clip Studio',
        description:
            'Create high-CTR YouTube thumbnails, improve existing thumbnails with AI scoring, repurpose long videos (up to 5GB) into viral Shorts, TikToks & Reels with auto-captions, and download transcripts free.',
    },
    '/tools/youtube-transcript': {
        title: 'Free YouTube Transcript & HD Thumbnail Downloader | Crevo AI',
        description:
            'Extract timestamped YouTube video & Shorts transcripts and download full HD 1280x720 thumbnails free online — no login required to try.',
    },
    '/tools/image-resizer': {
        title: 'Free AI Image Resizer Without Cropping (YouTube, TikTok, Instagram) | Crevo AI',
        description:
            'Smart AI image resizer that extends backgrounds naturally to 16:9, 9:16, 1:1, and 4:5 without cropping faces or text. Try 2 free AI Smart Resizes online.',
    },
    '/tools/youtube-thumbnail-resizer': {
        title: 'YouTube Thumbnail Resizer 1280x720 (AI Resize Without Cropping) | Crevo AI',
        description:
            'Convert any vertical or square photo into a crisp 1280x720 (16:9) YouTube thumbnail using AI background extension — no black bars or awkward cropping.',
    },
    '/tools/tiktok-image-resizer': {
        title: 'TikTok & YouTube Shorts 9:16 Image Resizer (AI Smart Expand) | Crevo AI',
        description:
            'Turn wide horizontal thumbnails and photos into vertical 1080x1920 (9:16) TikTok, Shorts & Reels covers automatically with Crevo AI Smart Resize.',
    },
    '/tools/instagram-image-resizer': {
        title: 'Instagram 4:5 & 1:1 Image Resizer Without Cropping | Crevo AI',
        description:
            'Resize any image to Instagram Portrait (1080x1350, 4:5) or Square (1080x1080, 1:1) using AI background fill so nothing gets cut off.',
    },
    '/features': {
        title: 'Features — AI Thumbnail Improver, 5GB Video-to-Shorts & Captions | Crevo AI',
        description:
            'Explore Crevo AI creator tools: Improve YouTube Thumbnail with CTR scoring, Viral Hook Copywriter, 5GB Video-to-Shorts Repurposing with AI captions, and Smart Resize.',
    },
    '/pricing': {
        title: 'Pricing — Flexible Credit Packs for YouTube & Short-Form Creators | Crevo AI',
        description:
            'Transparent Crevo AI pricing. Try free tools with no signup and pay only for the AI thumbnails and viral short clips you create.',
    },
    '/platforms/youtube': {
        title: 'AI YouTube Thumbnail Generator & CTR Improver | Crevo AI',
        description:
            'Analyze your YouTube thumbnail CTR, get AI hook title ideas, and generate scroll-stopping 16:9 thumbnails that get more clicks.',
    },
    '/platforms/repurpose': {
        title: 'AI Video to YouTube Shorts, TikTok & Reels Maker (Up to 5GB) | Crevo AI',
        description:
            'Upload podcasts or long YouTube videos up to 5GB and let Crevo AI detect viral moments, crop to 9:16 HD, add transitions, and burn in bold social captions.',
    },
    '/platforms/tiktok': {
        title: 'AI TikTok & Reels Cover Designer + Vertical Clip Studio | Crevo AI',
        description:
            'Create bold 9:16 TikTok & Reels covers and auto-cut viral vertical clips with burned-in AI subtitles in seconds.',
    },
    '/platforms/podcast': {
        title: 'AI Podcast Cover Art Generator & Viral Clip Repurposer | Crevo AI',
        description:
            'Design 1:1 podcast cover art for Spotify & Apple Podcasts and turn full podcast episodes into viral vertical clips automatically.',
    },
    '/platforms/twitter': {
        title: 'AI X / Twitter Card Designer & Widescreen Clip Maker | Crevo AI',
        description:
            'Create high-engagement 1.91:1 X/Twitter link cards and 16:9 viral video clips in seconds with Crevo AI.',
    },
    '/business': {
        title: 'Crevo AI for YouTube Agencies & Media Teams',
        description:
            'Scale high-CTR thumbnail production and automated short-form video repurposing across multiple channels with Crevo AI.',
    },
};

function escapeHtmlAttr(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

const distDir = path.join(rootDir, 'dist');
const indexHtmlPath = path.join(distDir, 'index.html');
let cachedIndexHtml = fs.existsSync(indexHtmlPath) ? fs.readFileSync(indexHtmlPath, 'utf8') : null;

if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
        if (!cachedIndexHtml && fs.existsSync(indexHtmlPath)) {
            cachedIndexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        }
        if (!cachedIndexHtml) {
            return res.status(404).send('Not found');
        }

        const cleanPath = (req.path || '/').replace(/\/+$/, '') || '/';
        const meta = SSR_SEO_ROUTES[cleanPath];
        if (!meta) {
            return res.type('html').send(cachedIndexHtml);
        }

        const safeTitle = escapeHtmlAttr(meta.title);
        const safeDesc = escapeHtmlAttr(meta.description);
        const canonicalUrl = `https://crevo.app${cleanPath === '/' ? '/' : cleanPath}`;

        const html = cachedIndexHtml
            .replace(/<title>[\s\S]*?<\/title>/i, `<title>${safeTitle}</title>`)
            .replace(/<meta\s+name="description"[\s\S]*?\/>/i, `<meta name="description" content="${safeDesc}" />`)
            .replace(/<link\s+rel="canonical"[\s\S]*?\/>/i, `<link rel="canonical" href="${canonicalUrl}" />`)
            .replace(/<meta\s+property="og:url"[\s\S]*?\/>/i, `<meta property="og:url" content="${canonicalUrl}" />`)
            .replace(/<meta\s+property="og:title"[\s\S]*?\/>/i, `<meta property="og:title" content="${safeTitle}" />`)
            .replace(/<meta\s+property="og:description"[\s\S]*?\/>/i, `<meta property="og:description" content="${safeDesc}" />`)
            .replace(/<meta\s+name="twitter:title"[\s\S]*?\/>/i, `<meta name="twitter:title" content="${safeTitle}" />`)
            .replace(/<meta\s+name="twitter:description"[\s\S]*?\/>/i, `<meta name="twitter:description" content="${safeDesc}" />`);

        res.setHeader('Cache-Control', 'no-cache');
        return res.type('html').send(html);
    });
}

// ==================== START SERVER ====================

async function start() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not set in .env.local');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI, {
            dbName: MONGODB_DB_NAME,
            serverSelectionTimeoutMS: 10000,
        });
        console.log(`✅ Connected to MongoDB Atlas (db: ${MONGODB_DB_NAME})`);
    } catch (err) {
        console.error('❌ Failed to connect to MongoDB:', err.message);
        process.exit(1);
    }

    const server = app.listen(PORT, () => {
        console.log(`🚀 API server running on http://localhost:${PORT}`);
    });
    // Allow long-running multi-GB video uploads without Node's default 5-minute request timeout
    server.requestTimeout = 0;

    // Run 7-day temporary work cleanup on startup and every hour
    cleanupExpiredUserWork();
    setInterval(cleanupExpiredUserWork, 60 * 60 * 1000);
}

start();
