import React, { FC } from 'react';

export const Features: FC = () => {
    const features = [
        {
            icon: '🎬',
            title: 'AI Thumbnails & CTR Enhancer',
            description: 'Create click-worthy thumbnails from scratch or paste any YouTube URL to improve existing thumbnails with AI CTR scoring and live YouTube feed preview.'
        },
        {
            icon: '📅',
            title: 'Daily Social Posts & Photo Retouch',
            description: 'Create real-camera Instagram, Facebook, LinkedIn & X posts with natural human captions — or retouch your own phone photos with pro lighting and new locations.'
        },
        {
            icon: '👤',
            title: 'Named Characters & 100% Face Lock',
            description: 'Save up to 6 characters (3 reference photos each) so the AI nails your exact real face and body every time — plus switch outfits in 1 tap.'
        },
        {
            icon: '📊',
            title: 'YouTube URL to 1080p Viral Clips',
            description: 'Paste any YouTube link or upload a long video. AI finds peak viral moments, cuts 1080p vertical Shorts with burned-in captions, and generates matching covers.'
        },
        {
            icon: '🪄',
            title: 'Smart Resize Without Cropping',
            description: 'Adapt any thumbnail or photo across 16:9, 9:16, 4:5, and 1:1 with AI background expansion — no cut-off faces or black bars.'
        },
        {
            icon: '🎨',
            title: 'Brand Kit & Magic AI Editor',
            description: 'Save your niche bio, seamless logo, and brand colors once. Fine-tune any visual with Magic Brush AI Edit and 4K upscaling.'
        }
    ];

    return (
        <section className="features-section">
            <div className="features-container">
                <h2 className="section-title">Everything Creators Need to Publish Every Day</h2>
                <p className="section-subtitle">
                    From high-CTR YouTube thumbnails and 1080p viral Shorts to real-camera Daily Social Posts and pro photo retouching — all locked to your exact face and brand.
                </p>
                <div className="features-grid">
                    {features.map((feature, index) => (
                        <div key={index} className="feature-card">
                            <div className="feature-icon">{feature.icon}</div>
                            <h3 className="feature-title">{feature.title}</h3>
                            <p className="feature-description">{feature.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
