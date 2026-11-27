import React, { FC, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { VideoAsset, AnalysisResult, VeoAspectRatio, Platform } from '../../types';
import { Module } from './Module';
import { ICONS } from '../../constants';
import { VideoTrimmer } from './VideoTrimmer';
import { isSupportedVideoFile } from '../../shared/utils/video-utils';
import { getAuthToken } from '../../lib/api';

const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

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
  const [isConvertingVideo, setIsConvertingVideo] = useState(false);
  const [conversionError, setConversionError] = useState<string | null>(null);
  const convertedVideoIdRef = useRef<string | null>(null);

  const loadVideoFile = async (rawFile: File) => {
    try {
      // Video is processed locally in the browser to extract frames (never uploaded in full)
      if (rawFile.size > 10 * 1024 * 1024 * 1024) {
        toast.error('Video file size must be less than 10GB');
        return;
      }
      if (!isSupportedVideoFile(rawFile)) {
        toast.error('Please upload a valid video file (MP4, MOV, WebM, M4V, 3GP)');
        return;
      }
      if (props.videoAsset?.url?.startsWith('blob:')) {
        URL.revokeObjectURL(props.videoAsset.url);
      }
      setVideoDuration(0);
      setIsConvertingVideo(false);
      setConversionError(null);
      convertedVideoIdRef.current = null;

      // On Android Chrome, WhatsApp/Gallery picker returns a temporary content:// handle
      // that can fail to play or upload after a few seconds. Copying <= 120 MB videos into
      // an in-memory File immediately makes playback and H.264 fallback rock-solid.
      let file = rawFile;
      if (rawFile.size > 0 && rawFile.size <= 120 * 1024 * 1024) {
        try {
          const buf = await rawFile.arrayBuffer();
          file = new File([buf], rawFile.name || 'video.mp4', {
            type: rawFile.type || 'video/mp4',
            lastModified: rawFile.lastModified || Date.now(),
          });
        } catch {
          // Fallback to original handle if memory copy fails
          file = rawFile;
        }
      }

      const url = URL.createObjectURL(file);
      props.onVideoAssetChange({ id: `vid_${Date.now()}`, file, url });
      props.onAnalysisResultChange(null);
      toast.success('Video uploaded! Trim the clip or click Analyze Style / Generate.');
    } catch (error: any) {
      toast.error(`Failed to upload video: ${error.message || 'Unknown error'}`);
    }
  };

  const transcodePreviewViaXhr = (file: File, token: string): Promise<{ uploadId: string }> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/video/transcode-preview`, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      xhr.timeout = 180000;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.uploadId) {
              resolve(parsed);
              return;
            }
          } catch {
            // fall through
          }
          reject(new Error('Invalid response from video converter.'));
        } else {
          let errMsg = `Video conversion failed (${xhr.status})`;
          try {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.error) errMsg = parsed.error;
          } catch {
            // ignore
          }
          reject(new Error(errMsg));
        }
      };

      xhr.onerror = () => reject(new Error('Network error while optimizing phone video. Please try again.'));
      xhr.ontimeout = () => reject(new Error('Video optimization timed out. Try a shorter clip.'));
      xhr.send(file);
    });
  };

  const downloadBlobViaXhr = (url: string, token: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.responseType = 'blob';
      xhr.timeout = 120000;

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response instanceof Blob) {
          resolve(xhr.response);
        } else {
          reject(new Error(`Could not load converted video (${xhr.status})`));
        }
      };
      xhr.onerror = () => reject(new Error('Network error while loading converted video.'));
      xhr.ontimeout = () => reject(new Error('Timed out loading converted video.'));
      xhr.send();
    });
  };

  const handleVideoPlaybackError = async () => {
    const asset = props.videoAsset;
    if (!asset?.file || isConvertingVideo || convertedVideoIdRef.current === asset.id) return;

    const MAX_AUTO_CONVERT_BYTES = 250 * 1024 * 1024;
    if (asset.file.size > MAX_AUTO_CONVERT_BYTES) {
      setConversionError('This phone video uses an HEVC/HDR codec larger than 250 MB. Please export as standard H.264 MP4 and try again.');
      return;
    }

    const token = getAuthToken();
    if (!token) {
      setConversionError('This video codec (HEVC/HDR) is not supported by your browser. Try a standard MP4 (H.264) video.');
      return;
    }

    convertedVideoIdRef.current = asset.id;
    setIsConvertingVideo(true);
    setConversionError(null);
    toast.info('Optimizing phone video format (H.264)...');

    try {
      let data: { uploadId: string };
      try {
        data = await transcodePreviewViaXhr(asset.file, token);
      } catch (firstErr) {
        // Retry once for flaky mobile connections
        await new Promise((r) => setTimeout(r, 700));
        data = await transcodePreviewViaXhr(asset.file, token);
      }

      const mp4Blob = await downloadBlobViaXhr(`${API_BASE}/api/video/stream/${data.uploadId}`, token);
      const baseName = (asset.file.name || 'video').replace(/\.[^.]+$/, '');
      const convertedFile = new File([mp4Blob], `${baseName}.mp4`, { type: 'video/mp4' });
      const convertedUrl = URL.createObjectURL(convertedFile);
      const nextId = `vid_h264_${Date.now()}`;
      convertedVideoIdRef.current = nextId;

      if (asset.url?.startsWith('blob:')) {
        URL.revokeObjectURL(asset.url);
      }
      props.onVideoAssetChange({ id: nextId, file: convertedFile, url: convertedUrl });
      toast.success('Video optimized and ready!');
    } catch (err: any) {
      console.error('Auto H.264 preview conversion failed:', err);
      setConversionError(err?.message || 'This phone video codec could not be converted. Please try again.');
    } finally {
      setIsConvertingVideo(false);
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
    setIsConvertingVideo(false);
    setConversionError(null);
    convertedVideoIdRef.current = null;
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
              onVideoError={handleVideoPlaybackError}
              isConverting={isConvertingVideo}
              conversionError={conversionError}
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
            flexDirection: 'row',
            alignItems: 'center',
            gap: '12px',
            border: isDragging
              ? '1.5px dashed var(--primary, #571c86)'
              : '1.5px dashed var(--border-color, #d8ccf0)',
            borderRadius: '10px',
            background: isDragging ? 'var(--surface-2, #f3ecfa)' : 'var(--background, #f8f5ed)',
            padding: '11px 14px',
            textAlign: 'left',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: '#f3e8ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--primary, #571c86)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-primary, #111111)', lineHeight: 1.3 }}>
              {isDragging ? 'Drop your video here' : 'Drop video or click to browse'}
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary, #5e5a67)', lineHeight: 1.3 }}>
              MP4, MOV, WebM up to 10GB · local frames
            </p>
          </div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="video/*,.mp4,.mov,.m4v,.webm,.mkv,.3gp,.avi"
            style={{ display: 'none' }}
          />
        </div>
      )}
    </Module>
  );
};
