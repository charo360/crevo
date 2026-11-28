import React, { FC, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';

const RETOUCH_FAQS = [
    {
        q: 'Does Crevo AI Photo Retouch change my face or make my skin look plastic?',
        a: 'No. Retouch My Photo preserves 100% of your exact facial geometry, expression, natural skin pores, hair, body shape, and pose from the photo you took—upgrading only lighting, exposure, sharpness, film color grading, and optional location.',
    },
    {
        q: 'Can I change the background or location of my selfie realistically?',
        a: 'Yes. Select "Change Place" and choose a preset (City Night Street, Luxury Hotel Lobby, Sunny Beachfront, Photo Studio, Upscale Lounge, Rooftop) or type any custom location. Crevo seamlessly relights your face, hair, and clothes to match the new environment.',
    },
    {
        q: 'Can I add subtle makeup, remove background clutter, or switch my outfit?',
        a: 'Yes! Use 1-tap Extra Touches (Soft Natural Makeup, Glam Makeup, Polished Hair, Sunglasses, Subtle Jewelry, Declutter Background), type any custom edit note, or use the optional Outfit Switcher—then compare Before & After side-by-side.',
    },
    {
        q: 'Can I edit specific areas or upscale my retouched photo to HD?',
        a: 'Yes. Every retouched photo includes 1-click Magic Brush AI Edit (paint over any area to tweak it), HD Upscale, and automatic ready-to-paste social captions.',
    },
];

export const PhotoRetouchLandingPage: FC = () => {
    useEffect(() => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.id = 'photo-retouch-faq-jsonld';
        script.textContent = JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'FAQPage',
            mainEntity: RETOUCH_FAQS.map((item) => ({
                '@type': 'Question',
                name: item.q,
                acceptedAnswer: { '@type': 'Answer', text: item.a },
            })),
        });
        document.head.appendChild(script);
        return () => {
            document.getElementById('photo-retouch-faq-jsonld')?.remove();
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
                        AI PHOTO RETOUCH &amp; LOCATION CHANGER · ZERO PLASTIC SKIN
                    </span>
                    <h1 style={{ fontSize: 'clamp(32px, 5vw, 50px)', fontWeight: 900, lineHeight: 1.1, margin: '0 0 16px' }}>
                        Turn Any Phone Photo Into a Pro Photographer Shoot
                    </h1>
                    <p style={{ fontSize: '17px', color: '#4b5563', lineHeight: 1.6, margin: '0 0 28px' }}>
                        Upload a selfie or portrait you already took. Crevo AI fixes dim lighting, declutters messy backgrounds, or seamlessly moves you to a brand-new location — while keeping{' '}
                        <strong>100% of your real face, pose, and body</strong>.
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
                            Retouch Your Photo Free (6 Credits) →
                        </Link>
                        <Link
                            to="/daily-post"
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
                            Explore Daily Social Posts →
                        </Link>
                    </div>
                </section>

                {/* Feature Grid */}
                <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '18px', marginBottom: '56px' }}>
                    {[
                        {
                            icon: '✨',
                            title: 'Pro Edit Only (Keep Background)',
                            desc: 'Upgrade exposure, film color grading, sharpness, and optical lens depth-of-field while keeping your real room or outdoor scene intact.',
                        },
                        {
                            icon: '🌍',
                            title: 'Change Location Seamlessly',
                            desc: 'Move your exact pose and face to a city night street, luxury hotel, beachfront, or studio with realistic relighting on skin and clothes.',
                        },
                        {
                            icon: '💄',
                            title: 'Extra Touches & Custom Notes',
                            desc: 'Tap Soft Natural Makeup, Glam Makeup, Polished Hair, Sunglasses, Subtle Jewelry, or Declutter Background — or type any custom tweak.',
                        },
                        {
                            icon: '🛡️',
                            title: 'Pre-Delivery Vision Quality Audit',
                            desc: 'Every retouched photo is audited against your original photo for face & body fidelity before it is shown to you.',
                        },
                        {
                            icon: '↔️',
                            title: 'Instant Before & After Compare',
                            desc: 'Flip between your original phone photo and the retouched version in one tap, then fine-tune with Magic Brush AI Edit or HD Upscale.',
                        },
                        {
                            icon: '📋',
                            title: 'Ready-to-Paste Captions Included',
                            desc: 'Automatically writes a natural, cliché-free caption and hashtags sized for Instagram, Facebook, LinkedIn, or Stories.',
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
                        {RETOUCH_FAQS.map((faq) => (
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
