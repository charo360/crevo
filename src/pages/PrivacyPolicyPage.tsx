import React, { FC } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';

export const PrivacyPolicyPage: FC = () => {
    return (
        <div className="landing-page">
            <Navbar />
            <main style={{ maxWidth: '820px', margin: '0 auto', padding: '110px 20px 72px', color: '#1f2937', lineHeight: 1.75 }}>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#111827', marginBottom: '8px' }}>Privacy Policy</h1>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>Last updated: November 2026 · Crevo AI (crevo.app)</p>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>1. Information We Collect</h2>
                    <p>
                        When you create an account on Crevo AI (via email or Continue with Google), we collect your email address and account usage metadata
                        (such as credit balance, generation history, and subscription status). When you make a purchase, payments are processed securely by
                        <strong> Stripe</strong> — Crevo AI never stores your full credit card number.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>2. Uploaded Media &amp; 7-Day Cloud Library</h2>
                    <p>
                        For thumbnail creation, videos you open in the Studio are processed locally in your browser to extract key frames — your full video file
                        is never uploaded for thumbnail generation. For Video Repurposing and generated thumbnails/clips saved to your Cloud Work Library,
                        files are stored privately for your account and automatically deleted after <strong>7 days</strong>.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>3. How We Use Your Data</h2>
                    <ul style={{ paddingLeft: '20px' }}>
                        <li>To authenticate your account and protect against spam or multi-account abuse.</li>
                        <li>To generate AI thumbnails, smart image resizes, transcripts, and viral short clips at your request.</li>
                        <li>To deliver transactional emails (welcome messages, receipts, password resets, and billing notices).</li>
                    </ul>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>4. Third-Party Services</h2>
                    <p>
                        We rely on trusted infrastructure providers including Google (optional Google Sign-In), Stripe (billing &amp; subscriptions),
                        and AI model providers strictly to fulfill your requested generations. We never sell your personal information or creative assets.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>5. Your Rights &amp; Contact</h2>
                    <p>
                        You may delete your saved library items at any time from your dashboard, or request full account deletion by emailing{' '}
                        <a href="mailto:sam@crevo.app" style={{ color: '#571c86', fontWeight: 600 }}>sam@crevo.app</a> or using our{' '}
                        <Link to="/contact" style={{ color: '#571c86', fontWeight: 600 }}>Contact page</Link>.
                    </p>
                </section>
            </main>
            <Footer />
        </div>
    );
};
