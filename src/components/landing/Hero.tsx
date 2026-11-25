import React, { FC } from 'react';
import { Link } from 'react-router-dom';

export const Hero: FC = () => {
    return (
        <section className="hero-section">
            <div className="hero-container">
                <h1 className="hero-title">
                    AI YouTube Thumbnails &amp; Viral Clips<br />
                    <span className="gradient-text">Built to Multiply Your Clicks &amp; Views</span>
                </h1>
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
