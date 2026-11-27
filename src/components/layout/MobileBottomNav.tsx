import React, { FC } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

export const MobileBottomNav: FC = () => {
    const { user } = useAuth();
    const location = useLocation();
    const path = location.pathname;

    // Show only for signed-in users inside the app workspace (never on marketing landing, login, signup)
    const isAppRoute =
        path.startsWith('/dashboard') ||
        path.startsWith('/profile') ||
        path.startsWith('/affiliates') ||
        path.startsWith('/admin');

    if (!user || !isAppRoute) return null;

    const tabs = [
        {
            id: 'studio',
            label: 'Studio',
            to: '/dashboard/youtube-thumbnail',
            icon: '🎨',
            active:
                path === '/dashboard' ||
                path === '/dashboard/home' ||
                path.startsWith('/dashboard/youtube-thumbnail') ||
                path.startsWith('/dashboard/improve-thumbnail') ||
                path.startsWith('/dashboard/podcast-cover') ||
                path.startsWith('/dashboard/tiktok-thumbnail') ||
                path.startsWith('/dashboard/twitter-card'),
        },
        {
            id: 'repurpose',
            label: 'Clips',
            to: '/dashboard/content-repurpose',
            icon: '🎬',
            active: path.startsWith('/dashboard/content-repurpose'),
        },
        {
            id: 'resize',
            label: 'Resize',
            to: '/dashboard/resize',
            icon: '🪄',
            active: path.startsWith('/dashboard/resize'),
        },
        {
            id: 'library',
            label: 'Library',
            to: '/dashboard/library',
            icon: '📁',
            active: path.startsWith('/dashboard/library'),
        },
        {
            id: 'account',
            label: 'Account',
            to: '/profile',
            icon: '👤',
            active:
                path.startsWith('/profile') ||
                path.startsWith('/dashboard/credits') ||
                path.startsWith('/affiliates'),
        },
    ];

    return (
        <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
            {tabs.map((tab) => (
                <Link
                    key={tab.id}
                    to={tab.to}
                    className={`mobile-bottom-nav-item ${tab.active ? 'active' : ''}`}
                >
                    <span className="mobile-bottom-nav-icon" aria-hidden="true">
                        {tab.icon}
                    </span>
                    <span className="mobile-bottom-nav-label">{tab.label}</span>
                </Link>
            ))}
        </nav>
    );
};
