/**
 * App Routes Configuration
 * Professional routing setup with lazy loading and code splitting
 */

import React, { FC, Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RouteSEO } from '../components/SEO';
import { AppRoutePaths } from './paths';

// ==================== Lazy Loading Components ====================
// Public Pages
const LandingPage = lazy(() => 
  import('../pages/LandingPage').then(m => ({ default: m.LandingPage }))
);
const LoginPage = lazy(() => 
  import('../pages/LoginPage').then(m => ({ default: m.LoginPage }))
);
const SignupPage = lazy(() => 
  import('../pages/SignupPage').then(m => ({ default: m.SignupPage }))
);
const ForgotPasswordPage = lazy(() =>
  import('../pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage }))
);
const ResetPasswordPage = lazy(() =>
  import('../pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage }))
);
const FeaturesPage = lazy(() => 
  import('../pages/FeaturesPage').then(m => ({ default: m.FeaturesPage }))
);
const PricingPage = lazy(() => 
  import('../pages/PricingPage').then(m => ({ default: m.PricingPage }))
);
const BusinessPage = lazy(() => 
  import('../pages/BusinessPage').then(m => ({ default: m.BusinessPage }))
);

// Platform Pages
const YouTubePage = lazy(() => 
  import('../pages/platforms/YouTubePage').then(m => ({ default: m.YouTubePage }))
);
const PodcastPage = lazy(() => 
  import('../pages/platforms/PodcastPage').then(m => ({ default: m.PodcastPage }))
);
const TikTokPage = lazy(() => 
  import('../pages/platforms/TikTokPage').then(m => ({ default: m.TikTokPage }))
);
const TwitterPage = lazy(() => 
  import('../pages/platforms/TwitterPage').then(m => ({ default: m.TwitterPage }))
);
const RepurposePage = lazy(() => 
  import('../pages/platforms/RepurposePage').then(m => ({ default: m.RepurposePage }))
);
const YouTubeTranscriptToolPage = lazy(() =>
  import('../pages/tools/YouTubeTranscriptToolPage').then(m => ({ default: m.YouTubeTranscriptToolPage }))
);
const ImageResizerToolPage = lazy(() =>
  import('../pages/tools/ImageResizerToolPage').then(m => ({ default: m.ImageResizerToolPage }))
);

// Protected Pages
const StudioPage = lazy(() => 
  import('../pages/StudioPage').then(m => ({ default: m.StudioPage }))
);
const ProfilePage = lazy(() => 
  import('../pages/ProfilePage').then(m => ({ default: m.ProfilePage }))
);
const CreditManagementPage = lazy(() => 
  import('../pages/CreditManagementPage').then(m => ({ default: m.CreditManagementPage }))
);
const AdminPage = lazy(() =>
  import('../pages/AdminPage').then(m => ({ default: m.AdminPage }))
);
const LibraryPage = lazy(() =>
  import('../pages/LibraryPage').then(m => ({ default: m.LibraryPage }))
);

// ==================== Loading Fallback ====================
const LoadingFallback: FC = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100vh',
    fontSize: '1.2rem',
    color: '#666'
  }}>
    <div style={{ textAlign: 'center' }}>
      <div className="spinner" style={{ 
        width: '40px', 
        height: '40px', 
        borderWidth: '4px',
        margin: '0 auto 1rem'
      }}></div>
      <p>Loading...</p>
    </div>
  </div>
);

// ==================== App Routes Component ====================
export const AppRoutes: FC = () => {
  return (
    <ErrorBoundary>
      <RouteSEO />
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Public Routes */}
          <Route path={AppRoutePaths.home} element={<LandingPage />} />
          <Route path="/tools/youtube-transcript" element={<YouTubeTranscriptToolPage />} />
          <Route path="/tools/image-resizer" element={<ImageResizerToolPage />} />
          <Route
            path="/tools/youtube-thumbnail-resizer"
            element={
              <ImageResizerToolPage
                defaultPresetId="yt_thumb"
                heading="AI YouTube Thumbnail Resizer (1280×720 Without Cropping)"
                subheading="Convert any vertical or square photo into a sharp 16:9 YouTube thumbnail — Crevo AI extends the background naturally with zero black bars."
              />
            }
          />
          <Route
            path="/tools/tiktok-image-resizer"
            element={
              <ImageResizerToolPage
                defaultPresetId="vertical"
                heading="AI TikTok & YouTube Shorts 9:16 Image Resizer"
                subheading="Turn wide horizontal thumbnails and photos into full-screen 1080×1920 vertical covers for TikTok, YouTube Shorts, and Instagram Reels."
              />
            }
          />
          <Route
            path="/tools/instagram-image-resizer"
            element={
              <ImageResizerToolPage
                defaultPresetId="ig_portrait"
                heading="AI Instagram 4:5 & 1:1 Image Resizer Without Cropping"
                subheading="Resize any photo to Instagram Portrait (1080×1350) or Square (1080×1080) — Crevo AI fills the edges seamlessly so subjects stay centered."
              />
            }
          />
          <Route path={AppRoutePaths.login} element={<LoginPage />} />
          <Route path={AppRoutePaths.signup} element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path={AppRoutePaths.features} element={<FeaturesPage />} />
          <Route path={AppRoutePaths.pricing} element={<PricingPage />} />
          <Route path={AppRoutePaths.business} element={<BusinessPage />} />

          {/* Platform Information Pages */}
          <Route path={AppRoutePaths.platforms.youtube} element={<YouTubePage />} />
          <Route path={AppRoutePaths.platforms.podcast} element={<PodcastPage />} />
          <Route path={AppRoutePaths.platforms.tiktok} element={<TikTokPage />} />
          <Route path={AppRoutePaths.platforms.twitter} element={<TwitterPage />} />
          <Route path={AppRoutePaths.platforms.repurpose} element={<RepurposePage />} />

          {/* Protected Dashboard Routes */}
          <Route
            path={AppRoutePaths.dashboard.root}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="home" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.home}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="home" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.improveThumbnail}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="improve-thumbnail" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.youtubeThumbnail}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="youtube-thumbnail" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.podcastCover}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="podcast-cover" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.contentRepurpose}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="content-repurpose" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.twitterCard}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="twitter-card" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.tiktokThumbnail}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="tiktok-thumbnail" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.resizeImage}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="resize" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.dashboard.youtubeTools}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <StudioPage view="youtube-tools" />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Profile & Admin Routes */}
          <Route
            path="/dashboard/library"
            element={
              <ProtectedRoute>
                <LibraryPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path={AppRoutePaths.profile}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <ProfilePage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Credit Management Route */}
          <Route
            path={AppRoutePaths.creditManagement}
            element={
              <ProtectedRoute>
                <ErrorBoundary>
                  <CreditManagementPage />
                </ErrorBoundary>
              </ProtectedRoute>
            }
          />

          {/* Catch-all redirect to home */}
          <Route path="*" element={<Navigate to={AppRoutePaths.home} replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};
