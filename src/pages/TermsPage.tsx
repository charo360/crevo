import React, { FC } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';

export const TermsPage: FC = () => {
    return (
        <div className="landing-page">
            <Navbar />
            <main style={{ maxWidth: '820px', margin: '0 auto', padding: '110px 20px 72px', color: '#1f2937', lineHeight: 1.75 }}>
                <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#111827', marginBottom: '8px' }}>Terms of Service</h1>
                <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '28px' }}>Last updated: November 2026 · Crevo AI (crevo.app)</p>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>1. Acceptance of Terms</h2>
                    <p>
                        By accessing or using Crevo AI (<strong>https://crevo.app</strong>), you agree to these Terms of Service. If you do not agree,
                        please do not use the platform.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>2. Credits, Subscriptions &amp; Billing</h2>
                    <ul style={{ paddingLeft: '20px' }}>
                        <li>New accounts receive 6 free starter credits to evaluate Crevo AI.</li>
                        <li><strong>Pay As You Go</strong> credit packs are one-time purchases with no recurring charges.</li>
                        <li><strong>Pro</strong> and <strong>Enterprise</strong> plans are billed monthly via Stripe and renew automatically until cancelled.</li>
                        <li>You can manage payment methods or cancel your subscription anytime from <strong>Dashboard → Credits → Manage Subscription</strong>.</li>
                    </ul>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>3. Ownership of Your Content</h2>
                    <p>
                        You retain full ownership of the videos, images, and prompts you upload, as well as the commercial rights to thumbnails,
                        resized graphics, and short clips you generate using Crevo AI. You are responsible for ensuring you have rights to any source media you upload.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>4. Acceptable Use</h2>
                    <p>
                        You agree not to abuse free trial limits, create multiple automated accounts to farm free credits, attempt to bypass rate limits,
                        or generate unlawful, infringing, or harmful content.
                    </p>
                </section>

                <section style={{ marginBottom: '24px' }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>5. Support &amp; Contact</h2>
                    <p>
                        Questions about billing, refunds, or your account? Email{' '}
                        <a href="mailto:sam@crevo.app" style={{ color: '#571c86', fontWeight: 600 }}>sam@crevo.app</a> or reach out via our{' '}
                        <Link to="/contact" style={{ color: '#571c86', fontWeight: 600 }}>Contact page</Link>.
                    </p>
                </section>
            </main>
            <Footer />
        </div>
    );
};
