'use client';

import { useRouter } from 'next/navigation';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';

export default function GalleryPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background-primary">
      <Navbar />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <h1 className="text-4xl font-bold text-text-primary mb-4">Gallery</h1>

        <div className="py-16">
          <svg
            className="w-24 h-24 text-text-muted mx-auto mb-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>

          <h2 className="text-2xl font-semibold text-text-primary mb-2">Coming Soon</h2>
          <p className="text-text-secondary mb-8">
            Browse all your recorded videos in the gallery. This feature is coming in the next update.
          </p>

          <Button
            onClick={() => router.back()}
            variant="primary"
            size="md"
          >
            Back to Dashboard
          </Button>
        </div>
      </main>
    </div>
  );
}
