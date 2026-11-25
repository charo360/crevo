import React, { FC, useState } from 'react';
import { toast } from 'react-toastify';
import { Navbar } from '../components/landing/Navbar';
import { Footer } from '../components/landing/Footer';
import { apiRequest } from '../lib/api';

export const ContactPage: FC = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            await apiRequest('/api/public/contact', {
                method: 'POST',
                body: JSON.stringify({ name, email, subject, message }),
            });
            setSent(true);
            setName('');
            setEmail('');
            setSubject('');
            setMessage('');
            toast.success('Message sent! We will reply to your email shortly.');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send message. Please email sam@crevo.app directly.');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="landing-page">
            <Navbar />
            <main style={{ maxWidth: '640px', margin: '0 auto', padding: '110px 20px 72px' }}>
                <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                    <h1 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#111827', marginBottom: '8px' }}>Contact Crevo AI</h1>
                    <p style={{ color: '#6b7280', fontSize: '1rem' }}>
                        Questions, billing help, or agency inquiries? Send us a note or email{' '}
                        <a href="mailto:sam@crevo.app" style={{ color: '#571c86', fontWeight: 600 }}>sam@crevo.app</a>.
                    </p>
                </div>

                <div
                    style={{
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: '16px',
                        padding: '28px',
                        boxShadow: '0 10px 30px rgba(87, 28, 134, 0.06)',
                    }}
                >
                    {sent ? (
                        <div style={{ textAlign: 'center', padding: '24px 8px' }}>
                            <div style={{ fontSize: '36px', marginBottom: '8px' }}>✅</div>
                            <h2 style={{ margin: '0 0 8px', fontSize: '1.35rem', fontWeight: 700, color: '#111827' }}>
                                Thanks for reaching out!
                            </h2>
                            <p style={{ color: '#4b5563', marginBottom: '20px' }}>
                                Your message was delivered to our team at <strong>sam@crevo.app</strong>. We&apos;ll get back to you soon.
                            </p>
                            <button
                                type="button"
                                onClick={() => setSent(false)}
                                style={{
                                    padding: '10px 18px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#571c86',
                                    color: '#ffffff',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                }}
                            >
                                Send another message
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                                        Your Name
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Alex Rivera"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                                        Your Email
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@example.com"
                                        style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px' }}
                                    />
                                </div>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                                    Subject
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="How can we help?"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>
                                    Message
                                </label>
                                <textarea
                                    required
                                    rows={5}
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    placeholder="Tell us about your question or project..."
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={sending}
                                style={{
                                    padding: '12px 20px',
                                    borderRadius: '10px',
                                    border: 'none',
                                    background: '#571c86',
                                    color: '#ffffff',
                                    fontWeight: 700,
                                    fontSize: '15px',
                                    cursor: sending ? 'not-allowed' : 'pointer',
                                    opacity: sending ? 0.7 : 1,
                                }}
                            >
                                {sending ? 'Sending...' : 'Send Message →'}
                            </button>
                        </form>
                    )}
                </div>
            </main>
            <Footer />
        </div>
    );
};
