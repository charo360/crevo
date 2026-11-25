import React, { FC } from 'react';
import { Link } from 'react-router-dom';

const HERO_FEATURES = [
    { icon: '✨', label: 'Improve Thumbnail', badge: 'AI CTR', to: '/platforms/youtube' },
    { icon: '🎬', label: 'Video to Viral Shorts', badge: 'Up to 5GB', to: '/platforms/repurpose' },
    { icon: '🪄', label: 'AI Smart Image Resizer', badge: '2 Free Tries', to: '/tools/image-resizer' },
    { icon: '📝', label: 'YouTube Transcript & Thumb', badge: 'Free', to: '/tools/youtube-transcript' },
    { icon: '🖼️', label: 'YouTube 1280×720 Resizer', badge: 'No Crop', to: '/tools/youtube-thumbnail-resizer' },
    { icon: '📱', label: 'TikTok & Shorts 9:16 Resizer', badge: 'AI Expand', to: '/tools/tiktok-image-resizer' },
    { icon: '📸', label: 'Instagram 4:5 Resizer', badge: 'Free Try', to: '/tools/instagram-image-resizer' },
    { icon: '🎙️', label: 'Podcast Cover Studio', badge: '1:1 HD', to: '/platforms/podcast' },
];

export const Hero: FC = () => {
    const sliderItems = [...HERO_FEATURES, ...HERO_FEATURES];

    return (
        <section className="hero-section">
            <div className="hero-container">
                <h1 className="hero-title">
                    AI YouTube Thumbnails &amp; Viral Clips<br />
                    <span className="gradient-text">Built to Multiply Your Clicks &amp; Views</span>
                </h1>

                {/* Interactive Sliding Feature Pills */}
                <div className="hero-feature-marquee" aria-label="Crevo AI Features">
                    <div className="hero-feature-track">
                        {sliderItems.map((item, idx) => (
                            <Link key={`${item.to}-${idx}`} to={item.to} className="hero-feature-pill">
                                <span className="hero-feature-pill-icon">{item.icon}</span>
                                <span className="hero-feature-pill-label">{item.label}</span>
                                <span className="hero-feature-pill-badge">{item.badge}</span>
                                <span className="hero-feature-pill-arrow" aria-hidden="true">→</span>
                            </Link>
                        ))}
                    </div>
                </div>

                <p className="hero-description">
                    Create high-CTR YouTube thumbnails, upgrade existing ones with AI scoring, and turn long videos into viral Shorts, TikToks &amp; Reels with burned-in captions — all in one fast studio.
                </p>
                <div className="hero-cta">
                    <Link to="/signup" className="cta-button primary">
                        Start Free Now
                    </Link>
                    <Link to="/pricing" className="cta-button secondary">
                        Pricing
                    </Link>
                </div>
                <div className="hero-stats">
                    <div className="stat-item">
                        <div className="stat-number">10K+</div>
                        <div className="stat-label">Thumbnails Created</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-number">40%</div>
                        <div className="stat-label">Avg CTR Increase</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-number">30s</div>
                        <div className="stat-label">Generation Time</div>
                    </div>
                </div>
            </div>
        </section>
    );
};
