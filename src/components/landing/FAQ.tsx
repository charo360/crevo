import React, { FC, useState } from 'react';
import { Link } from 'react-router-dom';

interface FAQItem {
    question: string;
    answer: string;
}

export const FAQ: FC = () => {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    const faqs: FAQItem[] = [
        {
            question: "What platforms does Crevo support?",
            answer: "Crevo supports YouTube thumbnails (16:9), TikTok & YouTube Shorts (9:16), Podcast covers (1:1), Instagram Portrait (4:5), X/Twitter cards, and 1080p viral video clip repurposing directly from YouTube links or uploaded videos."
        },
        {
            question: "Do I need design or video editing skills?",
            answer: "Not at all! Crevo is built for creators of all skill levels. Upload a photo or paste a YouTube link, pick your style, and our AI handles composition, captions, CTR scoring, and resizing automatically — with a built-in Help Guide whenever you need a tip."
        },
        {
            question: "Can I edit and resize the generated designs?",
            answer: "Yes! Every generated design includes 1-click Smart Resize (16:9, 9:16, 1:1, 4:5), AI Magic Studio editing to paint and refine details, HD Upscaling, and a full interactive editor."
        },
        {
            question: "How do credits and plans work?",
            answer: "Every new account starts with 6 free credits. You can top up anytime with a $9 Pay As You Go pack (35 credits that never expire), or subscribe to Pro ($29/mo for 200 credits) or Enterprise ($99/mo for 1,000 credits)."
        },
        {
            question: "Can I use generated designs and clips commercially?",
            answer: "Yes! All thumbnails, resized images, and 1080p video clips created with Crevo are 100% watermark-free and yours to use commercially on your own or client channels."
        },
        {
            question: "What file formats and resolutions are supported?",
            answer: "Thumbnails export as crisp high-resolution PNGs, and repurposed clips render in Full HD 1080p MP4 with burned-in social captions — ready to upload directly to YouTube, TikTok, and Instagram."
        },
        {
            question: "Is there a free trial?",
            answer: "Yes! Sign up with 1-click Google Sign-In (no credit card required) to get 6 free starter credits — enough to test viral clips, thumbnails, and Smart Resize right away."
        },
        {
            question: "How does the 30% Affiliate Program work?",
            answer: "Share your personal referral link from the Affiliates page and earn 30% recurring commission for 12 months on every paying creator you refer, with automatic end-of-month payouts via PayPal, Wise, or Bank Transfer."
        }
    ];

    const toggleFAQ = (index: number) => {
        setOpenIndex(openIndex === index ? null : index);
    };

    return (
        <section id="faq" className="faq-section">
            <div className="faq-container">
                <h2 className="section-title">Frequently Asked Questions</h2>
                <p className="section-subtitle">
                    Everything you need to know about Crevo
                </p>
                <div className="faq-list">
                    {faqs.map((faq, index) => (
                        <div key={index} className={`faq-item ${openIndex === index ? 'open' : ''}`}>
                            <button 
                                className="faq-question"
                                onClick={() => toggleFAQ(index)}
                                aria-expanded={openIndex === index}
                            >
                                <span>{faq.question}</span>
                                <svg 
                                    className={`faq-icon ${openIndex === index ? 'open' : ''}`}
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                            {openIndex === index && (
                                <div className="faq-answer">
                                    <p>{faq.answer}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
                <div className="faq-cta">
                    <p>Still have questions? We're here to help.</p>
                    <Link to="/contact" className="cta-button secondary">Contact Support</Link>
                </div>
            </div>
        </section>
    );
};
