'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cognitoAuth } from '@/lib/auth/cognitoAuth';

export default function CallbackPage() {
  const router = useRouter();
  const processedRef = useRef(false);

  useEffect(() => {
    const handleCallback = async () => {
      // Prevent processing twice in Strict Mode
      if (processedRef.current) {
        return;
      }
      processedRef.current = true;

      try {
        // Use native URLSearchParams instead of useSearchParams for static export compatibility
        const params = new URLSearchParams(window.location.search);
        const code = params.get('code');
        const error = params.get('error');

        if (error) {
          router.push('/');
          return;
        }

        if (!code) {
          router.push('/');
          return;
        }

        // Exchange code for tokens
        await cognitoAuth.handleOAuthCallback(code);

        // Redirect to dashboard (use window.location for guaranteed redirect)
        window.location.href = '/dashboard';
      } catch (error) {
        router.push('/');
      }
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen bg-background-primary flex items-center justify-center">
      <div className="text-center">
        <div className="animate-pulse mb-4">
          <svg className="w-12 h-12 text-accent-primary mx-auto" fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
          </svg>
        </div>
        <p className="text-text-secondary">Signing in with Google...</p>
      </div>
    </div>
  );
}
