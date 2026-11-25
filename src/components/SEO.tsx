import { FC, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOConfig {
    title: string;
    description: string;
    path?: string;
    noIndex?: boolean;
}

const SITE_URL = 'https://crevo.app';

const ROUTE_SEO: Record<string, SEOConfig> = {
    '/': {
        title: 'Crevo AI — YouTube Thumbnail Generator & Viral Short Clip Studio',
        description:
            'Create high-CTR YouTube thumbnails, improve existing thumbnails with AI, repurpose long videos into viral Shorts, TikToks & Reels with auto-captions, and download transcripts in seconds.',
        path: '/',
    },
    '/features': {
        title: 'Features — AI Thumbnail Generator, Video Repurposing & Captions | Crevo',
        description:
            'Explore Crevo AI tools: Improve Thumbnail with CTR scoring, Fresh Concept Generator, 5GB Video-to-Shorts Repurposing with AI captions, Smart Resize, and YouTube Transcript Downloader.',
        path: '/features',
    },
    '/pricing': {
        title: 'Pricing — Flexible Credit Packs for Creators & Teams | Crevo',
        description:
            'Simple, transparent Crevo pricing. Start free and pay only for the AI thumbnails and viral short clips you generate — no hidden fees.',
        path: '/pricing',
    },
    '/business': {
        title: 'Crevo for Teams & Agencies — Scale Thumbnails & Short-Form Video',
        description:
            'Empower YouTube agencies, media teams, and brands with high-CTR AI thumbnail creation and automated short-form video repurposing.',
        path: '/business',
    },
    '/platforms/youtube': {
        title: 'AI YouTube Thumbnail Generator & CTR Improver | Crevo',
        description:
            'Design scroll-stopping 16:9 YouTube thumbnails from scratch or analyze and upgrade existing thumbnails with AI viral hook copywriting and CTR score cards.',
        path: '/platforms/youtube',
    },
    '/platforms/repurpose': {
        title: 'AI Video to Shorts, TikTok & Reels Repurposing with Captions | Crevo',
        description:
            'Upload videos up to 5GB and let Crevo AI detect top viral moments, crop to 9:16 vertical HD, add transitions, and burn in bold social captions automatically.',
        path: '/platforms/repurpose',
    },
    '/platforms/tiktok': {
        title: 'AI TikTok & Reels Cover Designer + Vertical Clip Maker | Crevo',
        description:
            'Create bold 9:16 TikTok covers and auto-cut viral vertical clips with AI subtitles in seconds using Crevo.',
        path: '/platforms/tiktok',
    },
    '/platforms/podcast': {
        title: 'AI Podcast Cover Art Generator & Clip Repurposer | Crevo',
        description:
            'Generate studio-grade 1:1 podcast cover art and turn long podcast episodes into viral short-form clips with Crevo.',
        path: '/platforms/podcast',
    },
    '/platforms/twitter': {
        title: 'AI X / Twitter Card & Video Clip Studio | Crevo',
        description:
            'Design eye-catching 1.91:1 X/Twitter social cards and widescreen 16:9 viral video clips that stop the scroll.',
        path: '/platforms/twitter',
    },
    '/tools/youtube-transcript': {
        title: 'Free YouTube Transcript & HD Thumbnail Downloader | Crevo AI',
        description:
            'Extract timestamped YouTube video transcripts and download full HD 1280x720 YouTube thumbnails free online — no login required to try.',
        path: '/tools/youtube-transcript',
    },
    '/tools/image-resizer': {
        title: 'Free AI Image Resizer Without Cropping (YouTube, TikTok, Instagram) | Crevo AI',
        description:
            'Smart AI image resizer that extends backgrounds naturally to 16:9, 9:16, 1:1, and 4:5 without cropping faces or text. Try 2 free AI Smart Resizes online.',
        path: '/tools/image-resizer',
    },
    '/tools/youtube-thumbnail-resizer': {
        title: 'YouTube Thumbnail Resizer 1280x720 (AI Resize Without Cropping) | Crevo AI',
        description:
            'Convert any vertical or square photo into a crisp 1280x720 (16:9) YouTube thumbnail using AI background extension — no black bars or awkward cropping.',
        path: '/tools/youtube-thumbnail-resizer',
    },
    '/tools/tiktok-image-resizer': {
        title: 'TikTok & YouTube Shorts 9:16 Image Resizer (AI Smart Expand) | Crevo AI',
        description:
            'Turn wide horizontal thumbnails and photos into vertical 1080x1920 (9:16) TikTok, Shorts & Reels covers automatically with Crevo AI Smart Resize.',
        path: '/tools/tiktok-image-resizer',
    },
    '/tools/instagram-image-resizer': {
        title: 'Instagram 4:5 & 1:1 Image Resizer Without Cropping | Crevo AI',
        description:
            'Resize any image to Instagram Portrait (1080x1350, 4:5) or Square (1080x1080, 1:1) using AI background fill so nothing gets cut off.',
        path: '/tools/instagram-image-resizer',
    },
    '/login': {
        title: 'Sign In — Crevo Studio',
        description: 'Sign in to your Crevo Studio account to create AI thumbnails and viral short clips.',
        path: '/login',
        noIndex: true,
    },
    '/signup': {
        title: 'Create Free Account — Crevo Studio',
        description: 'Create your free Crevo account and start generating high-CTR thumbnails and viral Shorts in seconds.',
        path: '/signup',
        noIndex: true,
    },
    '/forgot-password': {
        title: 'Forgot Password — Crevo Studio',
        description: 'Reset your Crevo Studio account password.',
        path: '/forgot-password',
        noIndex: true,
    },
    '/reset-password': {
        title: 'Reset Password — Crevo Studio',
        description: 'Set a new password for your Crevo Studio account.',
        path: '/reset-password',
        noIndex: true,
    },
};

function upsertMeta(selector: string, attrs: Record<string, string>) {
    let el = document.head.querySelector(selector) as HTMLMetaElement | null;
    if (!el) {
        el = document.createElement('meta');
        document.head.appendChild(el);
    }
    for (const [k, v] of Object.entries(attrs)) {
        el.setAttribute(k, v);
    }
}

export const RouteSEO: FC = () => {
    const location = useLocation();

    useEffect(() => {
        const pathname = location.pathname.replace(/\/+$/, '') || '/';
        const isPrivate = pathname.startsWith('/dashboard') || pathname.startsWith('/profile') || pathname.startsWith('/admin');

        const config: SEOConfig = isPrivate
            ? {
                  title: 'Crevo Studio — AI Thumbnail & Viral Clip Workspace',
                  description: 'Your Crevo AI creative workspace for thumbnails, resizing, transcripts, and viral clips.',
                  path: pathname,
                  noIndex: true,
              }
            : ROUTE_SEO[pathname] || ROUTE_SEO['/'];

        const canonicalUrl = `${SITE_URL}${config.path === '/' ? '/' : config.path}`;
        document.title = config.title;

        upsertMeta('meta[name="description"]', { name: 'description', content: config.description });
        upsertMeta('meta[name="robots"]', {
            name: 'robots',
            content: config.noIndex
                ? 'noindex, nofollow'
                : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
        });
        upsertMeta('meta[property="og:title"]', { property: 'og:title', content: config.title });
        upsertMeta('meta[property="og:description"]', { property: 'og:description', content: config.description });
        upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
        upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: config.title });
        upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: config.description });

        let canonical = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
        if (!canonical) {
            canonical = document.createElement('link');
            canonical.setAttribute('rel', 'canonical');
            document.head.appendChild(canonical);
        }
        canonical.setAttribute('href', canonicalUrl);
    }, [location.pathname]);

    return null;
};
