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
} from './models.js';
import { signToken, requireAuth } from './authMiddleware.js';
import { generateWithOpenRouter } from './openrouter.js';

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
                    description: `Purchased ${credits} credits`,
                    reference_id: session.id,
                    metadata: session.metadata || {},
                });

                await Payment.create({
                    user_id: userId,
                    stripe_session_id: session.id,
                    amount_cents: session.amount_total || 0,
                    credits,
                    status: 'completed',
                    credit_packs: {
                        name: session.metadata?.pack_name || `${credits} Credits`,
                        credits,
                        price_cents: session.amount_total || 0,
                    },
                });
            } catch (err) {
                console.error('Failed to process completed checkout session:', err);
            }
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
        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await User.create({
            email: normalizedEmail,
            passwordHash,
        });

        await UserCredits.create({
            user_id: user._id.toString(),
            balance: 0,
            total_earned: 0,
            total_spent: 0,
        });

        const token = signToken(user);
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
        const origin = req.headers.origin || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            customer_email: req.user.email,
            client_reference_id: req.user.id,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${origin}/dashboard/credits?payment=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${origin}/dashboard/credits?payment=cancelled`,
            metadata: {
                user_id: req.user.id,
                credits: String(pack?.credits || 0),
                pack_name: pack?.name || '',
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
        return res.json({ ok: true });
    } catch (err) {
        console.error('Newsletter subscribe error:', err);
        return res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// ==================== NATIVE FFMPEG VIDEO CLIPPING ====================

const execFileAsync = promisify(execFile);
const VIDEO_TMP_DIR = path.join(os.tmpdir(), 'revo3-videos');
const MAX_VIDEO_UPLOAD_BYTES = 600 * 1024 * 1024; // 600 MB
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
                res.status(413).json({ error: 'Video file exceeds 600 MB limit' });
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
    const filterComplex = `[0:v]scale=${outputWidth}:${outputHeight}:force_original_aspect_ratio=increase,crop=${outputWidth}:${outputHeight}[v]`;

    const args = [
        '-y',
        '-ss', start.toFixed(3),
        '-i', inputPath,
        '-t', duration.toFixed(3),
        '-filter_complex', filterComplex,
        '-map', '[v]',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-r', String(targetFps),
        '-movflags', '+faststart',
    ];

    if (includeAudio !== false) {
        args.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
    } else {
        args.push('-an');
    }

    args.push(outputPath);

    const removeOutput = () => {
        try {
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        } catch {
            // ignore
        }
    };

    try {
        await execFileAsync('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024 });
        const stat = fs.statSync(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', String(stat.size));
        res.setHeader('X-Clip-Width', String(outputWidth));
        res.setHeader('X-Clip-Height', String(outputHeight));
        const readStream = fs.createReadStream(outputPath);
        readStream.on('close', removeOutput);
        readStream.on('error', (err) => {
            removeOutput();
            if (!res.headersSent) {
                res.status(500).json({ error: `Failed to stream clip: ${err.message}` });
            }
        });
        return readStream.pipe(res);
    } catch (err) {
        removeOutput();
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

// ==================== PRODUCTION STATIC FRONTEND ====================

const distDir = path.join(rootDir, 'dist');
if (fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get(/^(?!\/api\/).*/, (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
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

    app.listen(PORT, () => {
        console.log(`🚀 API server running on http://localhost:${PORT}`);
    });
}

start();
