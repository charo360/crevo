import React, { FC } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Navbar } from '../components/landing/Navbar';
import { Hero } from '../components/landing/Hero';
import { FreeToolsStrip } from '../components/landing/FreeToolsStrip';
import { BeforeAfterShowcase } from '../components/landing/BeforeAfterShowcase';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { PlatformShowcase } from '../components/landing/PlatformShowcase';
import { HowItWorks } from '../components/landing/HowItWorks';
import { Features } from '../components/landing/Features';
import { Testimonials } from '../components/landing/Testimonials';
import { Pricing } from '../components/landing/Pricing';
import { FAQ } from '../components/landing/FAQ';
import { Newsletter } from '../components/landing/Newsletter';
import { FinalCTA } from '../components/landing/FinalCTA';
import { Footer } from '../components/landing/Footer';

export const LandingPage: FC = () => {
    const { user, loading } = useAuth();
    const location = useLocation();
    const stayOnHome = new URLSearchParams(location.search).get('home') === '1';

    if (!loading && user && !stayOnHome) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="landing-page">
            <Navbar />
            <Hero />
            <FreeToolsStrip />
            <BeforeAfterShowcase />
            <ProductShowcase />
            <PlatformShowcase />
            <HowItWorks />
            <Features />
            <Testimonials />
            <Pricing />
            <FAQ />
            <Newsletter />
            <FinalCTA />
            <Footer />
        </div>
    );
};
