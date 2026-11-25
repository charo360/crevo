import React, { FC } from 'react';

export const TrustBadges: FC = () => {
    const badges = [
        {
            title: 'Enterprise Security',
            description: 'Bank-level encryption and security',
            icon: '🔒'
        },
        {
            title: 'Commercial License',
            description: 'Use designs commercially worldwide',
            icon: '✅'
        },
        {
            title: 'No Watermarks',
            description: '100% yours, no branding',
            icon: '🎯'
        },
        {
            title: '24/7 Support',
            description: 'Always here when you need us',
            icon: '💬'
        },
        {
            title: 'Money-Back Guarantee',
            description: '30-day satisfaction guarantee',
            icon: '💰'
        },
        {
            title: 'Regular Updates',
            description: 'New features added monthly',
            icon: '🚀'
        }
    ];

    return (
        <section className="trust-badges-section">
            <div className="trust-badges-container">
                <h2 className="section-title">Why Creators Trust Crevo</h2>
                <div className="trust-badges-grid">
                    {badges.map((badge, index) => (
                        <div key={index} className="trust-badge-card">
                            <div className="trust-badge-icon">{badge.icon}</div>
                            <h3 className="trust-badge-title">{badge.title}</h3>
                            <p className="trust-badge-description">{badge.description}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
