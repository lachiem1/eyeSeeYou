'use client';

import React, { useRef, useEffect } from 'react';

interface VideoPlayerProps {
  videoUrl: string | null;
  isLoading?: boolean;
}

export default function VideoPlayer({ videoUrl, isLoading = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && videoUrl) {
      videoRef.current.src = videoUrl;
    }
  }, [videoUrl]);

  return (
    <div className="w-full bg-background-secondary rounded-lg border border-border-primary overflow-hidden">
      {isLoading ? (
        <div className="w-full aspect-video bg-background-tertiary flex items-center justify-center">
          <div className="animate-pulse-slow">
            <svg className="w-12 h-12 text-accent-primary" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
              <path d="M10 8a1 1 0 100-2 1 1 0 000 2z" fill="white" />
            </svg>
          </div>
        </div>
      ) : videoUrl ? (
        <video
          ref={videoRef}
          controls
          className="w-full h-auto bg-black"
          controlsList="nodownload"
        >
          <source src={videoUrl} type="video/mp4" />
          Your browser does not support the video tag.
        </video>
      ) : (
        <div className="w-full aspect-video bg-background-tertiary flex items-center justify-center">
          <div className="text-center">
            <svg className="w-16 h-16 text-text-muted mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <p className="text-text-secondary">No video yet</p>
            <p className="text-text-muted text-sm">Waiting for detection...</p>
          </div>
        </div>
      )}
    </div>
  );
}
