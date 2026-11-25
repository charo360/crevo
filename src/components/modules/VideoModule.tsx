import React, { FC, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { VideoAsset, AnalysisResult, VeoAspectRatio, Platform } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { VideoTrimmer } from './VideoTrimmer';

interface VideoModuleProps {
  videoAsset: VideoAsset | null;
  onVideoAssetChange: (v: VideoAsset | null) => void;
  trimTimes: { start: number; end: number };
  onTrimTimesChange: (t: { start: number; end: number }) => void;
  isAnalyzing: boolean;
  onAnalyzeVideo: () => void;
  analysisResult: AnalysisResult | null;
  onAnalysisResultChange: (r: AnalysisResult | null) => void;
  onExtractFaces: () => void;
  isExtractingFaces: boolean;
  isPrimary?: boolean;
  hideForImagePlatforms?: boolean;
  onGenerateVideo: (prompt: string, ar: VeoAspectRatio) => void;
  isGeneratingVideo: boolean;
  platform: Platform;
}

export const VideoModule: FC<VideoModuleProps> = (props) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const loadVideoFile = (file: File) => {
    try {
      // Video is processed locally in the browser to extract frames (never uploaded in full)
      if (file.size > 10 * 1024 * 1024 * 1024) {
        toast.error('Video file size must be less than 10GB');
        return;
      }
      if (!file.type.startsWith('video/')) {
        toast.error('Please upload a valid video file (MP4, MOV, WebM)');
        return;
      }
      if (props.videoAsset?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(props.videoAsset.url);
      }
      const url = URL.createObjectURL(file);
      props.onVideoAssetChange({ id: `vid_${Date.now()}`, file, url });
      props.onAnalysisResultChange(null);
      toast.success('Video uploaded! Trim the clip or click Analyze Style / Generate.');
    } catch (error: any) {
      toast.error(`Failed to upload video: ${error.message || 'Unknown error'}`);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      loadVideoFile(file);
    }
    event.target.value = '';
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadVideoFile(file);
    }
  };

  const handleVideoLoad = (duration: number) => {
    setVideoDuration(duration);
    props.onTrimTimesChange({ start: 0, end: duration });
  };

  const handleRemoveVideo = () => {
    if (props.videoAsset?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(props.videoAsset.url);
    }
    props.onVideoAssetChange(null);
    setVideoDuration(0);
    props.onAnalysisResultChange(null);
  };

  if (props.hideForImagePlatforms) return null;

  const title = props.isPrimary ? 'Start with a Video' : 'Or Upload a Video';

  return (
    <Module icon={ICONS.VIDEO} title={title}>
      {props.videoAsset ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Single clean VideoTrimmer player with Remove button */}
          <div style={{ position: 'relative' }}>
            <VideoTrimmer
              videoUrl={props.videoAsset.url}
              onVideoLoad={handleVideoLoad}
              trimTimes={props.trimTimes}
              onTrimTimesChange={props.onTrimTimesChange}
              videoDuration={videoDuration}
            />
            <button
              type="button"
              onClick={handleRemoveVideo}
              title="Remove video"
              aria-label="Remove video"
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                zIndex: 5,
                background: 'rgba(0, 0, 0, 0.72)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '999px',
                width: '26px',
                height: '26px',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={props.onAnalyzeVideo}
              disabled={props.isAnalyzing || props.isExtractingFaces}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: 'none',
                background: 'var(--primary, #571c86)',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: props.isAnalyzing ? 'wait' : 'pointer',
                opacity: props.isAnalyzing ? 0.7 : 1,
              }}
            >
              {props.isAnalyzing ? 'Analyzing...' : 'Analyze Style'}
            </button>
            <button
              type="button"
              onClick={props.onExtractFaces}
              disabled={props.isExtractingFaces || props.isAnalyzing}
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-color, #e4dcf2)',
                background: 'var(--surface-2, #f3ecfa)',
                color: 'var(--primary, #571c86)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: props.isExtractingFaces ? 'wait' : 'pointer',
                opacity: props.isExtractingFaces ? 0.7 : 1,
              }}
            >
              {props.isExtractingFaces ? 'Extracting...' : 'Extract Faces'}
            </button>
          </div>

          {props.analysisResult && (
            <div
              style={{
                padding: '8px 10px',
                borderRadius: '8px',
                background: 'var(--surface-2, #f3ecfa)',
                border: '1px solid var(--border-color, #e4dcf2)',
                fontSize: '12px',
                color: 'var(--text-primary, #111111)',
              }}
            >
              Suggested style applied: <strong>{props.analysisResult.suggestedStyle}</strong>
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            border: isDragging
              ? '2px dashed var(--primary, #571c86)'
              : '2px dashed var(--border-color, #e4dcf2)',
            borderRadius: '12px',
            background: isDragging ? 'var(--surface-2, #f3ecfa)' : 'var(--background, #f8f5ed)',
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <svg
            width="42"
            height="42"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--primary, #571c86)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.8, marginBottom: '8px' }}
          >
            <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <p style={{ margin: '0 0 4px', fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary, #111111)' }}>
            {isDragging ? 'Drop your video here' : 'Drag & drop a video or click to browse'}
          </p>
          <p style={{ margin: 0, fontSize: '11.5px', color: 'var(--text-secondary, #5e5a67)' }}>
            MP4, MOV, WebM up to 10GB — stays local & extracts key frames from your selected clip range
          </p>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*"
            style={{ display: 'none' }}
          />
        </div>
      )}
    </Module>
  );
};
