import React, { FC, useRef, useState, useEffect } from 'react';

interface VideoTrimmerProps {
    videoUrl: string;
    onVideoLoad: (duration: number) => void;
    onVideoError?: () => void;
    isConverting?: boolean;
    conversionError?: string | null;
    trimTimes: { start: number; end: number };
    onTrimTimesChange: (t: { start: number; end: number }) => void;
    videoDuration: number;
}

export const VideoTrimmer: FC<VideoTrimmerProps> = ({
    videoUrl,
    onVideoLoad,
    onVideoError,
    isConverting = false,
    conversionError = null,
    trimTimes,
    onTrimTimesChange,
    videoDuration,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const draggingHandle = useRef<'start' | 'end' | null>(null);
    const loadedForUrlRef = useRef<string | null>(null);
    const errorTriggeredForUrlRef = useRef<string | null>(null);

    // Force mobile browsers to load metadata & detect stalled HEVC/unsupported codecs
    useEffect(() => {
        loadedForUrlRef.current = null;
        errorTriggeredForUrlRef.current = null;
        setIsPlaying(false);
        setCurrentTime(0);

        const video = videoRef.current;
        if (video) {
            try {
                video.load();
            } catch {
                // ignore
            }
        }

        if (!videoUrl || isConverting) return;

        const stallTimer = window.setTimeout(() => {
            const v = videoRef.current;
            if (
                loadedForUrlRef.current !== videoUrl &&
                errorTriggeredForUrlRef.current !== videoUrl &&
                (!v || !v.duration || !isFinite(v.duration) || v.videoWidth === 0)
            ) {
                errorTriggeredForUrlRef.current = videoUrl;
                onVideoError?.();
            }
        }, 3500);

        return () => window.clearTimeout(stallTimer);
    }, [videoUrl, isConverting]);

    const handleLoadedMetadata = () => {
        const video = videoRef.current;
        if (!video) return;
        const dur = video.duration;
        if (!dur || !isFinite(dur) || dur <= 0 || video.videoWidth === 0) {
            if (errorTriggeredForUrlRef.current !== videoUrl) {
                errorTriggeredForUrlRef.current = videoUrl;
                onVideoError?.();
            }
            return;
        }
        loadedForUrlRef.current = videoUrl;
        onVideoLoad(dur);
        // Nudge mobile browsers off 0.00 so the first visible video frame paints immediately instead of a black screen
        try {
            if (video.currentTime === 0) {
                video.currentTime = Math.min(0.15, dur * 0.05);
            }
        } catch {
            // ignore
        }
    };

    const handleVideoElementError = () => {
        if (errorTriggeredForUrlRef.current !== videoUrl) {
            errorTriggeredForUrlRef.current = videoUrl;
            onVideoError?.();
        }
    };
    
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const updateTime = () => {
            setCurrentTime(video.currentTime);
            if (video.currentTime >= trimTimes.end) {
                video.pause();
                video.currentTime = trimTimes.start;
            }
        };
        const handlePlay = () => setIsPlaying(true);
        const handlePause = () => setIsPlaying(false);

        video.addEventListener('timeupdate', updateTime);
        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);
        
        return () => {
            video.removeEventListener('timeupdate', updateTime);
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [trimTimes.start, trimTimes.end]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) {
            video.pause();
        } else {
            if (video.currentTime < trimTimes.start || video.currentTime >= trimTimes.end) {
                 video.currentTime = trimTimes.start;
            }
            video.muted = isMuted;
            video.volume = 1;
            video.play().catch(() => {});
        }
    };

    const toggleMute = () => {
        const nextMuted = !isMuted;
        setIsMuted(nextMuted);
        if (videoRef.current) {
            videoRef.current.muted = nextMuted;
            if (!nextMuted) {
                videoRef.current.volume = 1;
            }
        }
    };
    
    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        const milliseconds = Math.floor((time % 1) * 100);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    };

    // Dragging logic
    const handleMouseDown = (handle: 'start' | 'end') => {
        draggingHandle.current = handle;
    };

    const handleMouseUp = () => {
        draggingHandle.current = null;
    };
    
    const handleMouseMove = (e: MouseEvent) => {
        if (!draggingHandle.current || !timelineRef.current || !videoDuration) return;
        
        const timeline = timelineRef.current;
        const rect = timeline.getBoundingClientRect();
        const position = (e.clientX - rect.left) / rect.width;
        const time = position * videoDuration;
        
        let newStart = trimTimes.start;
        let newEnd = trimTimes.end;

        if (draggingHandle.current === 'start') {
            newStart = Math.max(0, Math.min(time, trimTimes.end - 0.1));
        } else {
            newEnd = Math.min(videoDuration, Math.max(time, trimTimes.start + 0.1));
        }
        
        onTrimTimesChange({ start: newStart, end: newEnd });
    };

    useEffect(() => {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const safeDuration = videoDuration > 0 ? videoDuration : 1;
    const startPercent = videoDuration > 0 ? Math.max(0, Math.min(100, (trimTimes.start / safeDuration) * 100)) : 0;
    const endPercent = videoDuration > 0 ? Math.max(0, Math.min(100, ((safeDuration - trimTimes.end) / safeDuration) * 100)) : 0;
    const progressPercent = videoDuration > 0 ? Math.max(0, Math.min(100, (currentTime / safeDuration) * 100)) : 0;

    return (
        <div className="trimmer-container">
            <div
                className="trimmer-video-wrapper"
                style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 9',
                    maxHeight: '200px',
                    backgroundColor: '#0f0d14',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                 <video
                    ref={videoRef}
                    src={videoUrl}
                    onLoadedMetadata={handleLoadedMetadata}
                    onError={handleVideoElementError}
                    className="trimmer-video"
                    preload="auto"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block',
                    }}
                    muted={isMuted}
                    playsInline
                />
                {isConverting && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(15, 13, 20, 0.86)',
                            color: '#ffffff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '14px',
                            textAlign: 'center',
                            fontSize: '12.5px',
                            fontWeight: 600,
                        }}
                    >
                        <div className="spinner" style={{ width: '24px', height: '24px', borderWidth: '3px' }}></div>
                        <span>Optimizing phone video format (H.264)...</span>
                    </div>
                )}
                {!isConverting && conversionError && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'rgba(15, 13, 20, 0.9)',
                            color: '#f3e8ff',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '6px',
                            padding: '16px',
                            textAlign: 'center',
                            fontSize: '12px',
                            lineHeight: 1.45,
                        }}
                    >
                        <strong style={{ color: '#facc15', fontSize: '13px' }}>Unsupported phone video codec</strong>
                        <span>{conversionError}</span>
                    </div>
                )}
            </div>
            <div className="trimmer-controls">
                <button type="button" className="trimmer-play-btn" onClick={togglePlay} title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg> : <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>}
                </button>
                <button
                    type="button"
                    className="trimmer-play-btn"
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute video' : 'Mute video'}
                    aria-label={isMuted ? 'Unmute video' : 'Mute video'}
                >
                    {isMuted ? (
                        <svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"></path></svg>
                    ) : (
                        <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"></path></svg>
                    )}
                </button>
                <div className="trimmer-time-display">
                    {formatTime(currentTime)} / {formatTime(videoDuration)}
                </div>
            </div>
             <div className="trimmer-timeline-container" ref={timelineRef}>
                <div className="trimmer-timeline">
                    <div className="trimmer-timeline-progress" style={{ width: `${progressPercent}%` }}></div>
                    <div className="trimmer-timeline-range" style={{ left: `${startPercent}%`, right: `${endPercent}%` }}>
                         <div className="trimmer-timeline-handle" style={{ left: '0%' }} onMouseDown={() => handleMouseDown('start')}></div>
                         <div className="trimmer-timeline-handle" style={{ left: '100%' }} onMouseDown={() => handleMouseDown('end')}></div>
                    </div>
                </div>
            </div>
        </div>
    );
};
