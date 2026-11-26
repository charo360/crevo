import React, { FC, useRef, useState, useEffect } from 'react';

interface VideoTrimmerProps {
    videoUrl: string;
    onVideoLoad: (duration: number) => void;
    trimTimes: { start: number; end: number };
    onTrimTimesChange: (t: { start: number; end: number }) => void;
    videoDuration: number;
}

export const VideoTrimmer: FC<VideoTrimmerProps> = ({ videoUrl, onVideoLoad, trimTimes, onTrimTimesChange, videoDuration }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const draggingHandle = useRef<'start' | 'end' | null>(null);

    const handleLoadedMetadata = () => {
        if (videoRef.current) {
            onVideoLoad(videoRef.current.duration);
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
            video.play();
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
                    className="trimmer-video"
                    playsInline
                    preload="metadata"
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        display: 'block',
                    }}
                    muted
                    playsInline
                />
            </div>
            <div className="trimmer-controls">
                <button type="button" className="trimmer-play-btn" onClick={togglePlay}>
                    {isPlaying ? <svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"></path></svg> : <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>}
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
