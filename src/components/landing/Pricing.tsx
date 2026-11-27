import React, { FC } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { redirectToCheckout } from '../../services/payments/stripeService';
import { toast } from 'react-toastify';

export const Pricing: FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleBuyCredits = async (plan: typeof plans[0]) => {
        // Free Starter pack - redirect to signup
        if (plan.isFree) {
            navigate('/signup');
            return;
        }

        // Check if user is logged in
        if (!user) {
            toast.info('Please sign in to purchase credits');
            navigate('/signup');
            return;
        }

        // Map plan names to live Stripe Price IDs
        const priceIdMap: Record<string, string> = {
            'Pay As You Go': 'price_1UfkBAELJu3kIHjxxWOcwsh0',
            'Pro Plan': 'price_1UfkBBELJu3kIHjxvfZceTS4',
            'Enterprise Plan': 'price_1UfkBCELJu3kIHjxPeUkdZJp',
        };

        const priceId = priceIdMap[plan.name];
        if (!priceId) {
            toast.error('This pack is not available for purchase. Please contact sales.');
            return;
        }

        try {
            await redirectToCheckout(priceId);
        } catch (error: any) {
            toast.error(error.message || 'Failed to start checkout. Please try again.');
        }
    };

    const plans = [
        {
            name: 'Free Starter',
            price: '$0',
            period: '',
            credits: 6,
            description: 'Perfect for trying out Crevo',
            features: [
                '6 free credits',
                'All platform types',
                'Basic AI editing',
                'Standard resolution',
                'Email support'
            ],
            cta: 'Get Started Free',
            popular: false,
            isFree: true
        },
        {
            name: 'Pay As You Go',
            price: '$9',
            period: ' one-time',
            credits: 50,
            description: 'Pay once, no subscription — credits never expire',
            features: [
                '50 credits (one-time)',
                'All AI thumbnail & resize tools',
                '5GB video-to-Shorts repurposing',
                'AI auto-captions & transitions',
                '7-day cloud work library',
            ],
            cta: 'Buy 50 Credits',
            popular: false
        },
        {
            name: 'Pro Plan',
            price: '$29',
            period: '/month',
            credits: 200,
            description: 'Monthly subscription for active creators — cancel anytime',
            features: [
                '200 credits every month',
                'All AI thumbnail & resize tools',
                '5GB video-to-Shorts repurposing',
                'HD & 4K thumbnail upscaling',
                '7-day cloud work library',
                'Priority support',
            ],
            cta: 'Subscribe to Pro',
            popular: true
        },
        {
            name: 'Enterprise Plan',
            price: '$99',
            period: '/month',
            credits: 1000,
            description: 'Monthly subscription for teams & agencies — cancel anytime',
            features: [
                '1,000 credits every month',
                'All AI thumbnail & video tools',
                'HD & 4K exports + bulk resize',
                '7-day cloud work library',
                'Dedicated support',
                'Team & agency workflows',
            ],
            cta: 'Subscribe to Enterprise',
            popular: false
        }
    ];

    return (
        <section id="pricing" className="pricing-section">
            <div className="pricing-container">
                <h2 className="section-title">Simple, Transparent Pricing</h2>
                <p className="section-subtitle">
                    Buy credits once, use them anytime. No subscriptions, no monthly fees. All plans include our full suite of AI design tools.
                </p>
                <div className="pricing-grid">
                    {plans.map((plan, index) => (
                        <div key={index} className={`pricing-card ${plan.popular ? 'popular' : ''} ${plan.isFree ? 'free-pack' : ''}`}>
                            {plan.popular && <div className="popular-badge">Most Popular</div>}
                            {plan.isFree && <div className="free-badge">Free</div>}
                            <div className="pricing-header">
                                <h3 className="plan-name">{plan.name}</h3>
                                <div className="plan-price">
                                    <span className="price-amount">{plan.price}</span>
                                    {plan.period && <span className="price-period">{plan.period}</span>}
                                </div>
                                {plan.credits && (
                                    <div className="plan-credits">
                                        <span className="credits-amount">{plan.credits}</span>
                                        <span className="credits-label">credits</span>
                                    </div>
                                )}
                                <p className="plan-description">{plan.description}</p>
                            </div>
                            <ul className="plan-features">
                                {plan.features.map((feature, idx) => (
                                    <li key={idx} className="feature-item">
                                        <svg className="check-icon" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                        </svg>
                                        {feature}
                                    </li>
                                ))}
                            </ul>
                            <button
                                onClick={() => handleBuyCredits(plan)}
                                className={`cta-button ${plan.popular ? 'primary' : plan.isFree ? 'primary' : 'secondary'} pricing-cta`}
                            >
                                {plan.cta}
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
};
