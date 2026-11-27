import React, { FC, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';
import { Pricing } from '../components/landing/Pricing';
import { useAuth } from '../contexts/AuthContext';
import Swal from 'sweetalert2';

export const PricingPage: FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { refreshCredits } = useAuth();
    
    // Handle payment success/cancellation
    useEffect(() => {
        const payment = searchParams.get('payment');
        const sessionId = searchParams.get('session_id');
        
        if (payment === 'success' && sessionId) {
            // Immediately refresh credits to get latest data
            refreshCredits().catch(console.error);
            
            Swal.fire({
                icon: 'success',
                title: 'Payment Successful!',
                text: 'Your credits have been added to your account.',
                confirmButtonText: 'View Credits',
                showCancelButton: true,
                cancelButtonText: 'Continue',
                confirmButtonColor: '#571c86',
                cancelButtonColor: '#6a2d9b',
                buttonsStyling: true,
                customClass: {
                    popup: 'revo-swal-popup',
                    title: 'revo-swal-title',
                    confirmButton: 'revo-swal-confirm',
                    cancelButton: 'revo-swal-cancel',
                },
            }).then(async (result) => {
                // Remove query params from URL
                searchParams.delete('payment');
                searchParams.delete('session_id');
                setSearchParams(searchParams, { replace: true });
                
                // Refresh credits again after a short delay to ensure webhook processed
                setTimeout(() => {
                    refreshCredits().catch(console.error);
                }, 2000);
                
                if (result.isConfirmed) {
                    window.location.href = '/dashboard/credits';
                }
            });
        } else if (payment === 'cancelled') {
            Swal.fire({
                icon: 'info',
                title: 'Payment Cancelled',
                text: 'Your payment was cancelled. No charges were made.',
                confirmButtonText: 'OK',
                confirmButtonColor: '#571c86',
                buttonsStyling: true,
                customClass: {
                    popup: 'revo-swal-popup',
                    title: 'revo-swal-title',
                    confirmButton: 'revo-swal-confirm',
                },
            }).then(() => {
                // Remove query params from URL
                searchParams.delete('payment');
                setSearchParams(searchParams, { replace: true });
            });
        }
    }, [searchParams, setSearchParams, refreshCredits]);
    const pricingFaqs = [
        {
            question: 'How do credits work?',
            answer: 'Credits power all AI features in Crevo Studio: generating a thumbnail costs 2 credits, Smart Resize or Face Extraction costs 1 credit, and Viral 1080p Clips cost 1 credit per clip (e.g., 3 clips = 3 credits). One-time Pay As You Go credits never expire.'
        },
        {
            question: 'Do credits expire?',
            answer: 'One-time Pay As You Go credits never expire — buy them once and use them whenever you need. Monthly Pro and Enterprise plans refresh your balance with new credits every billing cycle, and you can cancel anytime in one click.'
        },
        {
            question: 'What happens when I run out of credits?',
            answer: 'You can top up with a $9 Pay As You Go pack or upgrade to Pro/Enterprise anytime directly from your dashboard or the out-of-credits popup.'
        },
        {
            question: 'Are there any hidden fees?',
            answer: 'No hidden fees. Pay As You Go ($9) is a one-time purchase with no recurring charges, and Pro ($29/mo) / Enterprise ($99/mo) can be cancelled anytime in 1 click from your billing portal.'
        },
        {
            question: 'Can I get a refund?',
            answer: 'Yes! We offer a 14-day money-back guarantee on unused credit purchases. If you run into any issue, email sam@crevo.app and our team will help right away.'
        },
        {
            question: 'Can I use designs commercially?',
            answer: 'Absolutely! All thumbnails, resized images, and clips generated with Crevo can be used commercially on YouTube, TikTok, Instagram, and client channels with no watermarks.'
        }
    ];

    return (
        <div className="landing-page">
            <Navbar />
            <div className="pricing-page-content">
                <section className="pricing-hero">
                    <div className="pricing-hero-container">
                        <h1>The Perfect Plan for Every Creator</h1>
                        <p>Start free with 6 credits. Buy one-time credit packs that never expire, or subscribe monthly for the lowest cost per credit.</p>
                    </div>
                </section>

                <Pricing />

                <section className="pricing-comparison">
                    <div className="pricing-comparison-container">
                        <h2>Compare Plans</h2>
                        <div className="comparison-table">
                            <div className="comparison-header">
                                <div className="comparison-feature">Features</div>
                                <div className="comparison-plan">Free Starter</div>
                                <div className="comparison-plan">Pay As You Go</div>
                                <div className="comparison-plan">Pro Plan</div>
                                <div className="comparison-plan">Enterprise Plan</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">Credits</div>
                                <div className="comparison-plan">6</div>
                                <div className="comparison-plan">35 (one-time)</div>
                                <div className="comparison-plan">200 / mo</div>
                                <div className="comparison-plan">1,000 / mo</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">Price</div>
                                <div className="comparison-plan">Free</div>
                                <div className="comparison-plan">$9 one-time</div>
                                <div className="comparison-plan">$29 / mo</div>
                                <div className="comparison-plan">$99 / mo</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">AI Magic Studio</div>
                                <div className="comparison-plan">✅ Limited</div>
                                <div className="comparison-plan">✅ Full</div>
                                <div className="comparison-plan">✅ Full</div>
                                <div className="comparison-plan">✅ Full</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">High-res exports</div>
                                <div className="comparison-plan">✅</div>
                                <div className="comparison-plan">✅</div>
                                <div className="comparison-plan">✅</div>
                                <div className="comparison-plan">✅</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">Platform support</div>
                                <div className="comparison-plan">All</div>
                                <div className="comparison-plan">All</div>
                                <div className="comparison-plan">All</div>
                                <div className="comparison-plan">All + Custom</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">Team collaboration</div>
                                <div className="comparison-plan">❌</div>
                                <div className="comparison-plan">❌</div>
                                <div className="comparison-plan">✅</div>
                                <div className="comparison-plan">✅</div>
                            </div>
                            <div className="comparison-row">
                                <div className="comparison-feature">Priority support</div>
                                <div className="comparison-plan">❌</div>
                                <div className="comparison-plan">❌</div>
                                <div className="comparison-plan">✅</div>
                                <div className="comparison-plan">✅ 24/7</div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="pricing-faq-section">
                    <div className="pricing-faq-container">
                        <h2>Frequently Asked Questions</h2>
                        <div className="pricing-faq-list">
                            {pricingFaqs.map((faq, index) => (
                                <div key={index} className="pricing-faq-item">
                                    <h3>{faq.question}</h3>
                                    <p>{faq.answer}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="pricing-cta">
                    <div className="pricing-cta-container">
                        <h2>Still have questions?</h2>
                        <p>Our team is here to help you choose the right plan</p>
                        <Link to="/contact" className="cta-button primary">Contact Sales</Link>
                    </div>
                </section>
            </div>
            <Footer />
        </div>
    );
};
