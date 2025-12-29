'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useSQSPolling } from '@/hooks/useSQSPolling';
import VideoPlayer from '@/components/dashboard/VideoPlayer';
import VideoTimestamp from '@/components/dashboard/VideoTimestamp';
import BurgerMenu from '@/components/dashboard/BurgerMenu';
import Navbar from '@/components/layout/Navbar';

export default function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const { latestVideo } = useSQSPolling(isAuthenticated);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);

    if (!isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  if (!isHydrated || !isAuthenticated) {
    return <div className="w-full h-screen bg-background-primary" />;
  }

  return (
    <div className="min-h-screen bg-background-primary">
      <Navbar>
        <BurgerMenu />
      </Navbar>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="space-y-4">
          <VideoPlayer videoUrl={latestVideo?.cloudfront_url || null} isLoading={false} />
          <VideoTimestamp timestamp={latestVideo?.timestamp || null} />
        </div>
      </main>
    </div>
  );
}
