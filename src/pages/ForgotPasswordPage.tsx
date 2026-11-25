import React, { FC, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';

export const ForgotPasswordPage: FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            const res = await apiRequest<{ ok: boolean; message?: string }>('/api/auth/forgot-password', {
                method: 'POST',
                body: JSON.stringify({ email }),
            });
            setSent(true);
            toast.success(res.message || 'Check your email for a password reset link.');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send reset link.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-header">
                    <Link to="/" className="auth-logo">Crevo</Link>
                    <h1>Reset your password</h1>
                    <p>Enter your account email and we'll send you a reset link</p>
                </div>

                {sent ? (
                    <div
                        style={{
                            background: '#f5eeff',
                            border: '1px solid #d8ccf0',
                            borderRadius: '12px',
                            padding: '20px',
                            textAlign: 'center',
                            marginBottom: '20px',
                        }}
                    >
                        <div style={{ fontSize: '28px', marginBottom: '8px' }}>✉️</div>
                        <p style={{ margin: '0 0 8px', fontWeight: 700, color: '#111827' }}>Check your inbox</p>
                        <p style={{ margin: 0, fontSize: '14px', color: '#4b5563', lineHeight: 1.5 }}>
                            If an account exists for <strong>{email}</strong>, we sent a password reset link that expires in 1 hour.
                        </p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="email">Email</label>
                            <input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                placeholder="you@example.com"
                            />
                        </div>

                        <button type="submit" className="auth-button" disabled={loading}>
                            {loading ? 'Sending reset link...' : 'Send Reset Link'}
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    <p>
                        Remember your password? <Link to="/login">Back to Sign In</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};
