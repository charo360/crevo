import React from 'react';
import { Platform } from '../types';
import { ICONS } from './icons';

export const PLATFORM_CONFIGS: Record<Platform, { 
    title: string; 
    icon: React.ReactNode; 
    aspectRatio: string; 
    promptSnippet: string; 
}> = {
    youtube_improve: {
        title: "Improve Thumbnail",
        icon: ICONS.YOUTUBE,
        aspectRatio: "16:9",
        promptSnippet: "This is a special workflow to improve an existing YouTube thumbnail."
    },
    youtube: {
        title: "YouTube Thumbnail",
        icon: ICONS.YOUTUBE,
        aspectRatio: "16:9",
        promptSnippet: "This is for a YouTube video. The design must be highly clickable and stand out on the YouTube platform."
    },
    daily_post: {
        title: "Daily Post",
        icon: ICONS.DAILY_POST,
        aspectRatio: "4:5",
        promptSnippet: "This is a high-engagement daily social media post (Instagram, LinkedIn, X, Stories, or YouTube Community). Keep it clean, authentic, thumb-stopping, and tailored for social feeds."
    },
    podcast: {
        title: "Podcast Cover",
        icon: ICONS.PODCAST,
        aspectRatio: "1:1",
        promptSnippet: "This is for a podcast cover. The design needs to be square, bold, and clearly communicate the podcast's theme. It must be legible at small sizes on podcasting apps."
    },
    tiktok: {
        title: "TikTok Covers",
        icon: ICONS.TIKTOK,
        aspectRatio: "9:16",
        promptSnippet: "This is for a TikTok video cover. The design needs to be vertical, grab attention in the first second, and use bold, trendy text to hint at the video's content."
    },
    repurpose: {
        title: "Content Repurpose",
        icon: ICONS.ADAPT,
        aspectRatio: "9:16",
        promptSnippet: "This is for repurposing long videos into viral short-form content. AI analyzes the video to identify the most engaging moments, creates optimized clips for YouTube Shorts, TikTok, Instagram Reels, and other platforms. The content should be attention-grabbing, well-paced, and optimized for maximum engagement."
    },
    twitter: {
        title: "Twitter Card",
        icon: ICONS.TWITTER,
        aspectRatio: "1.91:1",
        promptSnippet: "This is for a Twitter card image. The design should be bold and concise to work well in a fast-moving feed."
    },
    resize: {
        title: "Resize Image",
        icon: ICONS.ADAPT,
        aspectRatio: "16:9",
        promptSnippet: "Smart AI resize and recomposition for any image or thumbnail across aspect ratios."
    },
    youtube_tools: {
        title: "Transcript & Thumb Downloader",
        icon: ICONS.DOWNLOAD,
        aspectRatio: "16:9",
        promptSnippet: "Download HD YouTube thumbnails and extract full video transcripts for free."
    }
};

export const PLATFORM_ORDER: Platform[] = ['youtube_improve', 'youtube', 'daily_post', 'resize', 'youtube_tools', 'podcast', 'tiktok', 'repurpose', 'twitter'];
