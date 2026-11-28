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
    AffiliateClick,
    AffiliateCommission,
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
    sendOpenRouterLowBalanceAlert,
    sendClipsReadyEmail,
    sendAffiliateCommissionEmail,
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
                if (userId && (session.amount_total || 0) > 0) {
                    recordAffiliateCommissionForPayment({
                        buyerUserId: userId,
                        stripePaymentId: session.id,
                        amountCents: session.amount_total || 0,
                        planName,
                    }).catch(() => {});
                }
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

                    recordAffiliateCommissionForPayment({
                        buyerUserId: userId,
                        stripePaymentId: invoice.id,
                        amountCents,
                        planName,
                    }).catch(() => {});

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
        videoQueue: {
            active: activeVideoJobs,
            queued: videoJobQueue.length,
            maxConcurrent: MAX_CONCURRENT_VIDEO_JOBS,
        },
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
        const deviceFingerprint = getClientFingerprint(req);
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Block creating multiple free accounts on the SAME device just by changing email
        if (deviceFingerprint) {
            const existingDeviceAccount = await User.countDocuments({
                deviceFingerprint,
                created_at: { $gte: thirtyDaysAgo },
            });
            if (existingDeviceAccount >= 1) {
                return res.status(429).json({
                    error: 'A free account was already created on this device. Please sign in to your existing account.',
                });
            }
        }

        // Allow coworkers/family on the same Wi-Fi IP using DIFFERENT devices (office safety cap: 10 per 30 days)
        if (signupIp && signupIp !== 'unknown') {
            const recentIpSignups = await User.countDocuments({
                signupIp,
                created_at: { $gte: thirtyDaysAgo },
            });
            if (recentIpSignups >= 10) {
                return res.status(429).json({
                    error: 'Account creation limit reached for this network. Please sign in to your existing account.',
                });
            }
        }

        const referrer = await resolveValidReferrer(req.body?.referralCode, normalizedEmail, deviceFingerprint);
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            canonicalEmail,
            signupIp,
            deviceFingerprint,
            passwordHash,
            ...(referrer
                ? {
                      referred_by_code: referrer.affiliate_code,
                      referred_by_user_id: referrer._id.toString(),
                      referred_at: new Date(),
                  }
                : {}),
        });

        const STARTER_FREE_CREDITS = 6;
        await UserCredits.create({
            user_id: user._id.toString(),
            balance: STARTER_FREE_CREDITS,
            total_earned: STARTER_FREE_CREDITS,
            total_spent: 0,
        });
        await CreditTransaction.create({
            user_id: user._id.toString(),
            amount: STARTER_FREE_CREDITS,
            transaction_type: 'bonus',
            description: 'Welcome starter credits (6 free credits)',
        }).catch(() => {});

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

app.get('/api/auth/google/config', (_req, res) => {
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
    return res.json({
        enabled: Boolean(clientId),
        clientId: clientId || null,
    });
});

app.post('/api/auth/google', async (req, res) => {
    try {
        const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
        if (!googleClientId) {
            return res.status(503).json({ error: 'Google Sign-In is not configured on the server.' });
        }

        const credential = String(req.body?.credential || '').trim();
        if (!credential) {
            return res.status(400).json({ error: 'Missing Google credential token.' });
        }

        // Verify Google ID token with Google's tokeninfo endpoint over HTTPS
        const verifyRes = await fetch(
            `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`
        );
        if (!verifyRes.ok) {
            return res.status(401).json({ error: 'Invalid or expired Google sign-in token. Please try again.' });
        }

        const payload = await verifyRes.json();
        const isAudValid = payload?.aud === googleClientId;
        const isEmailVerified = payload?.email_verified === true || payload?.email_verified === 'true';
        const rawEmail = String(payload?.email || '').trim().toLowerCase();

        if (!isAudValid || !isEmailVerified || !rawEmail || !rawEmail.includes('@')) {
            return res.status(401).json({ error: 'Google account verification failed.' });
        }

        const canonicalEmail = normalizeCanonicalEmail(rawEmail);
        let user = await User.findOne({
            $or: [{ email: rawEmail }, { canonicalEmail }],
        });

        let isNewUser = false;
        if (!user) {
            if (isDisposableEmail(rawEmail)) {
                return res.status(400).json({ error: 'Disposable email addresses are not allowed.' });
            }

            const signupIp = getClientIp(req);
            const deviceFingerprint = getClientFingerprint(req);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

            if (deviceFingerprint) {
                const existingDeviceAccount = await User.countDocuments({
                    deviceFingerprint,
                    created_at: { $gte: thirtyDaysAgo },
                });
                if (existingDeviceAccount >= 1) {
                    return res.status(429).json({
                        error: 'A free account was already created on this device. Please sign in with your existing account.',
                    });
                }
            }

            if (signupIp && signupIp !== 'unknown') {
                const recentIpSignups = await User.countDocuments({
                    signupIp,
                    created_at: { $gte: thirtyDaysAgo },
                });
                if (recentIpSignups >= 10) {
                    return res.status(429).json({
                        error: 'Account creation limit reached for this network. Please sign in to your existing account.',
                    });
                }
            }

            const referrer = await resolveValidReferrer(req.body?.referralCode, rawEmail, deviceFingerprint);
            const randomSecret = crypto.randomBytes(32).toString('hex');
            const passwordHash = await bcrypt.hash(randomSecret, 10);
            user = await User.create({
                email: rawEmail,
                canonicalEmail,
                signupIp,
                deviceFingerprint,
                passwordHash,
                ...(referrer
                    ? {
                          referred_by_code: referrer.affiliate_code,
                          referred_by_user_id: referrer._id.toString(),
                          referred_at: new Date(),
                      }
                    : {}),
            });

            const STARTER_FREE_CREDITS = 6;
            await UserCredits.create({
                user_id: user._id.toString(),
                balance: STARTER_FREE_CREDITS,
                total_earned: STARTER_FREE_CREDITS,
                total_spent: 0,
            });
            await CreditTransaction.create({
                user_id: user._id.toString(),
                amount: STARTER_FREE_CREDITS,
                transaction_type: 'bonus',
                description: 'Welcome starter credits (6 free credits)',
            }).catch(() => {});

            isNewUser = true;
            sendWelcomeEmail(rawEmail).catch(() => {});
            sendAdminNewSignupAlert(rawEmail, signupIp).catch(() => {});
        }

        const token = signToken(user);
        return res.json({
            user: formatUser(user),
            token,
            isNewUser,
        });
    } catch (err) {
        console.error('Google auth error:', err);
        return res.status(500).json({ error: 'Failed to sign in with Google. Please try again.' });
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
        let stripePrice = null;
        try {
            stripePrice = await stripe.prices.retrieve(priceId);
            if (stripePrice?.type === 'recurring') {
                checkoutMode = 'subscription';
            }
        } catch (priceErr) {
            console.warn('Could not inspect Stripe price type, defaulting to payment:', priceErr?.message);
        }

        const resolvedCredits =
            pack?.credits ||
            Number(stripePrice?.metadata?.credits || 0) ||
            (stripePrice?.unit_amount >= 9000 ? 1000 : stripePrice?.unit_amount >= 2500 ? 200 : 50);

        const session = await stripe.checkout.sessions.create({
            mode: checkoutMode,
            customer_email: req.user.email,
            client_reference_id: req.user.id,
            allow_promotion_codes: true,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/dashboard/credits?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/dashboard/credits?payment=cancelled`,
            metadata: {
                user_id: req.user.id,
                credits: String(resolvedCredits),
                pack_name: pack?.name || stripePrice?.nickname || (checkoutMode === 'subscription' ? 'Crevo AI Subscription' : 'Pay As You Go'),
                billing_mode: checkoutMode,
            },
        });

        return res.json({ sessionId: session.id, url: session.url });
    } catch (err) {
        console.error('Create checkout session error:', err);
        return res.status(500).json({ error: err.message || 'Failed to create checkout session' });
    }
});

app.post('/api/stripe/create-portal-session', requireAuth, async (req, res) => {
    try {
        if (!stripe) {
            return res.status(500).json({ error: 'Stripe is not configured on the server.' });
        }

        const origin = req.headers.origin || process.env.FRONTEND_URL || 'https://crevo.app';
        const customers = await stripe.customers.list({
            email: req.user.email,
            limit: 1,
        });

        const customer = customers.data?.[0];
        if (!customer) {
            return res.status(404).json({
                error: 'No Stripe subscription or billing profile found for your account yet. Subscribe to a plan first to manage billing.',
            });
        }

        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: `${origin}/dashboard/credits`,
        });

        return res.json({ url: portalSession.url });
    } catch (err) {
        console.error('Create billing portal session error:', err);
        return res.status(500).json({ error: err.message || 'Failed to open billing portal' });
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

app.get('/api/youtube/thumbnail', async (req, res) => {
    try {
        const videoUrl = String(req.query.url || '').trim();
        const videoId = extractYouTubeVideoId(videoUrl);
        if (!videoId) {
            return res.status(400).json({ error: 'Please paste a valid YouTube video or Shorts link.' });
        }

        const qualities = ['maxresdefault', 'sddefault', 'hqdefault'];
        for (const q of qualities) {
            const thumbUrl = `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
            const imgRes = await fetch(thumbUrl);
            if (imgRes.ok) {
                const buf = Buffer.from(await imgRes.arrayBuffer());
                if (buf.length > 2000) {
                    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';
                    const base64 = buf.toString('base64');
                    return res.json({
                        videoId,
                        quality: q,
                        mimeType,
                        base64,
                        dataUrl: `data:${mimeType};base64,${base64}`,
                    });
                }
            }
        }

        return res.status(404).json({ error: 'Could not fetch thumbnail for that YouTube video.' });
    } catch (err) {
        console.error('YouTube thumbnail fetch error:', err.message);
        return res.status(500).json({ error: 'Failed to fetch YouTube thumbnail.' });
    }
});

app.post('/api/public/contact', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim().slice(0, 120);
        const email = String(req.body?.email || '').trim().toLowerCase().slice(0, 180);
        const subject = String(req.body?.subject || '').trim().slice(0, 200);
        const message = String(req.body?.message || '').trim().slice(0, 4000);

        if (!name || !email || !email.includes('@') || !subject || !message) {
            return res.status(400).json({ error: 'Please fill in all fields with a valid email address.' });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        const fromAddress = process.env.EMAIL_FROM || 'Crevo AI <hello@crevo.app>';
        const targetInbox = process.env.MAILBUX_USER || 'sam@crevo.app';

        if (!resendApiKey) {
            return res.status(503).json({ error: 'Contact email service is temporarily unavailable.' });
        }

        const r = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: fromAddress,
                to: [targetInbox],
                reply_to: email,
                subject: `[Contact Form] ${subject}`,
                text: `From: ${name} <${email}>\n\n${message}`,
            }),
        });

        if (!r.ok) {
            const errTxt = await r.text();
            throw new Error(`Resend failed: ${errTxt}`);
        }

        return res.json({ ok: true });
    } catch (err) {
        console.error('Public contact form error:', err?.message || err);
        return res.status(500).json({ error: 'Failed to send message. Please email sam@crevo.app directly.' });
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

// Auto-scaling FFmpeg / yt-dlp concurrency queue so traffic spikes queue smoothly instead of overloading CPU
const CPU_CORES = Math.max(1, (os.cpus() || []).length);
const MAX_CONCURRENT_VIDEO_JOBS = Math.max(
    2,
    Math.min(8, Number(process.env.MAX_CONCURRENT_VIDEO_JOBS) || CPU_CORES)
);
const FFMPEG_THREADS_PER_JOB = Math.max(1, Math.min(4, Math.ceil(CPU_CORES / 2)));
const MAX_QUEUED_VIDEO_JOBS = 25;
let activeVideoJobs = 0;
const videoJobQueue = [];

function runWithVideoQueue(taskFn) {
    return new Promise((resolve, reject) => {
        if (activeVideoJobs >= MAX_CONCURRENT_VIDEO_JOBS && videoJobQueue.length >= MAX_QUEUED_VIDEO_JOBS) {
            const busyErr = new Error('Video server is currently busy. Please retry in a few seconds.');
            busyErr.status = 503;
            return reject(busyErr);
        }

        const execute = async () => {
            activeVideoJobs += 1;
            try {
                const result = await taskFn();
                resolve(result);
            } catch (err) {
                reject(err);
            } finally {
                activeVideoJobs = Math.max(0, activeVideoJobs - 1);
                const next = videoJobQueue.shift();
                if (next) next();
            }
        };

        if (activeVideoJobs < MAX_CONCURRENT_VIDEO_JOBS) {
            execute();
        } else {
            videoJobQueue.push(execute);
        }
    });
}

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

async function generateClipCaptionsAss(
    inputPath,
    start,
    duration,
    width,
    height,
    captionStyle = 'hormozi',
    captionPosition = 'bottom'
) {
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

        const isVertical = width < height;
        const resScale = isVertical ? height / 1280 : width / 1280;
        const styleKey = String(captionStyle || 'hormozi').toLowerCase();
        const posKey = String(captionPosition || 'bottom').toLowerCase();

        // ASS Alignment: 2=bottom-center, 5=middle-center, 8=top-center
        const alignment = posKey === 'top' ? 8 : posKey === 'middle' ? 5 : 2;
        const marginV =
            posKey === 'middle'
                ? 0
                : Math.round(
                      (posKey === 'top'
                          ? (isVertical ? 150 : 55)
                          : (isVertical ? 220 : 70)) * resScale
                  );

        // ASS colors are &HAABBGGRR (Blue-Green-Red!)
        let fontSize = Math.round((isVertical ? 48 : 38) * resScale);
        let primary = '&H0000EAFF';   // Hormozi bright yellow active word
        let secondary = '&H00FFFFFF'; // White before highlight
        let outlineColor = '&H00000000';
        let backColor = '&H80000000';
        let borderStyle = 1;
        let outline = 5;
        let shadow = 3;
        let uppercase = true;

        if (styleKey === 'mrbeast') {
            fontSize = isVertical ? 52 : 40;
            primary = '&H00FFFFFF';
            secondary = '&H000045FF'; // Vivid red-orange pop
            outlineColor = '&H00000000';
            outline = 6;
            shadow = 3;
        } else if (styleKey === 'neon') {
            fontSize = isVertical ? 48 : 38;
            primary = '&H00FF9BFF'; // Electric neon purple/pink
            secondary = '&H00FFFFFF';
            outlineColor = '&H007A1C57';
            outline = 5;
            shadow = 4;
        } else if (styleKey === 'minimal') {
            fontSize = isVertical ? 40 : 34;
            primary = '&H00FFFFFF';
            secondary = '&H00D8D8D8';
            outlineColor = '&H99000000';
            backColor = '&H99000000';
            borderStyle = 3; // Opaque pill box background
            outline = 10;
            shadow = 0;
            uppercase = false;
        }

        const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${width}
PlayResY: ${height}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Viral,DejaVu Sans,${fontSize},${primary},${secondary},${outlineColor},${backColor},-1,0,0,0,100,100,0,0,${borderStyle},${outline},${shadow},${alignment},40,40,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
        // Build word-by-word karaoke highlight (\kf) so each word pops as it is spoken
        const lines = validCues.map((c) => {
            const rawText = uppercase ? c.text.toUpperCase() : c.text;
            const words = rawText.split(/\s+/).filter(Boolean);
            const totalCs = Math.max(15, Math.round((c.end - c.start) * 100));
            const totalChars = words.reduce((acc, w) => acc + Math.max(2, w.length), 0) || 1;
            const karaokeText =
                styleKey === 'minimal' || words.length <= 1
                    ? rawText
                    : words
                          .map((w) => {
                              const wCs = Math.max(8, Math.round((Math.max(2, w.length) / totalChars) * totalCs));
                              return `{\\kf${wCs}}${w}`;
                          })
                          .join(' ');
            return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Viral,,0,0,0,,${karaokeText}`;
        });
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

app.get('/api/video/stream/:uploadId', (req, res, next) => {
    if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token.trim()) {
        req.headers.authorization = `Bearer ${req.query.token.trim()}`;
    }
    return requireAuth(req, res, next);
}, (req, res) => {
    const uploadId = String(req.params.uploadId || '').trim();
    if (!/^[0-9a-f-]{36}$/i.test(uploadId)) {
        return res.status(400).json({ error: 'Invalid uploadId' });
    }
    const filePath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Video expired or not found' });
    }
    res.setHeader('Content-Type', 'video/mp4');
    return res.sendFile(filePath);
});

// Convert incompatible mobile phone codecs (HEVC/H.265, 10-bit HDR, MOV) to universal H.264 MP4 for Studio preview
app.post('/api/video/transcode-preview', requireAuth, (req, res) => {
    cleanupOldTempVideos();
    ensureVideoTmpDir();

    const MAX_PREVIEW_BYTES = 250 * 1024 * 1024; // 250 MB
    const rawId = crypto.randomUUID();
    const outId = crypto.randomUUID();
    const srcPath = path.join(VIDEO_TMP_DIR, `${rawId}_src.bin`);
    const outPath = path.join(VIDEO_TMP_DIR, `${outId}.mp4`);
    const writeStream = fs.createWriteStream(srcPath);
    let totalBytes = 0;
    let aborted = false;

    const cleanupSrc = () => {
        try {
            if (fs.existsSync(srcPath)) fs.unlinkSync(srcPath);
        } catch {
            // ignore
        }
    };
    const cleanupOut = () => {
        try {
            if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
        } catch {
            // ignore
        }
    };

    req.on('data', (chunk) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_PREVIEW_BYTES) {
            aborted = true;
            writeStream.destroy();
            cleanupSrc();
            if (!res.headersSent) {
                res.status(413).json({ error: 'Video exceeds 250 MB preview conversion limit' });
            }
            req.destroy();
        }
    });

    req.on('error', (err) => {
        aborted = true;
        writeStream.destroy();
        cleanupSrc();
        if (!res.headersSent) {
            res.status(500).json({ error: `Upload stream error: ${err.message}` });
        }
    });

    writeStream.on('error', (err) => {
        aborted = true;
        cleanupSrc();
        if (!res.headersSent) {
            res.status(500).json({ error: `Disk write error: ${err.message}` });
        }
    });

    writeStream.on('finish', async () => {
        if (aborted || res.headersSent) return;
        if (totalBytes === 0) {
            cleanupSrc();
            return res.status(400).json({ error: 'Empty video upload' });
        }
        try {
            await execFileAsync(
                'ffmpeg',
                [
                    '-y',
                    '-i',
                    srcPath,
                    '-c:v',
                    'libx264',
                    '-preset',
                    'ultrafast',
                    '-crf',
                    '24',
                    '-pix_fmt',
                    'yuv420p',
                    '-vf',
                    "scale='min(1280,iw)':-2",
                    '-c:a',
                    'aac',
                    '-b:a',
                    '128k',
                    '-movflags',
                    '+faststart',
                    outPath,
                ],
                { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }
            );
            cleanupSrc();
            return res.json({ uploadId: outId });
        } catch (err) {
            cleanupSrc();
            cleanupOut();
            console.error('Preview transcode failed:', err?.stderr || err?.message || err);
            return res.status(422).json({ error: 'Could not convert this video format for preview.' });
        }
    });

    req.pipe(writeStream);
});

app.post('/api/video/import-url', requireAuth, async (req, res) => {
    cleanupOldTempVideos();
    ensureVideoTmpDir();

    const rawUrl = String(req.body?.url || '').trim();
    if (!rawUrl) {
        return res.status(400).json({ error: 'Please enter a YouTube URL' });
    }

    let parsedUrl;
    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
    }

    const host = parsedUrl.hostname.toLowerCase();
    const isYouTube =
        host === 'youtu.be' ||
        host === 'youtube.com' ||
        host === 'www.youtube.com' ||
        host === 'm.youtube.com';

    if (!['http:', 'https:'].includes(parsedUrl.protocol) || !isYouTube) {
        return res.status(400).json({
            error: 'Please paste a valid YouTube link (youtube.com or youtu.be)',
        });
    }

    const uploadId = crypto.randomUUID();
    const filePath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
    const frameFiles = [];

    const cleanup = () => {
        try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch {
            // ignore
        }
        for (const f of frameFiles) {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch {
                // ignore
            }
        }
    };

    try {
        // Download up to 1080p Full HD MP4 via yt-dlp (capped at 500MB)
        const ytArgs = [
            '--no-playlist',
            '--no-warnings',
            '--max-filesize', '500M',
            '-f', 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best[ext=mp4]/best',
            '--merge-output-format', 'mp4',
            '--print', 'after_move:%(title)s',
            '-o', filePath,
            parsedUrl.toString(),
        ];

        const { stdout: ytOut } = await runWithVideoQueue(() =>
            execFileAsync('yt-dlp', ytArgs, {
                timeout: 180000,
                maxBuffer: 10 * 1024 * 1024,
            })
        );

        if (!fs.existsSync(filePath)) {
            throw new Error('Video could not be downloaded. It may exceed 500MB or be unavailable.');
        }

        const title =
            String(ytOut || '')
                .split(/\r?\n/)
                .map((s) => s.trim())
                .filter(Boolean)
                .pop() || 'YouTube Video';

        const stat = fs.statSync(filePath);

        // Probe exact duration & dimensions with ffprobe
        let duration = 60;
        let width = 1280;
        let height = 720;
        try {
            const { stdout: probeOut } = await execFileAsync('ffprobe', [
                '-v', 'error',
                '-select_streams', 'v:0',
                '-show_entries', 'stream=width,height:format=duration',
                '-of', 'json',
                filePath,
            ], { timeout: 20000 });
            const parsed = JSON.parse(probeOut || '{}');
            const parsedDur = Number(parsed?.format?.duration || 0);
            if (Number.isFinite(parsedDur) && parsedDur > 0) duration = parsedDur;
            const st = Array.isArray(parsed?.streams) ? parsed.streams[0] : null;
            if (st?.width) width = Number(st.width);
            if (st?.height) height = Number(st.height);
        } catch (probeErr) {
            console.warn('ffprobe warning on imported YouTube video:', probeErr?.message || probeErr);
        }

        // Extract 6-10 evenly spaced JPEG preview frames for AI viral moment detection
        const frameCount = Math.min(10, Math.max(6, Math.ceil(duration / 15)));
        const safeStart = duration > 2 ? 0.5 : 0;
        const safeSpan = Math.max(1, duration - safeStart - 0.5);
        const frames = [];

        for (let i = 0; i < frameCount; i++) {
            const ts = safeStart + (safeSpan * (i + 0.5)) / frameCount;
            const outImg = path.join(VIDEO_TMP_DIR, `yt_frame_${uploadId}_${i}.jpg`);
            frameFiles.push(outImg);
            try {
                await execFileAsync('ffmpeg', [
                    '-y',
                    '-ss', ts.toFixed(3),
                    '-i', filePath,
                    '-frames:v', '1',
                    '-vf', "scale='min(640,iw)':-2",
                    '-q:v', '4',
                    outImg,
                ], { timeout: 20000 });
                if (fs.existsSync(outImg)) {
                    const b64 = fs.readFileSync(outImg).toString('base64');
                    frames.push(`data:image/jpeg;base64,${b64}`);
                }
            } catch {
                // skip individual frame errors
            }
        }

        // Clean up temporary frame JPEGs (keep the downloaded MP4 for clipping!)
        for (const f of frameFiles) {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch {
                // ignore
            }
        }

        return res.json({
            uploadId,
            title,
            duration,
            width,
            height,
            size: stat.size,
            frames,
            previewUrl: `/api/video/stream/${uploadId}`,
        });
    } catch (err) {
        cleanup();
        const rawErr = String(err?.stderr || err?.message || 'YouTube import failed');
        console.error('YouTube import error:', rawErr.slice(0, 400));
        let friendly = 'Could not import that YouTube video. Try another public video or upload the MP4 directly.';
        if (/Sign in to confirm|bot|cookies/i.test(rawErr)) {
            friendly = 'YouTube temporarily blocked automated download for this video. Please download the MP4 and upload it directly.';
        } else if (/Private video|Video unavailable|members-only/i.test(rawErr)) {
            friendly = 'This YouTube video is private, members-only, or unavailable.';
        } else if (/max-filesize|File is larger/i.test(rawErr)) {
            friendly = 'This YouTube video exceeds the 500MB import limit. Please upload a shorter clip or local file.';
        }
        return res.status(400).json({ error: friendly });
    }
});

app.post('/api/video/extract-frames', requireAuth, (req, res) => {
    cleanupOldTempVideos();
    ensureVideoTmpDir();

    const startParam = Math.max(0, Number(req.query.start || 0) || 0);
    const endParam = Math.max(0, Number(req.query.end || 0) || 0);
    const frameCount = Math.min(8, Math.max(1, Number(req.query.count || 5) || 5));

    const jobId = crypto.randomUUID();
    const inputPath = path.join(VIDEO_TMP_DIR, `frames_in_${jobId}.bin`);
    const outFiles = [];
    const writeStream = fs.createWriteStream(inputPath);
    let totalBytes = 0;
    let aborted = false;

    const cleanupAll = () => {
        try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        } catch {
            // ignore
        }
        for (const f of outFiles) {
            try {
                if (fs.existsSync(f)) fs.unlinkSync(f);
            } catch {
                // ignore
            }
        }
    };

    req.on('data', (chunk) => {
        if (aborted) return;
        totalBytes += chunk.length;
        if (totalBytes > MAX_VIDEO_UPLOAD_BYTES) {
            aborted = true;
            writeStream.destroy();
            cleanupAll();
            if (!res.headersSent) {
                res.status(413).json({ error: 'Video file exceeds 5 GB limit' });
            }
            req.destroy();
        }
    });

    req.on('error', (err) => {
        aborted = true;
        writeStream.destroy();
        cleanupAll();
        if (!res.headersSent) {
            res.status(500).json({ error: `Video stream error: ${err.message}` });
        }
    });

    writeStream.on('error', (err) => {
        aborted = true;
        cleanupAll();
        if (!res.headersSent) {
            res.status(500).json({ error: `Disk write error: ${err.message}` });
        }
    });

    writeStream.on('finish', async () => {
        if (aborted || res.headersSent) return;
        if (totalBytes === 0) {
            cleanupAll();
            return res.status(400).json({ error: 'Empty video file' });
        }

        try {
            let duration = 0;
            try {
                const { stdout } = await execFileAsync('ffprobe', [
                    '-v', 'error',
                    '-show_entries', 'format=duration',
                    '-of', 'default=noprint_wrappers=1:nokey=1',
                    inputPath,
                ]);
                duration = Math.max(0, parseFloat(String(stdout || '').trim()) || 0);
            } catch {
                duration = endParam > startParam ? endParam : 10;
            }

            const safeDur = duration > 0 ? duration : 10;
            const effectiveStart = Math.min(startParam, Math.max(0, safeDur - 0.2));
            const effectiveEnd = endParam > effectiveStart ? Math.min(endParam, safeDur) : safeDur;
            const span = Math.max(0.1, effectiveEnd - effectiveStart);

            const frames = [];
            for (let i = 0; i < frameCount; i++) {
                const t = frameCount === 1
                    ? effectiveStart
                    : Math.min(Math.max(0, effectiveStart + (span * i) / (frameCount - 1)), Math.max(0, safeDur - 0.1));
                const outPath = path.join(VIDEO_TMP_DIR, `frame_${jobId}_${i}.jpg`);
                outFiles.push(outPath);

                try {
                    await execFileAsync('ffmpeg', [
                        '-y',
                        '-ss', t.toFixed(2),
                        '-i', inputPath,
                        '-frames:v', '1',
                        '-vf', 'scale=min(1024\\,iw):-2',
                        '-q:v', '4',
                        outPath,
                    ], { maxBuffer: 5 * 1024 * 1024 });

                    if (fs.existsSync(outPath)) {
                        const buf = fs.readFileSync(outPath);
                        if (buf.length > 500) {
                            const base64 = buf.toString('base64');
                            frames.push({
                                id: `srv_frame_${Date.now()}_${i}`,
                                base64,
                                mimeType: 'image/jpeg',
                                url: `data:image/jpeg;base64,${base64}`,
                            });
                        }
                    }
                } catch (frameErr) {
                    console.warn(`FFmpeg single frame ${i} failed:`, frameErr?.message);
                }
            }

            cleanupAll();
            if (frames.length === 0) {
                return res.status(422).json({ error: 'Could not decode any video frames from this file.' });
            }
            return res.json({ duration: safeDur, frames });
        } catch (err) {
            cleanupAll();
            console.error('Server extract-frames error:', err?.message || err);
            return res.status(500).json({ error: 'Failed to extract frames from video.' });
        }
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
        captionStyle = 'hormozi',
        captionPosition = 'bottom',
        cropMode = 'center',
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

    let outputWidth = 1080;
    let outputHeight = 1920;
    if (aspectRatio === '16:9') {
        outputWidth = 1920;
        outputHeight = 1080;
    } else if (aspectRatio === '1:1') {
        outputWidth = 1080;
        outputHeight = 1080;
    } else if (aspectRatio === '4:5') {
        outputWidth = 1080;
        outputHeight = 1350;
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
            assPath = await generateClipCaptionsAss(
                inputPath,
                start,
                duration,
                outputWidth,
                outputHeight,
                captionStyle,
                captionPosition
            );
        }

        const postFilters = [];
        if (assPath && fs.existsSync(assPath)) {
            const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            postFilters.push(`ass='${escapedAss}'`);
        }

        if (includeTransitions && duration >= 1.5) {
            // Keep instant hook at 0:00 (no black opening frame!) and apply smooth outro fade
            const fadeDur = 0.4;
            const fadeOutStart = Math.max(0, duration - fadeDur).toFixed(3);
            postFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeDur}`);
        }

        const postChain = postFilters.length > 0 ? `,${postFilters.join(',')}` : '';
        const normalizedCrop = String(cropMode || 'center').toLowerCase();
        const filterParts = [];

        if (normalizedCrop === 'split_podcast' && outputHeight > outputWidth) {
            // 2-Speaker Podcast Split-Screen: stack Left Speaker on top & Right Speaker on bottom with crisp seam divider
            const halfH = Math.floor(outputHeight / 2);
            filterParts.push(`[0:v]split=2[left_raw][right_raw]`);
            filterParts.push(
                `[left_raw]crop=iw/2:ih:0:0,scale=${outputWidth}:${halfH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outputWidth}:${halfH}[top_v]`
            );
            filterParts.push(
                `[right_raw]crop=iw/2:ih:iw/2:0,scale=${outputWidth}:${halfH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outputWidth}:${halfH}[bot_v]`
            );
            filterParts.push(
                `[top_v][bot_v]vstack=inputs=2,drawbox=x=0:y=${halfH - 2}:w=${outputWidth}:h=4:color=black@0.85:t=fill${postChain}[v]`
            );
        } else {
            let cropExpr = `crop=${outputWidth}:${outputHeight}`;
            if (normalizedCrop === 'left') {
                cropExpr = `crop=${outputWidth}:${outputHeight}:0:(ih-${outputHeight})/2`;
            } else if (normalizedCrop === 'right') {
                cropExpr = `crop=${outputWidth}:${outputHeight}:iw-${outputWidth}:(ih-${outputHeight})/2`;
            }
            const baseFilters = [
                `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase:flags=lanczos`,
                cropExpr,
                ...postFilters,
            ];
            filterParts.push(`[0:v]${baseFilters.join(',')}[v]`);
        }
        let useAudioFilter = false;
        if (audioAvailable && includeTransitions && duration >= 1.5) {
            const aFadeDur = 0.35;
            const aFadeOutStart = Math.max(0, duration - aFadeDur).toFixed(3);
            filterParts.push(`[0:a]afade=t=out:st=${aFadeOutStart}:d=${aFadeDur}[a]`);
            useAudioFilter = true;
        }

        const args = [
            '-y',
            '-threads', String(FFMPEG_THREADS_PER_JOB),
            '-ss', start.toFixed(3),
            '-i', inputPath,
            '-t', duration.toFixed(3),
            '-filter_complex', filterParts.join(';'),
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-r', String(targetFps),
            '-movflags', '+faststart',
        ];

        if (audioAvailable) {
            args.push('-map', useAudioFilter ? '[a]' : '0:a', '-c:a', 'aac', '-b:a', '192k');
        } else {
            args.push('-an');
        }

        args.push(outputPath);

        await runWithVideoQueue(() => execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 }));
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

// ==================== BACKGROUND QUEUED REPURPOSE JOBS + EMAIL NOTIFICATIONS ====================

async function renderClipToLibraryFile({
    inputPath,
    outputPath,
    startTime,
    endTime,
    aspectRatio = '9:16',
    fps = 30,
    includeAudio = true,
    includeTransitions = false,
    includeCaptions = false,
    captionStyle = 'hormozi',
    captionPosition = 'bottom',
    cropMode = 'center',
}) {
    const start = Math.max(0, Number(startTime) || 0);
    const end = Math.max(start + 1, Number(endTime) || start + 15);
    const duration = Math.max(1, end - start);

    let outputWidth = 1080;
    let outputHeight = 1920;
    if (aspectRatio === '16:9') {
        outputWidth = 1920;
        outputHeight = 1080;
    } else if (aspectRatio === '1:1') {
        outputWidth = 1080;
        outputHeight = 1080;
    } else if (aspectRatio === '4:5') {
        outputWidth = 1080;
        outputHeight = 1350;
    }

    const targetFps = Math.min(60, Math.max(15, Number(fps) || 30));
    let assPath = null;

    try {
        const audioAvailable = includeAudio !== false ? await hasAudioStream(inputPath) : false;

        if (includeCaptions && audioAvailable) {
            assPath = await generateClipCaptionsAss(
                inputPath,
                start,
                duration,
                outputWidth,
                outputHeight,
                captionStyle,
                captionPosition
            );
        }

        const postFilters = [];
        if (assPath && fs.existsSync(assPath)) {
            const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');
            postFilters.push(`ass='${escapedAss}'`);
        }

        if (includeTransitions && duration >= 1.5) {
            const fadeDur = 0.4;
            const fadeOutStart = Math.max(0, duration - fadeDur).toFixed(3);
            postFilters.push(`fade=t=out:st=${fadeOutStart}:d=${fadeDur}`);
        }

        const postChain = postFilters.length > 0 ? `,${postFilters.join(',')}` : '';
        const normalizedCrop = String(cropMode || 'center').toLowerCase();
        const filterParts = [];

        if (normalizedCrop === 'split_podcast' && outputHeight > outputWidth) {
            const halfH = Math.floor(outputHeight / 2);
            filterParts.push(`[0:v]split=2[left_raw][right_raw]`);
            filterParts.push(
                `[left_raw]crop=iw/2:ih:0:0,scale=${outputWidth}:${halfH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outputWidth}:${halfH}[top_v]`
            );
            filterParts.push(
                `[right_raw]crop=iw/2:ih:iw/2:0,scale=${outputWidth}:${halfH}:force_original_aspect_ratio=increase:flags=lanczos,crop=${outputWidth}:${halfH}[bot_v]`
            );
            filterParts.push(
                `[top_v][bot_v]vstack=inputs=2,drawbox=x=0:y=${halfH - 2}:w=${outputWidth}:h=4:color=black@0.85:t=fill${postChain}[v]`
            );
        } else {
            let cropExpr = `crop=${outputWidth}:${outputHeight}`;
            if (normalizedCrop === 'left') {
                cropExpr = `crop=${outputWidth}:${outputHeight}:0:(ih-${outputHeight})/2`;
            } else if (normalizedCrop === 'right') {
                cropExpr = `crop=${outputWidth}:${outputHeight}:iw-${outputWidth}:(ih-${outputHeight})/2`;
            }
            const baseFilters = [
                `scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase:flags=lanczos`,
                cropExpr,
                ...postFilters,
            ];
            filterParts.push(`[0:v]${baseFilters.join(',')}[v]`);
        }

        let useAudioFilter = false;
        if (audioAvailable && includeTransitions && duration >= 1.5) {
            const aFadeDur = 0.35;
            const aFadeOutStart = Math.max(0, duration - aFadeDur).toFixed(3);
            filterParts.push(`[0:a]afade=t=out:st=${aFadeOutStart}:d=${aFadeDur}[a]`);
            useAudioFilter = true;
        }

        const args = [
            '-y',
            '-threads', String(FFMPEG_THREADS_PER_JOB),
            '-ss', start.toFixed(3),
            '-i', inputPath,
            '-t', duration.toFixed(3),
            '-filter_complex', filterParts.join(';'),
            '-map', '[v]',
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-r', String(targetFps),
            '-movflags', '+faststart',
        ];

        if (audioAvailable) {
            args.push('-map', useAudioFilter ? '[a]' : '0:a', '-c:a', 'aac', '-b:a', '192k');
        } else {
            args.push('-an');
        }
        args.push(outputPath);

        await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });

        // Extract a crisp bright poster frame at 35% of the clip (avoids fade-in/out)
        let thumbnailDataUrl = '';
        const posterPath = path.join(VIDEO_TMP_DIR, `poster_${crypto.randomUUID()}.jpg`);
        try {
            const posterTs = Math.min(Math.max(0.5, duration * 0.35), Math.max(0.5, duration - 0.5));
            await execFileAsync('ffmpeg', [
                '-y',
                '-ss', posterTs.toFixed(3),
                '-i', outputPath,
                '-frames:v', '1',
                '-vf', "scale='min(540,iw)':-2",
                '-q:v', '3',
                posterPath,
            ], { timeout: 20000 });
            if (fs.existsSync(posterPath)) {
                thumbnailDataUrl = `data:image/jpeg;base64,${fs.readFileSync(posterPath).toString('base64')}`;
            }
        } catch {
            // optional poster
        } finally {
            try {
                if (fs.existsSync(posterPath)) fs.unlinkSync(posterPath);
            } catch {
                // ignore
            }
        }

        const stat = fs.statSync(outputPath);
        return {
            width: outputWidth,
            height: outputHeight,
            size: stat.size,
            duration,
            captionsApplied: Boolean(assPath),
            thumbnailDataUrl,
        };
    } finally {
        try {
            if (assPath && fs.existsSync(assPath)) fs.unlinkSync(assPath);
        } catch {
            // ignore
        }
    }
}

app.get('/api/repurpose/queue-status', requireAuth, (_req, res) => {
    return res.json({
        active: activeVideoJobs,
        queued: videoJobQueue.length,
        maxConcurrent: MAX_CONCURRENT_VIDEO_JOBS,
    });
});

app.get('/api/repurpose/jobs', requireAuth, async (req, res) => {
    try {
        const jobs = await RepurposeJob.find({ user_id: req.user.id })
            .sort({ created_at: -1 })
            .limit(8)
            .lean();
        return res.json({
            jobs,
            queue: {
                active: activeVideoJobs,
                queued: videoJobQueue.length,
                maxConcurrent: MAX_CONCURRENT_VIDEO_JOBS,
            },
        });
    } catch (err) {
        console.error('List repurpose jobs error:', err);
        return res.status(500).json({ error: 'Failed to load repurpose jobs' });
    }
});

app.get('/api/repurpose/jobs/:jobId', requireAuth, async (req, res) => {
    try {
        const job = await RepurposeJob.findOne({ id: req.params.jobId, user_id: req.user.id }).lean();
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }
        return res.json({
            job,
            queue: {
                active: activeVideoJobs,
                queued: videoJobQueue.length,
                maxConcurrent: MAX_CONCURRENT_VIDEO_JOBS,
            },
        });
    } catch (err) {
        console.error('Get repurpose job error:', err);
        return res.status(500).json({ error: 'Failed to check job status' });
    }
});

app.post('/api/repurpose/jobs', requireAuth, async (req, res) => {
    try {
        const {
            uploadId,
            originalTitle = 'Video Repurpose',
            clipSpecs = [],
            includeCaptions = false,
            captionStyle = 'hormozi',
            captionPosition = 'bottom',
            cropMode = 'center',
            includeTransitions = true,
            notifyByEmail = true,
        } = req.body || {};

        if (!isValidUploadId(uploadId)) {
            return res.status(400).json({ error: 'Invalid uploadId' });
        }

        const inputPath = path.join(VIDEO_TMP_DIR, `${uploadId}.mp4`);
        if (!fs.existsSync(inputPath)) {
            return res.status(404).json({ error: 'Uploaded video expired or not found. Please upload again.' });
        }

        if (!Array.isArray(clipSpecs) || clipSpecs.length === 0) {
            return res.status(400).json({ error: 'No clip specifications provided' });
        }

        const safeSpecs = clipSpecs.slice(0, 12);
        const creditCost = safeSpecs.length >= 6 ? 5 : 3;

        // Pre-check credits on the server so closing the tab can never leak credits
        const userCredits = await UserCredits.findOne({ user_id: req.user.id }).lean();
        if (!userCredits || Number(userCredits.balance || 0) < creditCost) {
            return res.status(402).json({
                error: `Insufficient credits. You need ${creditCost} credits to generate ${safeSpecs.length} clips.`,
            });
        }

        const userDoc = await User.findById(req.user.id).select('email full_name').lean();
        const userEmail = userDoc?.email || req.user.email || '';
        const userName = userDoc?.full_name || '';

        const jobId = `job_${crypto.randomUUID()}`;
        const estimatedQueuePos = activeVideoJobs >= MAX_CONCURRENT_VIDEO_JOBS ? videoJobQueue.length + 1 : 0;
        const nowIso = new Date().toISOString();

        await RepurposeJob.create({
            id: jobId,
            user_id: req.user.id,
            user_email: userEmail,
            original_title: String(originalTitle || 'Video Repurpose').slice(0, 140),
            upload_id: uploadId,
            status: estimatedQueuePos > 0 ? 'queued' : 'processing',
            queue_position: estimatedQueuePos,
            progress: estimatedQueuePos > 0 ? 5 : 10,
            status_text:
                estimatedQueuePos > 0
                    ? `In queue (position #${estimatedQueuePos}) — safe to close tab, we'll email you when ready!`
                    : `Starting 1080p HD encoding for ${safeSpecs.length} clip${safeSpecs.length === 1 ? '' : 's'}...`,
            notify_email: notifyByEmail !== false,
            email_sent: false,
            clips: [],
            created_at: nowIso,
            updated_at: nowIso,
        });

        // Fire-and-forget background worker inside the concurrency queue
        runWithVideoQueue(async () => {
            ensureLibraryDir();
            const finishedClips = [];

            await RepurposeJob.updateOne(
                { id: jobId },
                {
                    $set: {
                        status: 'processing',
                        queue_position: 0,
                        progress: 12,
                        status_text: `Encoding clip 1 of ${safeSpecs.length} in Full HD 1080p...`,
                        updated_at: new Date().toISOString(),
                    },
                }
            );

            for (let i = 0; i < safeSpecs.length; i++) {
                const spec = safeSpecs[i];
                const fileName = `${crypto.randomUUID()}.mp4`;
                const outputPath = path.join(LIBRARY_DIR, fileName);

                await RepurposeJob.updateOne(
                    { id: jobId },
                    {
                        $set: {
                            progress: Math.min(92, Math.round(15 + (i / safeSpecs.length) * 75)),
                            status_text: `Encoding clip ${i + 1} of ${safeSpecs.length} in Full HD 1080p${includeCaptions ? ' + AI Captions' : ''}...`,
                            updated_at: new Date().toISOString(),
                        },
                    }
                );

                const rendered = await renderClipToLibraryFile({
                    inputPath,
                    outputPath,
                    startTime: spec.startTime,
                    endTime: spec.endTime,
                    aspectRatio: spec.aspectRatio || '9:16',
                    fps: 30,
                    includeAudio: true,
                    includeTransitions,
                    includeCaptions,
                    captionStyle,
                    captionPosition,
                    cropMode,
                });

                const hookTitle = String(spec.hookTitle || spec.title || `Viral Clip ${i + 1}`).slice(0, 120);
                const workDoc = await UserWork.create({
                    user_id: req.user.id,
                    type: 'clip',
                    title: hookTitle,
                    platform: String(spec.platform || 'youtube_shorts').replace('_', ' '),
                    aspect_ratio: String(spec.aspectRatio || '9:16'),
                    mime_type: 'video/mp4',
                    file_name: fileName,
                    file_size: rendered.size,
                    expires_at: new Date(Date.now() + LIBRARY_TTL_MS),
                });

                finishedClips.push({
                    id: `clip_${workDoc._id.toString()}`,
                    library_work_id: workDoc._id.toString(),
                    repurposed_video_id: jobId,
                    clip_url: `/api/library/file/${workDoc._id.toString()}`,
                    clip_storage_path: fileName,
                    start_time: Number(spec.startTime) || 0,
                    end_time: Number(spec.endTime) || 15,
                    duration: rendered.duration,
                    virality_score: Number(spec.viralityScore) || 85,
                    engagement_score: Math.min(99, Number(spec.viralityScore) || 85),
                    title: hookTitle,
                    hook_title: hookTitle,
                    description: String(spec.socialCaption || ''),
                    hashtags: Array.isArray(spec.hashtags) ? spec.hashtags : ['#shorts', '#viral'],
                    thumbnail_url: rendered.thumbnailDataUrl || '',
                    transcript_snippet: String(spec.socialCaption || ''),
                    platform_format: spec.platform || 'youtube_shorts',
                    aspect_ratio: spec.aspectRatio || '9:16',
                    created_at: new Date().toISOString(),
                    metadata: {
                        frame_count: Math.ceil(rendered.duration * 30),
                        fps: 30,
                        resolution: `${rendered.width}x${rendered.height}`,
                        file_size: rendered.size,
                        audio_enabled: true,
                        captions_enabled: rendered.captionsApplied,
                        target_platforms: Array.isArray(spec.targetPlatforms) ? spec.targetPlatforms : [spec.platform || 'youtube_shorts'],
                    },
                });
            }

            // Deduct credits atomically on the server after clips succeed
            const actualCost = finishedClips.length >= 6 ? 5 : 3;
            const updatedCreds = await UserCredits.findOneAndUpdate(
                { user_id: req.user.id, balance: { $gte: actualCost } },
                { $inc: { balance: -actualCost, total_spent: actualCost } },
                { returnDocument: 'after' }
            );
            if (updatedCreds) {
                await CreditTransaction.create({
                    user_id: req.user.id,
                    transaction_type: 'usage',
                    amount: -actualCost,
                    description: `Content Repurpose (${finishedClips.length} clips)`,
                    reference_id: jobId,
                });
                await CreditUsage.create({
                    user_id: req.user.id,
                    feature_type: 'Content Repurpose',
                    credits_used: actualCost,
                    metadata: { feature: 'content_repurpose', clipCount: finishedClips.length, jobId },
                });
            }

            let emailSent = false;
            if (notifyByEmail !== false && userEmail) {
                try {
                    const emailRes = await sendClipsReadyEmail({
                        toEmail: userEmail,
                        fullName: userName,
                        originalTitle: String(originalTitle || ''),
                        clips: finishedClips,
                    });
                    emailSent = Boolean(emailRes?.sent);
                } catch (mailErr) {
                    console.warn('Clips ready email failed:', mailErr?.message || mailErr);
                }
            }

            await RepurposeJob.updateOne(
                { id: jobId },
                {
                    $set: {
                        status: 'completed',
                        queue_position: 0,
                        progress: 100,
                        status_text: `All ${finishedClips.length} Full HD clips are ready!`,
                        clips: finishedClips,
                        email_sent: emailSent,
                        completed_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                    },
                }
            );
        }).catch(async (jobErr) => {
            console.error(`Background repurpose job ${jobId} failed:`, jobErr?.message || jobErr);
            try {
                await RepurposeJob.updateOne(
                    { id: jobId },
                    {
                        $set: {
                            status: 'failed',
                            queue_position: 0,
                            status_text: 'Processing failed',
                            error_message: jobErr?.message || 'Failed to generate clips',
                            updated_at: new Date().toISOString(),
                        },
                    }
                );
            } catch {
                // ignore
            }
        });

        return res.status(202).json({
            jobId,
            status: estimatedQueuePos > 0 ? 'queued' : 'processing',
            queuePosition: estimatedQueuePos,
            activeJobs: activeVideoJobs,
            queuedJobs: videoJobQueue.length,
            notifyEmail: notifyByEmail !== false ? userEmail : '',
        });
    } catch (err) {
        console.error('Create repurpose job error:', err);
        return res.status(500).json({ error: err?.message || 'Failed to start repurpose job' });
    }
});

// ==================== PUBLIC FREE TRIAL AI RESIZE (PER-DEVICE + OFFICE IP CEILING) ====================

const PUBLIC_FREE_AI_RESIZE_LIMIT = 2;          // 2 free tries per unique physical device
const PUBLIC_FREE_AI_RESIZE_IP_DAILY_CAP = 12;  // Safety cap per Wi-Fi IP per 24h (allows ~6 coworkers on same office Wi-Fi)

async function countFreeTrialUses(tool, ip, fingerprint) {
    if (fingerprint) {
        const deviceUses = await FreeTrialUsage.countDocuments({ tool, fingerprint });
        if (deviceUses >= PUBLIC_FREE_AI_RESIZE_LIMIT) {
            return deviceUses;
        }
        // Check office-wide 24h IP safety ceiling so bots can't abuse fake fingerprints
        if (ip && ip !== 'unknown') {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const ipDailyUses = await FreeTrialUsage.countDocuments({
                tool,
                ip,
                created_at: { $gte: oneDayAgo },
            });
            if (ipDailyUses >= PUBLIC_FREE_AI_RESIZE_IP_DAILY_CAP) {
                return PUBLIC_FREE_AI_RESIZE_LIMIT;
            }
        }
        return deviceUses;
    }
    return FreeTrialUsage.countDocuments({ tool, ip });
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
            allUsages,
        ] = await Promise.all([
            User.find({}, { passwordHash: 0 }).sort({ created_at: -1 }).lean(),
            UserCredits.find({}).lean(),
            Payment.find({}).sort({ created_at: -1 }).limit(100).lean(),
            RepurposedVideo.countDocuments({}),
            ViralClip.countDocuments({}),
            FreeTrialUsage.find({}).sort({ created_at: -1 }).limit(100).lean(),
            NewsletterSubscriber.find({}).sort({ created_at: -1 }).limit(100).lean(),
            CreditUsage.find({}).sort({ created_at: -1 }).limit(2000).lean(),
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

        const classifyUsageActivity = (u) => {
            const p = String(u.platform || u.metadata?.platform || '').toLowerCase();
            const f = String(u.metadata?.feature || '').toLowerCase();
            const ft = String(u.feature_type || '').toLowerCase();

            if (p === 'youtube_improve') return { key: 'youtube_improve', label: 'Improve YouTube Thumbnail', icon: '✨' };
            if (p === 'youtube') return { key: 'youtube', label: 'YouTube Thumbnail', icon: '🎬' };
            if (p === 'podcast') return { key: 'podcast', label: 'Podcast Cover', icon: '🎙️' };
            if (p === 'tiktok') return { key: 'tiktok', label: 'TikTok / Shorts Cover', icon: '📱' };
            if (p === 'twitter_card' || p === 'twitter') return { key: 'twitter', label: 'Twitter / X Card', icon: '🐦' };
            if (p === 'resize') return { key: 'resize', label: 'Smart Image Resize', icon: '🪄' };
            if (f === 'content_repurpose' || ft === 'repurpose') return { key: 'repurpose', label: 'Video Repurpose (Viral Clips)', icon: '✂️' };
            if (f === 'image_generation' || ft === 'image_generation') return { key: 'image_generation', label: 'AI Image Generator', icon: '🖼️' };
            if (f === 'image_edit') return { key: 'image_edit', label: 'AI Image Edit', icon: '🖌️' };
            if (f === 'image_upscale') return { key: 'image_upscale', label: 'AI Image Upscale', icon: '🔍' };
            if (f === 'extract_faces') return { key: 'extract_faces', label: 'Video Face Extraction', icon: '👤' };
            if (f === 'analyze_video') return { key: 'analyze_video', label: 'Video Style Analysis', icon: '🧠' };
            if (f === 'video_generation' || ft === 'video_generation') return { key: 'video_generation', label: 'AI Video Generation', icon: '🎥' };
            if (ft === 'thumbnail') return { key: 'youtube', label: 'YouTube Thumbnail', icon: '🎬' };
            return { key: 'other', label: 'Other Studio Action', icon: '⚡' };
        };

        const activityMap = new Map();
        const recentActivity = [];
        let totalActivityRuns = 0;

        for (const u of allUsages) {
            const cat = classifyUsageActivity(u);
            totalActivityRuns += 1;
            let entry = activityMap.get(cat.key);
            if (!entry) {
                entry = {
                    key: cat.key,
                    label: cat.label,
                    icon: cat.icon,
                    runs: 0,
                    credits_used: 0,
                    userSet: new Set(),
                };
                activityMap.set(cat.key, entry);
            }
            entry.runs += 1;
            entry.credits_used += Number(u.credits_used || 0);
            if (u.user_id) entry.userSet.add(String(u.user_id));

            if (recentActivity.length < 100) {
                recentActivity.push({
                    id: String(u._id),
                    email: userEmailById.get(String(u.user_id)) || String(u.user_id || '-'),
                    activity_key: cat.key,
                    activity_label: cat.label,
                    activity_icon: cat.icon,
                    credits_used: Number(u.credits_used || 0),
                    created_at: u.created_at,
                });
            }
        }

        const activityBreakdown = Array.from(activityMap.values())
            .map((e) => ({
                key: e.key,
                label: e.label,
                icon: e.icon,
                runs: e.runs,
                unique_users: e.userSet.size,
                credits_used: e.credits_used,
                share_pct: totalActivityRuns > 0 ? Math.round((e.runs / totalActivityRuns) * 100) : 0,
            }))
            .sort((a, b) => b.runs - a.runs);

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
                total_activity_runs: totalActivityRuns,
            },
            activity_breakdown: activityBreakdown,
            recent_activity: recentActivity,
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

// ==================== AFFILIATE PROGRAM (30% RECURRING FOR 12 MONTHS) ====================

const AFFILIATE_COMMISSION_RATE = 0.3;
const AFFILIATE_WINDOW_DAYS = 365; // 12-month recurring commission cap per referred customer
const AFFILIATE_HOLD_DAYS = 14;    // 14-day refund hold before payout eligibility
const AFFILIATE_MIN_PAYOUT_CENTS = 2500; // $25 minimum payout

async function ensureUserAffiliateCode(userDoc) {
    if (!userDoc) return '';
    if (userDoc.affiliate_code) return userDoc.affiliate_code;
    const prefix =
        String(userDoc.email || 'CREVO')
            .split('@')[0]
            .replace(/[^a-zA-Z0-9]/g, '')
            .toUpperCase()
            .slice(0, 5) || 'CREVO';
    for (let attempt = 0; attempt < 6; attempt++) {
        const suffix = crypto.randomBytes(2).toString('hex').toUpperCase();
        const candidate = `${prefix}${suffix}`;
        try {
            const updated = await User.findByIdAndUpdate(
                userDoc._id,
                { $set: { affiliate_code: candidate } },
                { returnDocument: 'after' }
            );
            if (updated?.affiliate_code) return updated.affiliate_code;
        } catch (err) {
            if (err?.code !== 11000) throw err;
        }
    }
    return '';
}

async function resolveValidReferrer(rawCode, buyerEmail, buyerFingerprint) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code || code.length < 3 || code.length > 32) return null;
    const affiliate = await User.findOne({ affiliate_code: code }).lean();
    if (!affiliate) return null;

    // Anti-self-referral checks: block same email, same canonical email, or same hardware device fingerprint
    const buyerLower = String(buyerEmail || '').trim().toLowerCase();
    const buyerCanon = canonicalizeEmail(buyerLower);
    if (affiliate.email === buyerLower || (buyerCanon && affiliate.canonicalEmail === buyerCanon)) {
        return null;
    }
    if (buyerFingerprint && affiliate.deviceFingerprint && affiliate.deviceFingerprint === buyerFingerprint) {
        return null;
    }
    return affiliate;
}

async function recordAffiliateCommissionForPayment({ buyerUserId, stripePaymentId, amountCents, planName }) {
    if (!buyerUserId || !stripePaymentId || !amountCents || amountCents <= 0) return null;
    const buyer = await User.findById(buyerUserId).lean();
    if (!buyer || !buyer.referred_by_user_id) return null;
    if (buyer.referred_by_user_id === buyer._id.toString()) return null;

    // Enforce strict 12-month recurring commission cap per referred customer
    const refDate = buyer.referred_at ? new Date(buyer.referred_at).getTime() : new Date(buyer.created_at).getTime();
    const maxWindowMs = AFFILIATE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (!Number.isFinite(refDate) || Date.now() - refDate > maxWindowMs) {
        return null;
    }

    const affiliate = await User.findById(buyer.referred_by_user_id).lean();
    if (!affiliate) return null;

    const commissionCents = Math.round(Number(amountCents) * AFFILIATE_COMMISSION_RATE);
    if (commissionCents <= 0) return null;

    const eligibleAt = new Date(Date.now() + AFFILIATE_HOLD_DAYS * 24 * 60 * 60 * 1000);
    try {
        const doc = await AffiliateCommission.create({
            affiliate_user_id: affiliate._id.toString(),
            affiliate_code: affiliate.affiliate_code || buyer.referred_by_code || '',
            referred_user_id: buyer._id.toString(),
            referred_email: buyer.email,
            stripe_payment_id: String(stripePaymentId),
            plan_name: String(planName || 'Crevo AI Plan'),
            sale_amount_cents: Number(amountCents),
            commission_rate: AFFILIATE_COMMISSION_RATE,
            commission_cents: commissionCents,
            status: 'pending',
            eligible_at: eligibleAt,
        });

        sendAffiliateCommissionEmail({
            toEmail: affiliate.email,
            planName: String(planName || 'Crevo AI Plan'),
            saleAmountCents: Number(amountCents),
            commissionCents,
        }).catch(() => {});

        return doc;
    } catch (err) {
        if (err?.code === 11000) return null; // duplicate webhook idempotency
        console.error('Failed to record affiliate commission:', err?.message || err);
        return null;
    }
}

app.post('/api/affiliates/track-click', async (req, res) => {
    try {
        const code = String(req.body?.code || '').trim().toUpperCase();
        if (!code || code.length < 3 || code.length > 32) {
            return res.json({ tracked: false });
        }
        const affiliate = await User.findOne({ affiliate_code: code }).select('_id affiliate_code').lean();
        if (!affiliate) {
            return res.json({ tracked: false });
        }
        const ip = getClientIp(req);
        const fingerprint = getClientFingerprint(req);
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const existing = await AffiliateClick.findOne({
            code,
            ip,
            created_at: { $gte: oneDayAgo },
        }).lean();
        if (!existing) {
            await AffiliateClick.create({
                code,
                affiliate_user_id: affiliate._id.toString(),
                ip,
                fingerprint,
                landing_path: String(req.body?.landingPath || '/').slice(0, 120),
            });
        }
        return res.json({ tracked: true, code });
    } catch (err) {
        console.warn('Affiliate click track error:', err?.message || err);
        return res.json({ tracked: false });
    }
});

app.get('/api/affiliates/me', requireAuth, async (req, res) => {
    try {
        const userDoc = await User.findById(req.user.id);
        if (!userDoc) return res.status(404).json({ error: 'User not found' });

        const affiliateCode = await ensureUserAffiliateCode(userDoc);
        const userId = userDoc._id.toString();

        const [clicks, signups, commissions] = await Promise.all([
            AffiliateClick.countDocuments({ affiliate_user_id: userId }),
            User.countDocuments({ referred_by_user_id: userId }),
            AffiliateCommission.find({ affiliate_user_id: userId }).sort({ created_at: -1 }).limit(100).lean(),
        ]);

        const nowMs = Date.now();
        let pendingHoldCents = 0;
        let payableCents = 0;
        let paidCents = 0;
        let totalEarnedCents = 0;
        const paidUsersSet = new Set();

        for (const c of commissions) {
            if (c.status === 'void') continue;
            totalEarnedCents += Number(c.commission_cents || 0);
            if (c.referred_user_id) paidUsersSet.add(c.referred_user_id);
            if (c.status === 'paid') {
                paidCents += Number(c.commission_cents || 0);
            } else if (c.eligible_at && new Date(c.eligible_at).getTime() <= nowMs) {
                payableCents += Number(c.commission_cents || 0);
            } else {
                pendingHoldCents += Number(c.commission_cents || 0);
            }
        }

        const baseUrl = (process.env.FRONTEND_URL || 'https://crevo.app').replace(/\/$/, '');
        return res.json({
            affiliateCode,
            referralLink: `${baseUrl}/?ref=${affiliateCode}`,
            commissionRatePercent: Math.round(AFFILIATE_COMMISSION_RATE * 100),
            recurringMonths: 12,
            holdDays: AFFILIATE_HOLD_DAYS,
            minPayoutCents: AFFILIATE_MIN_PAYOUT_CENTS,
            payoutMethod: userDoc.affiliate_payout_method || 'paypal',
            payoutEmail: userDoc.affiliate_payout_email || '',
            payoutName: userDoc.affiliate_payout_name || '',
            stats: {
                clicks,
                signups,
                paidConversions: paidUsersSet.size,
                pendingHoldCents,
                payableCents,
                paidCents,
                totalEarnedCents,
            },
            commissions: commissions.map((c) => ({
                id: c._id.toString(),
                planName: c.plan_name,
                saleAmountCents: c.sale_amount_cents,
                commissionCents: c.commission_cents,
                status:
                    c.status === 'paid'
                        ? 'paid'
                        : c.status === 'void'
                          ? 'void'
                          : c.eligible_at && new Date(c.eligible_at).getTime() <= nowMs
                            ? 'payable'
                            : 'pending_hold',
                eligibleAt: c.eligible_at,
                paidAt: c.paid_at,
                createdAt: c.created_at,
            })),
        });
    } catch (err) {
        console.error('Get affiliate dashboard error:', err);
        return res.status(500).json({ error: 'Failed to load affiliate dashboard' });
    }
});

app.patch('/api/affiliates/code', requireAuth, async (req, res) => {
    try {
        const raw = String(req.body?.code || '').trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,24}$/.test(raw)) {
            return res.status(400).json({
                error: 'Code must be 3–24 characters using only letters, numbers, hyphens, or underscores.',
            });
        }
        const reserved = new Set(['ADMIN', 'SUPPORT', 'CREVO', 'BILLING', 'API', 'LOGIN', 'SIGNUP', 'AFFILIATES']);
        if (reserved.has(raw)) {
            return res.status(400).json({ error: 'That code is reserved. Please choose another name.' });
        }
        const existing = await User.findOne({ affiliate_code: raw, _id: { $ne: req.user.id } }).select('_id').lean();
        if (existing) {
            return res.status(409).json({ error: 'That referral code is already taken. Try adding a number or your channel name.' });
        }
        await User.findByIdAndUpdate(req.user.id, { $set: { affiliate_code: raw } });
        const baseUrl = (process.env.FRONTEND_URL || 'https://crevo.app').replace(/\/$/, '');
        return res.json({
            ok: true,
            affiliateCode: raw,
            referralLink: `${baseUrl}/?ref=${raw}`,
        });
    } catch (err) {
        if (err?.code === 11000) {
            return res.status(409).json({ error: 'That referral code is already taken.' });
        }
        console.error('Update affiliate code error:', err);
        return res.status(500).json({ error: 'Failed to update referral code' });
    }
});

app.patch('/api/affiliates/payout-settings', requireAuth, async (req, res) => {
    try {
        const method = String(req.body?.payoutMethod || 'paypal').trim().toLowerCase();
        const payoutEmail = String(req.body?.payoutEmail || '').trim().toLowerCase();
        const payoutName = String(req.body?.payoutName || '').trim().slice(0, 100);
        if (!['paypal', 'wise'].includes(method)) {
            return res.status(400).json({ error: 'Payout method must be PayPal or Wise' });
        }
        if (!payoutEmail || !payoutEmail.includes('@')) {
            return res.status(400).json({ error: 'Please enter a valid payout email address' });
        }
        await User.findByIdAndUpdate(req.user.id, {
            $set: {
                affiliate_payout_method: method,
                affiliate_payout_email: payoutEmail,
                affiliate_payout_name: payoutName,
            },
        });
        return res.json({ ok: true, payoutMethod: method, payoutEmail, payoutName });
    } catch (err) {
        console.error('Update affiliate payout settings error:', err);
        return res.status(500).json({ error: 'Failed to save payout settings' });
    }
});

app.get('/api/admin/affiliates', requireAdmin, async (_req, res) => {
    try {
        const nowMs = Date.now();
        const [affiliates, allCommissions, clicksAgg, signupsAgg] = await Promise.all([
            User.find({ affiliate_code: { $exists: true, $ne: '' } })
                .select('email affiliate_code affiliate_payout_method affiliate_payout_email affiliate_payout_name created_at')
                .lean(),
            AffiliateCommission.find().sort({ created_at: -1 }).limit(300).lean(),
            AffiliateClick.aggregate([{ $group: { _id: '$affiliate_user_id', clicks: { $sum: 1 } } }]),
            User.aggregate([
                { $match: { referred_by_user_id: { $ne: '' } } },
                { $group: { _id: '$referred_by_user_id', signups: { $sum: 1 } } },
            ]),
        ]);

        const clickMap = new Map(clicksAgg.map((x) => [String(x._id), x.clicks]));
        const signupMap = new Map(signupsAgg.map((x) => [String(x._id), x.signups]));
        const commByAff = new Map();
        for (const c of allCommissions) {
            const list = commByAff.get(c.affiliate_user_id) || [];
            list.push(c);
            commByAff.set(c.affiliate_user_id, list);
        }

        const rows = affiliates
            .map((u) => {
                const uid = u._id.toString();
                const list = commByAff.get(uid) || [];
                let pendingHoldCents = 0;
                let payableCents = 0;
                let paidCents = 0;
                for (const c of list) {
                    if (c.status === 'void') continue;
                    if (c.status === 'paid') paidCents += c.commission_cents;
                    else if (c.eligible_at && new Date(c.eligible_at).getTime() <= nowMs) payableCents += c.commission_cents;
                    else pendingHoldCents += c.commission_cents;
                }
                return {
                    userId: uid,
                    email: u.email,
                    payoutName: u.affiliate_payout_name || '',
                    affiliateCode: u.affiliate_code,
                    payoutMethod: u.affiliate_payout_method || 'paypal',
                    payoutEmail: u.affiliate_payout_email || '',
                    clicks: clickMap.get(uid) || 0,
                    signups: signupMap.get(uid) || 0,
                    salesCount: list.filter((c) => c.status !== 'void').length,
                    pendingHoldCents,
                    payableCents,
                    paidCents,
                    totalEarnedCents: pendingHoldCents + payableCents + paidCents,
                };
            })
            .sort((a, b) => b.payableCents - a.payableCents || b.totalEarnedCents - a.totalEarnedCents || b.signups - a.signups);

        return res.json({
            affiliates: rows,
            summary: {
                totalAffiliates: rows.length,
                totalPayableCents: rows.reduce((s, r) => s + r.payableCents, 0),
                totalPendingHoldCents: rows.reduce((s, r) => s + r.pendingHoldCents, 0),
                totalPaidCents: rows.reduce((s, r) => s + r.paidCents, 0),
            },
        });
    } catch (err) {
        console.error('Admin affiliates error:', err);
        return res.status(500).json({ error: 'Failed to load affiliates overview' });
    }
});

app.post('/api/admin/affiliates/:userId/mark-paid', requireAdmin, async (req, res) => {
    try {
        const targetUserId = String(req.params.userId || '').trim();
        const note = String(req.body?.note || 'Monthly affiliate payout').slice(0, 140);
        const includeHold = req.body?.includeHold === true;
        const query = {
            affiliate_user_id: targetUserId,
            status: 'pending',
            ...(includeHold ? {} : { eligible_at: { $lte: new Date() } }),
        };
        const result = await AffiliateCommission.updateMany(query, {
            $set: {
                status: 'paid',
                paid_at: new Date(),
                payout_note: note,
            },
        });
        return res.json({ ok: true, markedPaidCount: result.modifiedCount || 0 });
    } catch (err) {
        console.error('Admin mark affiliate paid error:', err);
        return res.status(500).json({ error: 'Failed to mark commissions as paid' });
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
    '/privacy': {
        title: 'Privacy Policy | Crevo AI',
        description: 'Learn how Crevo AI protects your account, local video processing, and 7-day temporary cloud work library.',
    },
    '/terms': {
        title: 'Terms of Service | Crevo AI',
        description: 'Crevo AI terms of service covering credits, Stripe subscriptions, commercial ownership, and acceptable use.',
    },
    '/contact': {
        title: 'Contact Crevo AI Support & Sales',
        description: 'Contact the Crevo AI team for creator support, billing help, or agency inquiries.',
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
    app.use('/assets', express.static(path.join(distDir, 'assets'), {
        maxAge: '1y',
        immutable: true,
        fallthrough: true,
    }));
    // Never return index.html for missing hashed JS/CSS chunks (prevents MIME-type crashes after deploys)
    app.get(/^\/assets\/.*/, (_req, res) => {
        return res.status(404).type('text/plain').send('Asset not found');
    });
    app.use(express.static(distDir, { index: false }));
    app.get(/^(?!\/api\/).*/, (req, res) => {
        if (!cachedIndexHtml && fs.existsSync(indexHtmlPath)) {
            cachedIndexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
        }
        if (!cachedIndexHtml) {
            return res.status(404).send('Not found');
        }

        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

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

        // Ensure live Crevo AI Stripe credit packs exist in MongoDB
        const defaultPacks = [
            {
                stripe_price_id: process.env.STRIPE_PRICE_PAYG || 'price_1UfkBAELJu3kIHjxxWOcwsh0',
                name: 'Pay As You Go',
                credits: 35,
                price_cents: 900,
                active: true,
            },
            {
                stripe_price_id: process.env.STRIPE_PRICE_PRO || 'price_1UfkBBELJu3kIHjxvfZceTS4',
                name: 'Pro Plan',
                credits: 200,
                price_cents: 2900,
                active: true,
            },
            {
                stripe_price_id: process.env.STRIPE_PRICE_ENTERPRISE || 'price_1UfkBCELJu3kIHjxPeUkdZJp',
                name: 'Enterprise Plan',
                credits: 1000,
                price_cents: 9900,
                active: true,
            },
        ];
        for (const pack of defaultPacks) {
            await CreditPack.findOneAndUpdate(
                { stripe_price_id: pack.stripe_price_id },
                { $set: pack },
                { upsert: true, new: true }
            );
        }
        console.log('✅ Synced live Stripe CreditPacks in MongoDB');
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

    // Monitor OpenRouter balance on startup and every 15 minutes (alerts when < $2.00)
    checkOpenRouterLowBalance();
    setInterval(checkOpenRouterLowBalance, 15 * 60 * 1000);
}

const OPENROUTER_LOW_BALANCE_THRESHOLD_USD = Number(process.env.OPENROUTER_LOW_BALANCE_USD || 2);
const OPENROUTER_ALERT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // Repeat at most once every 6 hours while still low
let lastOpenRouterLowAlertAt = 0;

async function fetchOpenRouterBalance() {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return { configured: false, error: 'OPENROUTER_API_KEY is not configured' };
    }
    const headers = { Authorization: `Bearer ${apiKey}` };
    const [creditsResp, keyResp] = await Promise.all([
        fetch('https://openrouter.ai/api/v1/credits', { headers }),
        fetch('https://openrouter.ai/api/v1/auth/key', { headers }).catch(() => null),
    ]);
    if (!creditsResp.ok) {
        throw new Error(`OpenRouter credits API returned ${creditsResp.status}`);
    }
    const creditsJson = await creditsResp.json();
    const totalCreditsUsd = Number(creditsJson?.data?.total_credits || 0);
    const totalUsageUsd = Number(creditsJson?.data?.total_usage || 0);
    const remainingUsd = Math.max(0, Number((totalCreditsUsd - totalUsageUsd).toFixed(4)));

    let dailyUsageUsd = 0;
    let keyTotalUsageUsd = 0;
    if (keyResp && keyResp.ok) {
        const keyJson = await keyResp.json().catch(() => ({}));
        dailyUsageUsd = Number(keyJson?.data?.usage_daily || 0);
        keyTotalUsageUsd = Number(keyJson?.data?.usage || 0);
    }

    return {
        configured: true,
        remainingUsd,
        totalCreditsUsd,
        totalUsageUsd,
        dailyUsageUsd,
        keyTotalUsageUsd,
        thresholdUsd: OPENROUTER_LOW_BALANCE_THRESHOLD_USD,
        isLow: remainingUsd < OPENROUTER_LOW_BALANCE_THRESHOLD_USD,
        checkedAt: new Date().toISOString(),
    };
}

async function checkOpenRouterLowBalance() {
    try {
        const info = await fetchOpenRouterBalance();
        if (!info.configured) return;

        if (info.remainingUsd < info.thresholdUsd) {
            const now = Date.now();
            if (now - lastOpenRouterLowAlertAt >= OPENROUTER_ALERT_COOLDOWN_MS) {
                lastOpenRouterLowAlertAt = now;
                console.warn(
                    `⚠️ OpenRouter balance low: $${info.remainingUsd.toFixed(2)} (threshold $${info.thresholdUsd.toFixed(2)}). Sending alert email...`
                );
                await sendOpenRouterLowBalanceAlert(info);
            }
        } else {
            // Reset cooldown once topped up above threshold
            lastOpenRouterLowAlertAt = 0;
        }
    } catch (err) {
        console.warn('OpenRouter balance check failed:', err?.message || err);
    }
}

app.get('/api/admin/openrouter-balance', requireAdmin, async (_req, res) => {
    try {
        const info = await fetchOpenRouterBalance();
        return res.json(info);
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to check OpenRouter balance' });
    }
});

// ==================== Saved Face & Brand Kit ====================
app.get('/api/user/brand-kit', requireAuth, async (req, res) => {
    try {
        const userDoc = await User.findById(req.user.id).select('brand_kit').lean();
        return res.json({ brandKit: userDoc?.brand_kit || null });
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to load Brand Kit' });
    }
});

app.put('/api/user/brand-kit', requireAuth, async (req, res) => {
    try {
        const body = req.body || {};
        const rawFaces = Array.isArray(body.face_images) ? body.face_images.slice(0, 3) : [];
        const face_images = [];
        for (const f of rawFaces) {
            const dataUrl = typeof f?.data_url === 'string' ? f.data_url.trim() : '';
            if (!dataUrl.startsWith('data:image/') || dataUrl.length > 900_000) continue;
            face_images.push({
                id: String(f.id || `bk_face_${face_images.length + 1}`).slice(0, 64),
                label: String(f.label || `Face ${face_images.length + 1}`).slice(0, 40),
                data_url: dataUrl,
                mime_type: String(f.mime_type || 'image/jpeg').slice(0, 40),
            });
        }

        const rawLogo = typeof body.logo_data_url === 'string' ? body.logo_data_url.trim() : '';
        const logo_data_url = rawLogo.startsWith('data:image/') && rawLogo.length <= 600_000 ? rawLogo : '';

        const safeColors = {
            primary: typeof body?.colors?.primary === 'string' ? body.colors.primary.slice(0, 20) : '',
            secondary: typeof body?.colors?.secondary === 'string' ? body.colors.secondary.slice(0, 20) : '',
            accent: typeof body?.colors?.accent === 'string' ? body.colors.accent.slice(0, 20) : '',
            background: typeof body?.colors?.background === 'string' ? body.colors.background.slice(0, 20) : '',
        };

        const brand_kit = {
            channel_name: typeof body.channel_name === 'string' ? body.channel_name.trim().slice(0, 60) : '',
            face_images,
            logo_data_url,
            logo_position: typeof body.logo_position === 'string' ? body.logo_position.slice(0, 24) : 'top-right',
            colors: safeColors,
            preferred_style: typeof body.preferred_style === 'string' ? body.preferred_style.slice(0, 60) : '',
            updated_at: new Date(),
        };

        await User.findByIdAndUpdate(req.user.id, { $set: { brand_kit } });
        return res.json({ brandKit: brand_kit });
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to save Brand Kit' });
    }
});

app.delete('/api/user/brand-kit', requireAuth, async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user.id, {
            $set: {
                brand_kit: {
                    channel_name: '',
                    face_images: [],
                    logo_data_url: '',
                    logo_position: 'top-right',
                    colors: { primary: '', secondary: '', accent: '', background: '' },
                    preferred_style: '',
                    updated_at: null,
                },
            },
        });
        return res.json({ ok: true });
    } catch (err) {
        return res.status(500).json({ error: err?.message || 'Failed to clear Brand Kit' });
    }
});

start();
