import React, { FC, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../contexts/AuthContext';

declare global {
    interface Window {
        google?: {
            accounts?: {
                id?: {
                    initialize: (config: {
                        client_id: string;
                        callback: (response: { credential?: string }) => void;
                        auto_select?: boolean;
                        cancel_on_tap_outside?: boolean;
                    }) => void;
                    renderButton: (
                        parent: HTMLElement,
                        options: {
                            type?: 'standard' | 'icon';
                            theme?: 'outline' | 'filled_blue' | 'filled_black';
                            size?: 'large' | 'medium' | 'small';
                            text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
                            shape?: 'rectangular' | 'pill' | 'circle' | 'square';
                            width?: number | string;
                            logo_alignment?: 'left' | 'center';
                        }
                    ) => void;
                };
            };
        };
    }
}

interface GoogleSignInButtonProps {
    mode?: 'signin' | 'signup';
}

let gsiScriptPromise: Promise<void> | null = null;

function loadGoogleIdentityScript(): Promise<void> {
    if (typeof window === 'undefined') return Promise.resolve();
    if (window.google?.accounts?.id) return Promise.resolve();
    if (gsiScriptPromise) return gsiScriptPromise;

    gsiScriptPromise = new Promise((resolve, reject) => {
        const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('Failed to load Google Sign-In script')));
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Google Sign-In script'));
        document.head.appendChild(script);
    });

    return gsiScriptPromise;
}

export const GoogleSignInButton: FC<GoogleSignInButtonProps> = ({ mode = 'signin' }) => {
    const { signInWithGoogle } = useAuth();
    const navigate = useNavigate();
    const buttonContainerRef = useRef<HTMLDivElement>(null);
    const [clientId, setClientId] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // Step 1: Fetch Google Client ID so the container div mounts first
    useEffect(() => {
        let cancelled = false;
        apiRequest<{ enabled: boolean; clientId: string | null }>('/api/auth/google/config')
            .then((cfg) => {
                if (!cancelled && cfg?.enabled && cfg.clientId) {
                    setClientId(cfg.clientId);
                }
            })
            .catch((err) => {
                console.warn('Google Sign-In config unavailable:', err);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // Step 2: Once clientId is ready and buttonContainerRef is mounted, render the Google button
    useEffect(() => {
        if (!clientId) return;
        let cancelled = false;

        async function renderGoogleButton() {
            try {
                await loadGoogleIdentityScript();
                if (cancelled || !window.google?.accounts?.id || !buttonContainerRef.current) return;

                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: async (response) => {
                        if (!response?.credential) {
                            toast.error('Google sign-in did not return a credential.');
                            return;
                        }
                        setBusy(true);
                        try {
                            const { error, isNewUser } = await signInWithGoogle(response.credential);
                            if (error) {
                                toast.error(error.message || 'Google sign-in failed.');
                            } else {
                                toast.success(isNewUser ? 'Account created with Google!' : 'Signed in with Google!');
                                navigate('/dashboard');
                            }
                        } finally {
                            setBusy(false);
                        }
                    },
                });

                buttonContainerRef.current.innerHTML = '';
                const containerWidth = Math.min(360, Math.max(260, buttonContainerRef.current.offsetWidth || 340));
                window.google.accounts.id.renderButton(buttonContainerRef.current, {
                    type: 'standard',
                    theme: 'outline',
                    size: 'large',
                    text: mode === 'signup' ? 'signup_with' : 'continue_with',
                    shape: 'rectangular',
                    width: containerWidth,
                    logo_alignment: 'left',
                });
            } catch (err) {
                console.warn('Google Sign-In initialization skipped:', err);
            }
        }

        renderGoogleButton();
        return () => {
            cancelled = true;
        };
    }, [clientId, mode, navigate, signInWithGoogle]);

    if (!clientId) return null;

    return (
        <div style={{ marginBottom: '12px' }}>
            <div
                ref={buttonContainerRef}
                style={{
                    display: 'flex',
                    justifyContent: 'center',
                    minHeight: '42px',
                    opacity: busy ? 0.65 : 1,
                    pointerEvents: busy ? 'none' : 'auto',
                }}
            />
            {busy && (
                <p style={{ textAlign: 'center', fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Signing in with Google...
                </p>
            )}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginTop: '12px',
                    color: '#9ca3af',
                    fontSize: '12px',
                    fontWeight: 500,
                }}
            >
                <span style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                <span>or continue with email</span>
                <span style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
            </div>
        </div>
    );
};
