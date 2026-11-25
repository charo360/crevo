import React, { createContext, useContext, useEffect, useState, FC, useCallback } from 'react';
import { apiRequest, getAuthToken, setAuthToken } from '../lib/api';
import { getUserCredits, CreditBalance } from '../services/payments/creditService';

export interface AuthUser {
    id: string;
    email: string;
    created_at?: string;
}

export interface AuthSession {
    access_token: string;
    user: AuthUser;
}

interface AuthContextType {
    user: AuthUser | null;
    session: AuthSession | null;
    loading: boolean;
    credits: CreditBalance | null;
    refreshCredits: () => Promise<void>;
    signIn: (email: string, password: string) => Promise<{ error: any }>;
    signUp: (email: string, password: string) => Promise<{ error: any; session?: AuthSession | null }>;
    signInWithGoogle: (credential: string) => Promise<{ error: any; isNewUser?: boolean }>;
    updateProfile: (updates: { email?: string; password?: string }) => Promise<{ error: any }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [session, setSession] = useState<AuthSession | null>(null);
    const [loading, setLoading] = useState(true);
    const [credits, setCredits] = useState<CreditBalance | null>(null);

    const refreshCredits = useCallback(async () => {
        if (!user?.id) {
            setCredits(null);
            return;
        }

        try {
            const freshCredits = await getUserCredits(user.id, true);
            setCredits(freshCredits);

            if (freshCredits) {
                localStorage.setItem(
                    `credits_${user.id}`,
                    JSON.stringify({
                        ...freshCredits,
                        lastUpdated: Date.now(),
                    })
                );
            }
        } catch (error) {
            console.error('Error refreshing credits:', error);
        }
    }, [user?.id]);

    useEffect(() => {
        const initializeAuth = async () => {
            const token = getAuthToken();
            if (!token) {
                setLoading(false);
                return;
            }

            try {
                const data = await apiRequest<{ user: AuthUser }>('/api/auth/me');
                setUser(data.user);
                setSession({ access_token: token, user: data.user });
            } catch (err) {
                console.warn('Stored session invalid or expired:', err);
                setAuthToken(null);
                setSession(null);
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        initializeAuth();
    }, []);

    useEffect(() => {
        if (user?.id) {
            refreshCredits();
        } else {
            setCredits(null);
        }
    }, [user?.id, refreshCredits]);

    const signIn = async (email: string, password: string) => {
        try {
            const data = await apiRequest<{ user: AuthUser; token: string }>('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            setAuthToken(data.token);
            const newSession: AuthSession = { access_token: data.token, user: data.user };
            setUser(data.user);
            setSession(newSession);

            return { error: null };
        } catch (err: any) {
            console.error('Sign in error:', err);
            return {
                error: {
                    message:
                        err.message ||
                        'Failed to connect to authentication server. Please check that the API server is running.',
                    name: err.status ? 'AuthError' : 'NetworkError',
                },
            };
        }
    };

    const signUp = async (email: string, password: string) => {
        try {
            const data = await apiRequest<{ user: AuthUser; token: string }>('/api/auth/signup', {
                method: 'POST',
                body: JSON.stringify({ email, password }),
            });

            setAuthToken(data.token);
            const newSession: AuthSession = { access_token: data.token, user: data.user };
            setUser(data.user);
            setSession(newSession);

            return { error: null, session: newSession };
        } catch (err: any) {
            console.error('Sign up error:', err);
            return {
                error: {
                    message:
                        err.message ||
                        'Failed to connect to authentication server. Please check that the API server is running.',
                    name: err.status ? 'AuthError' : 'NetworkError',
                },
            };
        }
    };

    const signInWithGoogle = useCallback(async (credential: string) => {
        try {
            const data = await apiRequest<{ user: AuthUser; token: string; isNewUser?: boolean }>('/api/auth/google', {
                method: 'POST',
                body: JSON.stringify({ credential }),
            });

            setAuthToken(data.token);
            const newSession: AuthSession = { access_token: data.token, user: data.user };
            setUser(data.user);
            setSession(newSession);

            return { error: null, isNewUser: Boolean(data.isNewUser) };
        } catch (err: any) {
            console.error('Google sign in error:', err);
            return {
                error: {
                    message: err.message || 'Failed to sign in with Google. Please try again.',
                    name: err.status ? 'AuthError' : 'NetworkError',
                },
            };
        }
    }, []);

    const updateProfile = async (updates: { email?: string; password?: string }) => {
        try {
            const data = await apiRequest<{ user: AuthUser; token: string }>('/api/auth/profile', {
                method: 'PATCH',
                body: JSON.stringify(updates),
            });

            setAuthToken(data.token);
            setUser(data.user);
            setSession({ access_token: data.token, user: data.user });

            return { error: null };
        } catch (err: any) {
            return {
                error: {
                    message: err.message || 'Failed to update profile',
                },
            };
        }
    };

    const signOut = async () => {
        if (user?.id) {
            localStorage.removeItem(`credits_${user.id}`);
        }
        setAuthToken(null);
        setUser(null);
        setSession(null);
        setCredits(null);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                loading,
                credits,
                refreshCredits,
                signIn,
                signUp,
                signInWithGoogle,
                updateProfile,
                signOut,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
