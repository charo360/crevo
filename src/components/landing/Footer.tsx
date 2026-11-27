import React, { FC } from 'react';
import { Link } from 'react-router-dom';

export const Footer: FC = () => {
    return (
        <footer className="landing-footer">
            <div className="footer-container">
                <div className="footer-content">
                    <div className="footer-section">
                        <h4 className="footer-title">Crevo</h4>
                        <p className="footer-description">
                            AI-powered design studio for creating viral content that converts. Everything you need to create without limits.
                        </p>
                    </div>
                    <div className="footer-section">
                        <h5 className="footer-heading">Platforms</h5>
                        <ul className="footer-links">
                            <li><Link to="/platforms/youtube">YouTube Thumbnails</Link></li>
                            <li><Link to="/platforms/podcast">Podcast Covers</Link></li>
                            <li><Link to="/platforms/tiktok">TikTok & Shorts</Link></li>
                            <li><Link to="/platforms/twitter">Twitter Cards</Link></li>
                            <li><Link to="/platforms/repurpose">Content Repurpose</Link></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h5 className="footer-heading">Product</h5>
                        <ul className="footer-links">
                            <li><Link to="/features">Features</Link></li>
                            <li><Link to="/pricing">Pricing</Link></li>
                            <li><Link to="/dashboard">Studio</Link></li>
                            <li><Link to="/business">For Agencies</Link></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h5 className="footer-heading">Free Tools</h5>
                        <ul className="footer-links">
                            <li><Link to="/tools/youtube-transcript">YouTube Transcript &amp; Thumb</Link></li>
                            <li><Link to="/tools/image-resizer">AI Smart Image Resizer</Link></li>
                            <li><Link to="/tools/youtube-thumbnail-resizer">YouTube 1280×720 Resizer</Link></li>
                            <li><Link to="/tools/tiktok-image-resizer">TikTok &amp; Shorts 9:16 Resizer</Link></li>
                            <li><Link to="/tools/instagram-image-resizer">Instagram 4:5 Resizer</Link></li>
                        </ul>
                    </div>
                    <div className="footer-section">
                        <h5 className="footer-heading">Company &amp; Legal</h5>
                        <ul className="footer-links">
                            <li><Link to="/affiliates">Affiliates (Earn 30%)</Link></li>
                            <li><Link to="/contact">Contact Us</Link></li>
                            <li><a href="/#faq">FAQ</a></li>
                            <li><Link to="/privacy">Privacy Policy</Link></li>
                            <li><Link to="/terms">Terms of Service</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="footer-bottom">
                    <p>&copy; 2026 Crevo AI. All rights reserved.</p>
                    <div className="footer-social">
                        <a href="mailto:sam@crevo.app" aria-label="Email Crevo AI">sam@crevo.app</a>
                    </div>
                </div>
            </div>
        </footer>
    );
};
