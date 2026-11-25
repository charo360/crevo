import React, { FC, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';

const SEO_FAQS = [
    {
        q: 'How does Crevo AI recreate a reference YouTube thumbnail?',
        a: 'Tick "Recreate a Reference Thumbnail" in the Crevo Studio sidebar, paste any YouTube video or Shorts link (or upload a reference image), add your own photos or extracted video faces, and enter your headline. Crevo AI clones the reference layout, framing, lighting, and typography style while 100% replacing the people with your real face and the text with your own hook.',
    },
    {
        q: 'Does Crevo AI keep my real face recognizable in thumbnails?',
        a: 'Yes. Crevo AI enforces a strict physical likeness lock that preserves your exact facial structure, skin tone, hair, glasses, and age while subtly enhancing eye contact, expression energy, and studio rim lighting—just like a professional YouTube thumbnail designer.',
    },
    {
        q: 'How large of a video file can I upload to Crevo AI?',
        a: 'For YouTube thumbnail creation and multi-person face extraction, you can load videos up to 10GB—they stay local in your browser and extract 8 key frames instantly with zero upload wait. For Video-to-Shorts repurposing with server-side FFmpeg clipping and burned-in captions, Crevo AI supports uploads up to 5GB.',
    },
    {
        q: 'How does AI Smart Image Resizing work without cropping?',
        a: 'Instead of cutting off faces or adding ugly black bars, Crevo AI extends the background naturally using generative outpainting to fit 1280×720 (YouTube 16:9), 1080×1920 (TikTok/Shorts/Reels 9:16), 1080×1350 (Instagram 4:5), or 1080×1080 (1:1). Anyone can try 2 free AI Smart Resizes without creating an account.',
    },
    {
        q: 'Does Crevo AI generate burned-in captions for Shorts and TikToks?',
        a: 'Yes. When you repurpose a long video or podcast into vertical 9:16 clips, Crevo AI detects the highest-virality non-overlapping moments, crops to vertical HD with smooth outro fades, and burns bold, high-contrast social captions directly into the video.',
    },
    {
        q: 'How long are my generated thumbnails and video clips saved?',
        a: 'Every thumbnail, resized image, and viral video clip you generate is automatically saved to your private 7-Day Cloud Work Library so you can revisit and re-download your assets from any device before automatic 7-day cleanup.',
    },
    {
        q: 'Can I start using Crevo AI for free?',
        a: 'Yes! New accounts receive 10 free starter credits (with 1-click Google Sign-In and no credit card required), and our YouTube Transcript & HD Thumbnail Downloader plus 2 AI Smart Resizes are completely free to try with no signup.',
    },
];

const FEATURE_CATEGORIES = [
    {
        id: 'create-thumbnails',
        badge: 'FLAGSHIP · 2 CREDITS / IMAGE',
        icon: '🎯',
        title: 'AI YouTube Thumbnail Generator & Reference Thumbnail Cloner',
        summary:
            'Design click-worthy 1280×720 YouTube thumbnails from scratch—or tick "Recreate a Reference Thumbnail", paste any viral YouTube link, and clone its proven layout, lighting, and typography with your own people and headline.',
        bullets: [
            'Paste any YouTube or Shorts URL to fetch its HD thumbnail as a layout blueprint',
            '100% subject swap: replaces reference creators with your real photos or extracted faces',
            '100% text swap: renders your 2–4 word viral hook cleanly with high mobile contrast',
            'Smart bottom-right safe zone so YouTube’s duration timestamp never covers your text',
        ],
        ctaLabel: 'Explore YouTube Thumbnail Studio →',
        ctaTo: '/platforms/youtube',
    },
    {
        id: 'enhance-thumbnails',
        badge: 'CTR SCORING · AI ANALYSIS',
        icon: '✨',
        title: 'Improve Existing YouTube Thumbnails with Comparative CTR Scoring',
        summary:
            'Already have a thumbnail that isn’t getting clicks? Paste your YouTube video link—Crevo AI reads your video transcript, diagnoses visual weaknesses, generates upgraded variations, and scores every option on readability, contrast, and curiosity gap.',
        bullets: [
            'Automatic YouTube transcript & title analysis for context-aware hook ideas',
            'Side-by-side comparative CTR scores (0–100) with Top Pick recommendation',
            'Choose between "Improve Existing" (keep your layout) or "Reimagine" (fresh viral concept)',
            'Instant 5-hook viral copywriter suggestions tailored to your video topic',
        ],
        ctaLabel: 'Try Thumbnail Improver →',
        ctaTo: '/platforms/youtube',
    },
    {
        id: 'video-repurpose',
        badge: 'UP TO 5GB · SERVER FFMPEG',
        icon: '🎬',
        title: 'Long Video to Viral YouTube Shorts, TikTok & Reels Clipper',
        summary:
            'Upload podcasts, interviews, or long-form YouTube videos up to 5GB. Crevo AI detects the highest-retention non-overlapping moments, crops to vertical 9:16 HD on native server-side FFmpeg, and burns in bold social captions automatically.',
        bullets: [
            'Supports massive MP4, MOV, and WebM uploads up to 5GB with live upload progress',
            'AI viral moment detection with strict non-overlapping clip timestamps',
            'Automatic burned-in ASS social captions + smooth outro fade transitions',
            'Instant HTML5 poster previews and multi-platform export labels (Shorts, TikTok, Reels)',
        ],
        ctaLabel: 'Explore Video Repurposing →',
        ctaTo: '/platforms/repurpose',
    },
    {
        id: 'face-extraction',
        badge: 'UP TO 10GB · 100% LIKENESS',
        icon: '👤',
        title: '10GB Local Video Multi-Person Face Extraction & Real Designer Polish',
        summary:
            'Never hunt manually through a 1-hour 4K video for a single frame again. Load videos up to 10GB locally in your browser—Crevo AI scans 8 evenly spaced frames to capture every distinct person (host + guests) at their sharpest, eyes-open moment.',
        bullets: [
            'Zero upload wait: 10GB videos stay local in your browser for instant frame extraction',
            'Multi-person detection prioritizes capturing each speaker + peak story moments',
            'Transparent head-and-shoulders studio cutouts with clean edges',
            'Strict 100% physical likeness lock with natural high-CTR expression & rim lighting',
        ],
        ctaLabel: 'Open Studio Free →',
        ctaTo: '/signup',
    },
    {
        id: 'smart-resizer',
        badge: '2 FREE TRIES · NO CROP',
        icon: '🪄',
        title: 'AI Smart Image Resizer Without Cropping or Black Bars',
        summary:
            'Turn one hero thumbnail or photo into every social format in a single click. Instead of cropping off heads or text, Crevo AI naturally extends the scene background to fit 16:9, 9:16, 4:5, and 1:1.',
        bullets: [
            'YouTube Thumbnail 1280×720 (16:9) without awkward stretching or borders',
            'TikTok, Reels & YouTube Shorts 1080×1920 (9:16) vertical AI expand',
            'Instagram Feed 1080×1350 (4:5) & Square 1080×1080 (1:1) presets',
            'Batch Smart Resize inside the studio—only 1 credit per resized image',
        ],
        ctaLabel: 'Try AI Smart Resizer Free →',
        ctaTo: '/tools/image-resizer',
    },
    {
        id: 'variations',
        badge: 'A/B TESTING · MAGIC EDIT',
        icon: '📊',
        title: 'Thumbnail Variations, AI Inpaint Editing & Studio HD Upscaling',
        summary:
            'Generate 1 to 4 distinct thumbnail variations in one run for YouTube A/B testing, refine any detail with prompt-based AI editing or brush masking, and upscale final winners to razor-sharp studio clarity.',
        bullets: [
            'Generate multiple visual directions in one click for YouTube Test & Compare',
            'AI Image Edit with optional brush mask to tweak backgrounds, props, or lighting',
            'One-click HD Studio Upscaler to sharpen faces, edges, and bold typography',
            'Built-in layer editor for custom fonts, text color tweaks, and logo placement',
        ],
        ctaLabel: 'View Pricing & Credits →',
        ctaTo: '/pricing',
    },
];

const PLATFORM_SPECS = [
    { platform: 'YouTube Thumbnails', ratio: '16:9', resolution: '1280 × 720 px', bestFor: 'Long-form YouTube videos, A/B testing & CTR optimization', to: '/platforms/youtube' },
    { platform: 'YouTube Shorts, TikTok & Reels', ratio: '9:16', resolution: '1080 × 1920 px', bestFor: 'Viral vertical clips, burned-in captions & mobile covers', to: '/platforms/tiktok' },
    { platform: 'Instagram Feed & Carousels', ratio: '4:5 / 1:1', resolution: '1080 × 1350 px', bestFor: 'High-engagement portrait posts & square promos', to: '/tools/instagram-image-resizer' },
    { platform: 'Podcast Cover Art', ratio: '1:1', resolution: '3000 × 3000 px', bestFor: 'Apple Podcasts, Spotify & YouTube Music show art', to: '/platforms/podcast' },
    { platform: 'Twitter / X & Link Cards', ratio: '16:9', resolution: '1200 × 675 px', bestFor: 'Launch threads, newsletters & social link previews', to: '/platforms/twitter' },
];

export const FeaturesPage: FC = () => {
    const location = useLocation();
    const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

    const scrollToHash = (hash: string, delay: number = 150) => {
        if (!hash) return null;
        return setTimeout(() => {
            const targetElement = sectionRefs.current[hash] || document.getElementById(hash);
            if (targetElement) {
                const navbar = document.querySelector('.landing-navbar') as HTMLElement;
                const offset = (navbar ? navbar.offsetHeight : 80) + 20;
                const elementPosition = targetElement.getBoundingClientRect().top + window.pageYOffset;
                window.scrollTo({ top: elementPosition - offset, behavior: 'smooth' });
            }
        }, delay);
    };

    useEffect(() => {
        const hash = location.hash.slice(1);
        if (!hash) return;
        const timer = scrollToHash(hash, 180);
        return () => {
            if (timer) clearTimeout(timer);
        };
    }, [location.hash]);

    const faqJsonLd = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: SEO_FAQS.map((item) => ({
            '@type': 'Question',
            name: item.q,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.a,
            },
        })),
    };

    return (
        <div className="landing-page">
            <Navbar />

            {/* Structured Data for Google Rich Results & AI Search Engines */}
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />

            <main className="features-page" style={{ background: '#ffffff' }}>
                {/* SEO Hero */}
                <section className="features-hero" style={{ paddingBottom: '36px' }}>
                    <div className="features-hero-container">
                        <span
                            style={{
                                display: 'inline-block',
                                padding: '5px 14px',
                                borderRadius: '999px',
                                background: '#f3e8ff',
                                color: '#571c86',
                                fontSize: '12px',
                                fontWeight: 800,
                                letterSpacing: '0.05em',
                                marginBottom: '14px',
                            }}
                        >
                            ALL-IN-ONE CREATOR AI STUDIO
                        </span>
                        <h1 className="features-hero-title">
                            Every AI Tool You Need for High-CTR YouTube Thumbnails &amp; Viral Short Clips
                        </h1>
                        <p className="features-hero-subtitle" style={{ maxWidth: '760px', margin: '0 auto 24px' }}>
                            Recreate proven reference thumbnails with your own people, extract sharp faces from 10GB videos,
                            clip 5GB long-form videos into captioned Shorts &amp; Reels, and AI-resize images without cropping—all in one studio.
                        </p>

                        {/* Quick Jump Links (Great for UX & Google Sitelinks) */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '8px', marginTop: '12px' }}>
                            {[
                                { label: '🎯 Reference Cloner', href: '#create-thumbnails' },
                                { label: '✨ CTR Improver', href: '#enhance-thumbnails' },
                                { label: '🎬 5GB Shorts Clipper', href: '#video-repurpose' },
                                { label: '👤 10GB Face Extract', href: '#face-extraction' },
                                { label: '🪄 AI Smart Resizer', href: '#smart-resizer' },
                                { label: '📊 A/B Variations', href: '#variations' },
                                { label: '📐 Platform Specs', href: '#platforms' },
                                { label: '❓ Feature FAQ', href: '#features-faq' },
                            ].map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    style={{
                                        padding: '7px 13px',
                                        borderRadius: '999px',
                                        border: '1px solid #e4dcf2',
                                        background: '#faf7ff',
                                        color: '#4c1d95',
                                        fontSize: '12.5px',
                                        fontWeight: 600,
                                        textDecoration: 'none',
                                    }}
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Deep-Dive SEO Feature Blocks */}
                <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '12px 20px 56px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    {FEATURE_CATEGORIES.map((feat) => (
                        <article
                            key={feat.id}
                            id={feat.id}
                            className="seo-feature-card"
                            ref={(el) => {
                                sectionRefs.current[feat.id] = el;
                            }}
                            style={{
                                borderRadius: '18px',
                                border: '1px solid #e5ddf4',
                                background: '#ffffff',
                                padding: '28px',
                                boxShadow: '0 6px 24px rgba(87, 28, 134, 0.05)',
                            }}
                        >
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                                <span style={{ fontSize: '28px' }}>{feat.icon}</span>
                                <span
                                    style={{
                                        padding: '4px 12px',
                                        borderRadius: '999px',
                                        background: '#f3e8ff',
                                        color: '#571c86',
                                        fontSize: '11.5px',
                                        fontWeight: 800,
                                        letterSpacing: '0.04em',
                                    }}
                                >
                                    {feat.badge}
                                </span>
                            </div>

                            <h2 style={{ margin: '0 0 10px', fontSize: 'clamp(1.35rem, 2.4vw, 1.75rem)', fontWeight: 800, color: '#111827' }}>
                                {feat.title}
                            </h2>
                            <p style={{ margin: '0 0 18px', fontSize: '15px', color: '#4b5563', lineHeight: 1.7 }}>
                                {feat.summary}
                            </p>

                            <ul
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                                    gap: '10px 20px',
                                    listStyle: 'none',
                                    padding: 0,
                                    margin: '0 0 20px',
                                }}
                            >
                                {feat.bullets.map((b, i) => (
                                    <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '14px', color: '#1f2937', lineHeight: 1.5 }}>
                                        <span style={{ color: '#571c86', fontWeight: 800, flexShrink: 0 }}>✓</span>
                                        <span>{b}</span>
                                    </li>
                                ))}
                            </ul>

                            <Link
                                to={feat.ctaTo}
                                style={{
                                    display: 'inline-block',
                                    padding: '9px 16px',
                                    borderRadius: '10px',
                                    background: '#faf7ff',
                                    border: '1px solid #d8ccf0',
                                    color: '#571c86',
                                    fontWeight: 700,
                                    fontSize: '13.5px',
                                    textDecoration: 'none',
                                }}
                            >
                                {feat.ctaLabel}
                            </Link>
                        </article>
                    ))}
                </section>

                {/* Platform Dimensions & Export Specs Table (High-Intent SEO Table) */}
                <section
                    id="platforms"
                    ref={(el) => {
                        sectionRefs.current['platforms'] = el;
                    }}
                    style={{ background: '#faf7ff', borderTop: '1px solid #efe8fa', borderBottom: '1px solid #efe8fa', padding: '56px 20px' }}
                >
                    <div style={{ maxWidth: '1120px', margin: '0 auto' }}>
                        <h2 style={{ margin: '0 0 8px', fontSize: 'clamp(1.5rem, 2.8vw, 2rem)', fontWeight: 800, color: '#111827', textAlign: 'center' }}>
                            Supported Creator Platforms &amp; Export Dimensions
                        </h2>
                        <p style={{ margin: '0 auto 28px', maxWidth: '680px', textAlign: 'center', color: '#4b5563', fontSize: '15px' }}>
                            Every export matches exact platform aspect ratios and pixel requirements—no manual resizing or cropping needed.
                        </p>

                        <div style={{ overflowX: 'auto', borderRadius: '14px', border: '1px solid #e5ddf4', background: '#ffffff' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                                <thead>
                                    <tr style={{ background: '#f3e8ff', color: '#3b0764' }}>
                                        <th style={{ padding: '14px 16px', fontWeight: 700 }}>Platform</th>
                                        <th style={{ padding: '14px 16px', fontWeight: 700 }}>Aspect Ratio</th>
                                        <th style={{ padding: '14px 16px', fontWeight: 700 }}>Output Resolution</th>
                                        <th style={{ padding: '14px 16px', fontWeight: 700 }}>Best For</th>
                                        <th style={{ padding: '14px 16px', fontWeight: 700 }}>Link</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {PLATFORM_SPECS.map((row) => (
                                        <tr key={row.platform} style={{ borderTop: '1px solid #f3f4f6' }}>
                                            <td style={{ padding: '13px 16px', fontWeight: 700, color: '#111827' }}>{row.platform}</td>
                                            <td style={{ padding: '13px 16px', color: '#571c86', fontWeight: 700 }}>{row.ratio}</td>
                                            <td style={{ padding: '13px 16px', color: '#374151' }}>{row.resolution}</td>
                                            <td style={{ padding: '13px 16px', color: '#4b5563' }}>{row.bestFor}</td>
                                            <td style={{ padding: '13px 16px' }}>
                                                <Link to={row.to} style={{ color: '#571c86', fontWeight: 700, textDecoration: 'none' }}>
                                                    Open →
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* Free Tools & Cloud Work Library Highlight */}
                <section style={{ maxWidth: '1120px', margin: '0 auto', padding: '56px 20px 24px' }}>
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                            gap: '20px',
                        }}
                    >
                        <div style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                                📝 Free YouTube Transcript &amp; Thumbnail Downloader
                            </h3>
                            <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
                                Pull clean timestamped transcripts and full HD 1280×720 thumbnails from any YouTube video or Short—100% free with zero signup.
                            </p>
                            <Link to="/tools/youtube-transcript" style={{ color: '#571c86', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                                Open Free Transcript Tool →
                            </Link>
                        </div>

                        <div style={{ padding: '24px', borderRadius: '16px', border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                            <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                                ☁️ 7-Day Private Cloud Work Library
                            </h3>
                            <p style={{ margin: '0 0 14px', fontSize: '14px', color: '#4b5563', lineHeight: 1.6 }}>
                                Every thumbnail, smart resize, and viral video clip is automatically saved privately to your dashboard for 7 days so you never lose a generation.
                            </p>
                            <Link to="/signup" style={{ color: '#571c86', fontWeight: 700, fontSize: '14px', textDecoration: 'none' }}>
                                Start Free with 10 Credits →
                            </Link>
                        </div>
                    </div>
                </section>

                {/* Detailed SEO FAQ */}
                <section id="features-faq" style={{ maxWidth: '900px', margin: '0 auto', padding: '44px 20px 64px' }}>
                    <h2 style={{ margin: '0 0 24px', fontSize: 'clamp(1.5rem, 2.8vw, 2rem)', fontWeight: 800, color: '#111827', textAlign: 'center' }}>
                        Frequently Asked Questions About Crevo AI Features
                    </h2>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        {SEO_FAQS.map((item, idx) => (
                            <div
                                key={idx}
                                style={{
                                    padding: '20px 22px',
                                    borderRadius: '14px',
                                    border: '1px solid #e5e7eb',
                                    background: '#ffffff',
                                }}
                            >
                                <h3 style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 700, color: '#111827' }}>
                                    {item.q}
                                </h3>
                                <p style={{ margin: 0, fontSize: '14.5px', color: '#4b5563', lineHeight: 1.65 }}>
                                    {item.a}
                                </p>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Final CTA */}
                <section className="features-cta">
                    <div className="features-cta-container">
                        <h2>Ready to Multiply Your Clicks &amp; Views?</h2>
                        <p>Start free with 10 credits, 1-click Google Sign-In, and no credit card required.</p>
                        <div className="features-cta-buttons">
                            <Link to="/signup" className="cta-button primary">Start Free Now</Link>
                            <Link to="/pricing" className="cta-button secondary">View Pricing</Link>
                        </div>
                    </div>
                </section>
            </main>
            <Footer />
        </div>
    );
};
