import React, { FC, useState, useRef, useEffect } from 'react';

interface GuideMessage {
    id: number;
    sender: 'user' | 'guide';
    text: string;
}

interface HelpTopic {
    id: string;
    label: string;
    keywords: string[];
    answer: string;
}

const HELP_TOPICS: HelpTopic[] = [
    {
        id: 'thumbnail',
        label: 'Make a Thumbnail',
        keywords: [
            'thumbnail', 'studio', 'create', 'design', 'generate', 'image', 'photo', 'face',
            'headline', 'text', 'title', 'color', 'style', 'vibe', 'brand', 'logo', 'how to start', 'start'
        ],
        answer:
            'How to create a thumbnail in Studio:\n' +
            '1. Upload your subject photo (or pick frames from a video).\n' +
            '2. Enter your main headline and optional subtitle.\n' +
            '3. Pick a Vibe/Style, colors, and Output Size (16:9 YouTube, 9:16 Shorts/TikTok, 1:1, or 4:5).\n' +
            '4. Click "Generate Designs".\n\n' +
            'On mobile, use the top switcher (Create ⇄ Results) to jump between your settings and finished designs.'
    },
    {
        id: 'clips',
        label: 'Clip a YouTube Video',
        keywords: [
            'clip', 'clips', 'youtube', 'url', 'link', 'paste', 'video', 'repurpose', 'short',
            'shorts', 'tiktok', 'reel', 'reels', 'caption', 'subtitle', 'subtitles', '1080', 'hd', 'background', 'queue', 'close tab'
        ],
        answer:
            'How to turn a long video into viral clips:\n' +
            '1. Open the "Clips" tab.\n' +
            '2. Paste any YouTube link (or upload an MP4/MOV/WebM file).\n' +
            '3. Choose your clip length, aspect ratio (9:16 vertical, 16:9, 1:1, or 4:5), and caption style.\n' +
            '4. Tap "Generate Clips".\n\n' +
            'Tip: Clips render in 1080p HD in the background — you can safely close the tab and we will email you as soon as they are ready!'
    },
    {
        id: 'cover',
        label: 'Cover Thumbnail from Clip',
        keywords: [
            'cover', 'make cover', 'clip thumbnail', 'from clip', 'best shot', 'frame', 'portrait'
        ],
        answer:
            'How to make a Cover Thumbnail from any clip:\n' +
            '1. After your clips finish in the "Clips" tab, tap "Make Cover Thumbnail" on the clip you want.\n' +
            '2. Crevo automatically picks the sharpest, brightest face frames from that clip.\n' +
            '3. It opens Thumbnail Studio with those photos loaded and auto-matches the aspect ratio (e.g., 9:16 for vertical clips) so you can generate a matching cover in one click.'
    },
    {
        id: 'resize-edit',
        label: 'Resize & AI Edit',
        keywords: [
            'resize', 'adapt', 'aspect', 'ratio', '16:9', '9:16', '1:1', '4:5', 'edit',
            'magic', 'brush', 'upscale', 'change', 'fix', 'remove', 'recolor', 'canvas'
        ],
        answer:
            'How to Resize or AI-Edit a design:\n' +
            'Look at the icon bar at the top of any generated thumbnail card:\n' +
            '• Resize (arrows icon): Adapt the design to YouTube (16:9), TikTok/Shorts (9:16), Square (1:1), or Instagram (4:5).\n' +
            '• AI Edit (pencil icon): Paint over any area and describe what to change.\n' +
            '• Upscale (expand icon): Enhance sharpness and detail.\n' +
            '• Eye icon: Full-screen preview.\n' +
            '• Download icon: Save the PNG directly to your device.'
    },
    {
        id: 'credits',
        label: 'Credits & Plans',
        keywords: [
            'credit', 'credits', 'price', 'pricing', 'plan', 'plans', 'cost', 'costing',
            'pay', 'payment', 'stripe', 'upgrade', 'top up', 'buy', 'subscription', 'billing', 'out of credits', 'free'
        ],
        answer:
            'How Crevo credits work:\n' +
            '• Starter Pack: $9 one-time (50 credits)\n' +
            '• Creator Plan: $29/month (250 credits)\n' +
            '• Pro Plan: $99/month (1,000 credits)\n\n' +
            'You can check your balance or top up anytime under Account / Pricing, or right from the upgrade popup when your balance runs low.'
    },
    {
        id: 'affiliate',
        label: '30% Affiliate Program',
        keywords: [
            'affiliate', 'affiliates', 'refer', 'referral', 'commission', 'earn', 'money',
            'payout', 'payouts', 'withdraw', 'paypal', 'wise', 'bank', 'vanity', 'code', 'link'
        ],
        answer:
            'How the Crevo Affiliate Program works:\n' +
            '1. Open "Affiliates" from the menu to get your personal referral link (you can also set a custom code).\n' +
            '2. Earn 30% commission for 12 months on every paying creator who signs up through your link.\n' +
            '3. Add your payout details (PayPal, Wise, or Bank Transfer) on the Affiliates page.\n\n' +
            'Payouts are sent automatically at the end of each month once your eligible balance reaches $25 (after the 14-day refund hold) — no withdraw button needed!'
    },
    {
        id: 'library',
        label: 'Library & Downloads',
        keywords: [
            'library', 'saved', 'history', 'download', 'downloads', 'where', 'find', 'old', 'previous', 'export'
        ],
        answer:
            'Where to find your saved work:\n' +
            'Open the "Library" tab (in the top bar on desktop or bottom nav on mobile) to view and download your previously generated thumbnails and clips anytime.'
    },
    {
        id: 'mobile-app',
        label: 'Install on Phone',
        keywords: [
            'phone', 'mobile', 'install', 'home screen', 'pwa', 'app', 'iphone', 'ios', 'android'
        ],
        answer:
            'Install Crevo on your phone like an app:\n' +
            '• iPhone (Safari): Tap the Share icon → "Add to Home Screen".\n' +
            '• Android (Chrome): Tap the 3-dot menu → "Add to Home screen" or "Install app".\n\n' +
            'Crevo will launch full-screen with the mobile bottom navigation bar.'
    },
    {
        id: 'support',
        label: 'Contact Support',
        keywords: [
            'support', 'help', 'contact', 'email', 'bug', 'error', 'issue', 'problem', 'broken', 'human', 'refund', 'cancel'
        ],
        answer:
            'Need help with your account, billing, or a bug?\n' +
            'Email our team anytime at sam@crevo.app and include the email address on your Crevo account so we can help right away.'
    }
];

function findBestGuideAnswer(query: string): string {
    const normalized = query.toLowerCase().trim();
    if (!normalized) {
        return 'Tap one of the quick topics above or ask how to use Studio, Clips, Resize, Credits, or the Affiliate Program.';
    }

    if (/^(hi|hello|hey|yo|sup|good morning|good afternoon|good evening)\b/.test(normalized) && normalized.length < 25) {
        return 'Hi! I am the Crevo Help Guide. Tap any topic above or ask me how to create thumbnails, clip YouTube videos, resize designs, manage credits, or earn 30% as an affiliate.';
    }

    let bestTopic: HelpTopic | null = null;
    let bestScore = 0;

    for (const topic of HELP_TOPICS) {
        let score = 0;
        for (const kw of topic.keywords) {
            if (normalized.includes(kw)) {
                score += kw.includes(' ') ? 3 : 2;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestTopic = topic;
        }
    }

    if (bestTopic && bestScore > 0) {
        return bestTopic.answer;
    }

    return (
        'I only answer how-to questions about the Crevo AI app (Thumbnail Studio, YouTube Clips, Resize & AI Edit, Credits, Library, and the 30% Affiliate Program).\n\n' +
        'Try tapping one of the quick topics above, or email sam@crevo.app for personal support.'
    );
}

interface AssistantPanelProps {
    onClose: () => void;
}

export const AssistantPanel: FC<AssistantPanelProps> = ({ onClose }) => {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<GuideMessage[]>([
        {
            id: 1,
            sender: 'guide',
            text: 'Welcome to Crevo Help Guide! Pick a topic below or ask how to use any feature in the app.'
        }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const pushQuestion = (questionText: string, directAnswer?: string) => {
        const clean = questionText.trim();
        if (!clean) return;
        const answer = directAnswer ?? findBestGuideAnswer(clean);
        const now = Date.now();
        setMessages(prev => [
            ...prev,
            { id: now, sender: 'user', text: clean },
            { id: now + 1, sender: 'guide', text: answer }
        ]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        pushQuestion(input);
        setInput('');
    };

    return (
        <>
            <div className="assistant-backdrop" onClick={onClose} aria-hidden="true" />
            <div className="assistant-panel" role="dialog" aria-label="Crevo Help Guide">
                <div className="assistant-header">
                    <div className="assistant-header-title">
                        <span className="assistant-header-badge">?</span>
                        <div>
                            <h3>Crevo Help Guide</h3>
                            <span>Instant answers for using the app</span>
                        </div>
                    </div>
                    <button
                        type="button"
                        className="assistant-close-btn"
                        onClick={onClose}
                        aria-label="Close Help Guide"
                    >
                        &times;
                    </button>
                </div>

                <div className="assistant-topics" aria-label="Quick help topics">
                    {HELP_TOPICS.slice(0, 6).map(topic => (
                        <button
                            key={topic.id}
                            type="button"
                            className="assistant-topic-chip"
                            onClick={() => pushQuestion(topic.label, topic.answer)}
                        >
                            {topic.label}
                        </button>
                    ))}
                </div>

                <div className="assistant-messages">
                    {messages.map(msg => (
                        <div key={msg.id} className={`message-bubble ${msg.sender === 'user' ? 'user' : 'ai'}`}>
                            <p>{msg.text}</p>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                <form className="assistant-input-form" onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask how to use Crevo..."
                    />
                    <button type="submit" disabled={!input.trim()} aria-label="Send question">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13" />
                            <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                    </button>
                </form>

                <div className="assistant-footer-note">
                    Need human help? <a href="mailto:sam@crevo.app">sam@crevo.app</a>
                </div>
            </div>
        </>
    );
};
