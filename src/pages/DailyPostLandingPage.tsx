import React, { FC, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';

const DAILY_POST_FAQS = [
    {
        q: 'Will my Daily Social Post look like me and not AI?',
        a: 'Yes. Save 3 clear reference photos once in My Face & Brand Kit (front face, smile/angle, upper body). Crevo AI locks 100% of your real face, skin texture, and body proportions with DSLR camera realism—and runs an automatic Vision Quality Audit before delivering the final photo.',
    },
    {
        q: 'Which social media platforms and sizes are supported?',
        a: 'Crevo Daily Post supports Instagram Portrait (4:5), Facebook (4:5), Square (1:1), LinkedIn (1:1), X / Twitter (16:9), Stories & Reels (9:16), and YouTube Community (1:1)—each paired with platform-tailored human captions and hashtags.',
    },
    {
        q: 'Can I change my outfit or match a pose from another photo?',
        a: 'Yes! Use the optional Outfit Switcher to keep your photo outfit, let AI design a fresh topic-appropriate outfit, or type a custom outfit. You can also upload a reference photo and choose exactly what to copy (Pose, Background, Style, or Outfit) while keeping your real face 100% protected.',
    },
    {
        q: 'How many free Daily Posts can I try?',
        a: 'Every new Crevo AI account starts with 6 free starter credits (2 credits per Daily Post), with 1-click Google Sign-In and no credit card required.',
    },
];

export const DailyPostLandingPage: FC = () => {
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'daily-post-faq-jsonld';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: DAILY_POST_FAQS.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
        });
        document.head.appendChild(script);
        return () => {
            document.getElementById('daily-post-faq-jsonld')?.remove();
        };
    }, []);

    return (
        <div style={{ minHeight: '100vh', background: '#faf8fd', color: '#111827' }}>
            <Navbar />
            <main style={{ maxWidth: '1080px', margin: '0 auto', padding: '56px 20px 88px' }}>
                {/* Hero */}
                <section style={{ textAlign: 'center', maxWidth: '780px', margin: '0 auto 56px' }}>
                    <span
                        style={{
                            display: 'inline-block',
                            padding: '5px 14px',
                            borderRadius: '999px',
                            background: '#f3e8ff',
                            color: '#571c86',
                            fontSize: '12px',
                            fontWeight: 800,
                            letterSpacing: '0.04em',
                            marginBottom: '14px',
                        }}
                    >
                        AI DAILY SOCIAL POST GENERATOR · INSTAGRAM, FACEBOOK, LINKEDIN &amp; X
                    </span>
                    <h1 style={{ fontSize: 'clamp(32px, 5vw, 50px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 16px' }}>
                        Create Real-Camera Daily Social Posts in 15 Seconds
                    </h1>
                    <p style={{ fontSize: '17px', color: '#4b5563', lineHeight: 1.6, margin: '0 0 28px' }}>
                        Post every day with confidence. Crevo AI generates natural DSLR-style photos using{' '}
                        <strong>your exact real face and body</strong>, lets you switch outfits in 1 tap, and writes{' '}
                        <strong>cliché-free human captions &amp; hashtags</strong> ready to copy and share.
                    </p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <Link
                            to="/signup"
                            style={{
                                padding: '14px 26px',
                                borderRadius: '12px',
                                background: 'linear-gradient(135deg, #571c86 0%, #7e22ce 100%)',
                                color: '#ffffff',
                                fontWeight: 800,
                                fontSize: '15px',
                                textDecoration: 'none',
                                boxShadow: '0 10px 24px rgba(87, 28, 134, 0.25)',
                            }}
                        >
                            Create Today&apos;s Post Free (6 Credits) →
                        </Link>
                        <Link
                            to="/photo-retouch"
                            style={{
                                padding: '14px 22px',
                                borderRadius: '12px',
                                border: '1.5px solid #d8ccf0',
                                background: '#ffffff',
                                color: '#571c86',
                                fontWeight: 700,
                                fontSize: '15px',
                                textDecoration: 'none',
                            }}
                        >
                            Or Try AI Photo Retouch →
                        </Link>
                    </div>
                </section>

                {/* Feature Grid */}
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '56px' }}>
                    {[
                        {
                            icon: '📸',
                            title: '100% Real-Camera Photography',
                            desc: 'Natural 50mm DSLR skin texture, real lighting, and candid poses — zero plastic AI look so friends and followers see the real you.',
                        },
                        {
                            icon: '⭐',
                            title: 'Named Characters (3 Photos Each)',
                            desc: 'Save up to 6 characters (yourself, co-hosts, or guests) at crisp 1024px resolution so Crevo locks onto your exact face and body every time.',
                        },
                        {
                            icon: '👕',
                            title: '1-Tap AI & Custom Outfits',
                            desc: 'Keep the clothes from your photo, let AI design a fresh outfit that fits today’s topic, or type any custom outfit you want.',
                        },
                        {
                            icon: '🎯',
                            title: 'Match Any Reference Pose or Style',
                            desc: 'Upload any inspiration photo and choose exactly what to copy (Pose, Background, Style, or Outfit) with 2-step Vision Shot-Sheet extraction.',
                        },
                        {
                            icon: '🎨',
                            title: '6 Agency Text Design Styles',
                            desc: 'Want text on your post? Pick Magazine Cover, Bold Viral Hook, Luxury Minimal, Editorial Quote, or Frosted Glass Bar — or leave blank for pure photography.',
                        },
                        {
                            icon: '✍️',
                            title: 'Niche-Aware Human Captions',
                            desc: 'Generates varied, realistic captions and hashtags tailored to your bio and platform — plus 1-click AI Edit and HD Upscale.',
                        },
                    ].map((card) => (
                        <div
                            key={card.title}
                            style={{
                                background: '#ffffff',
                                borderRadius: '16px',
                                border: '1px solid #e4dcf2',
                                padding: '22px',
                                boxShadow: '0 4px 16px rgba(87, 28, 134, 0.04)',
                            }}
                        >
                            <div style={{ fontSize: '28px', marginBottom: '10px' }}>{card.icon}</div>
                            <h2 style={{ margin: '0 0 8px', fontSize: '17px', fontWeight: 800 }}>{card.title}</h2>
                            <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.55 }}>{card.desc}</p>
                        </div>
                    ))}
                </section>

                {/* FAQ */}
                <section style={{ maxWidth: '820px', margin: '0 auto 48px' }}>
                    <h2 style={{ fontSize: '26px', fontWeight: 900, textAlign: 'center', marginBottom: '22px' }}>
                        Frequently Asked Questions
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {DAILY_POST_FAQS.map((faq) => (
                            <div
                                key={faq.q}
                                style={{
                                    background: '#ffffff',
                                    borderRadius: '14px',
                                    border: '1px solid #e4dcf2',
                                    padding: '18px 20px',
                                }}
                            >
                                <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#111827' }}>{faq.q}</h3>
                                <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>{faq.a}</p>
                            </div>
                        ))}
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
};
