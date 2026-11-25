import React, { FC, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiRequest } from '../lib/api';

export const ResetPasswordPage: FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token') || '';

    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!token) {
            toast.error('Reset token is missing. Please request a new reset link.');
            return;
        }
        if (password.length < 6) {
            toast.error('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            toast.error('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            const res = await apiRequest<{ ok: boolean; message?: string }>('/api/auth/reset-password', {
                method: 'POST',
                body: JSON.stringify({ token, password }),
            });
            toast.success(res.message || 'Password updated! You can now sign in.');
            navigate('/login');
        } catch (err: any) {
            toast.error(err?.message || 'Could not reset password. Please request a new link.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-container">
                <div className="auth-header">
                    <Link to="/" className="auth-logo">Crevo</Link>
                    <h1>Choose a new password</h1>
                    <p>Enter a strong new password for your Crevo account</p>
                </div>

                {!token ? (
                    <div
                        style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            borderRadius: '12px',
                            padding: '18px',
                            textAlign: 'center',
                            marginBottom: '20px',
                        }}
                    >
                        <p style={{ margin: '0 0 12px', color: '#991b1b', fontWeight: 600 }}>
                            This password reset link is missing a valid token.
                        </p>
                        <Link to="/forgot-password" style={{ color: '#571c86', fontWeight: 700 }}>
                            Request a new reset link →
                        </Link>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit} className="auth-form">
                        <div className="form-group">
                            <label htmlFor="password">New Password</label>
                            <div className="password-input-wrapper">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                    minLength={6}
                                    placeholder="At least 6 characters"
                                />
                                <button
                                    type="button"
                                    className="password-toggle-btn"
                                    onClick={() => setShowPassword(!showPassword)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>

                        <div className="form-group">
                            <label htmlFor="confirmPassword">Confirm New Password</label>
                            <input
                                id="confirmPassword"
                                type={showPassword ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={6}
                                placeholder="Re-enter your new password"
                            />
                        </div>

                        <button type="submit" className="auth-button" disabled={loading}>
                            {loading ? 'Updating password...' : 'Update Password'}
                        </button>
                    </form>
                )}

                <div className="auth-footer">
                    <p>
                        <Link to="/login">Back to Sign In</Link>
                    </p>
                </div>
            </div>
        </div>
    );
};
