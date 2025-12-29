'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { receiveMessage, deleteMessage, sleep } from '@/lib/aws/sqs';
import { getMostRecentVideo } from '@/lib/aws/s3';
import type { VideoNotification, SNSMessage } from '@/types/video';

const POLL_INTERVAL_MS = 1000; // 1 second between polls
const MAX_RETRIES = 3;
const BACKOFF_BASE = 2000; // 2 seconds
const MAX_BACKOFF = 60000; // 60 seconds max backoff

interface UseSQSPollingReturn {
  latestVideo: VideoNotification | null;
  isPolling: boolean;
  lastPollTime: Date | null;
}

export function useSQSPolling(isAuthenticated: boolean): UseSQSPollingReturn {
  const [latestVideo, setLatestVideo] = useState<VideoNotification | null>(() => {
    // Hydrate from localStorage on mount
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('eyeseeyou_latest_video');
        return stored ? JSON.parse(stored) : null;
      } catch (error) {
        return null;
      }
    }
    return null;
  });

  const [isPolling, setIsPolling] = useState(false);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);

  const pollingRef = useRef(false);
  const retryCountRef = useRef(0);
  const consecutiveErrorCountRef = useRef(0);

  const parseNotification = useCallback((messageBody: string): VideoNotification | null => {
    try {
      // Parse SNS envelope
      const snsMessage: SNSMessage = JSON.parse(messageBody);

      // Parse inner notification from SNS Message field
      const notification: VideoNotification = JSON.parse(snsMessage.Message);

      // Validate required fields
      if (!notification.cloudfront_url || !notification.timestamp) {
        return null;
      }

      return notification;
    } catch (parseError) {
      return null;
    }
  }, []);

  const retryWithBackoff = useCallback(
    async <T,>(fn: () => Promise<T>, retries = MAX_RETRIES): Promise<T | null> => {
      for (let i = 0; i < retries; i++) {
        try {
          return await fn();
        } catch (err) {
          if (i === retries - 1) {
            return null;
          }

          const waitTime = Math.min(BACKOFF_BASE * Math.pow(2, i), MAX_BACKOFF);
          await sleep(waitTime);
        }
      }
      return null;
    },
    []
  );

  const poll = useCallback(async () => {
    while (pollingRef.current && isAuthenticated) {
      try {
        setLastPollTime(new Date());

        const response = await retryWithBackoff(async () => {
          return await receiveMessage();
        });

        if (!response) {
          // Retry failed, wait with backoff
          const waitTime = Math.min(
            BACKOFF_BASE * Math.pow(2, consecutiveErrorCountRef.current),
            MAX_BACKOFF
          );
          consecutiveErrorCountRef.current++;
          await sleep(waitTime);
          continue;
        }

        // Successfully received - reset error counter
        consecutiveErrorCountRef.current = 0;

        // May be empty if no messages
        if (response.Messages && response.Messages.length > 0) {
          const message = response.Messages[0];

          if (message.Body && message.ReceiptHandle) {
            const notification = parseNotification(message.Body);

            if (notification) {
              setLatestVideo(notification);

              // Persist to localStorage
              localStorage.setItem('eyeseeyou_latest_video', JSON.stringify(notification));

              // Delete message from queue
              await retryWithBackoff(async () => {
                await deleteMessage(message.ReceiptHandle!);
              });
            }
          }
        }

        // Wait before next poll
        await sleep(POLL_INTERVAL_MS);
      } catch (pollError) {
        // Fail silently - no error logging or display
        const waitTime = Math.min(
          BACKOFF_BASE * Math.pow(2, consecutiveErrorCountRef.current),
          MAX_BACKOFF
        );
        consecutiveErrorCountRef.current++;
        await sleep(waitTime);
      }
    }
  }, [isAuthenticated, retryWithBackoff, parseNotification]);

  useEffect(() => {
    if (!isAuthenticated) {
      pollingRef.current = false;
      setIsPolling(false);
      return;
    }

    // Fetch most recent video from S3 on first load (if not in cache)
    const fetchInitialVideo = async () => {
      if (!latestVideo) {
        const video = await getMostRecentVideo();
        if (video) {
          setLatestVideo(video);
          localStorage.setItem('eyeseeyou_latest_video', JSON.stringify(video));
        }
      }
    };

    fetchInitialVideo();

    pollingRef.current = true;
    setIsPolling(true);
    consecutiveErrorCountRef.current = 0;

    poll();

    return () => {
      pollingRef.current = false;
      setIsPolling(false);
    };
  }, [isAuthenticated, poll, latestVideo]);

  return {
    latestVideo,
    isPolling,
    lastPollTime,
  };
}
