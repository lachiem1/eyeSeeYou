'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Link from 'next/link';

export default function BurgerMenu() {
  const { logout } = useAuth();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
    router.push('/');
  };

  const handleGallery = () => {
    setIsOpen(false);
    router.push('/gallery');
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-background-tertiary focus:outline-none focus:ring-2 focus:ring-border-focus transition-colors"
        aria-label="Menu"
      >
        <svg className="w-6 h-6 text-text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-background-secondary border border-border-primary rounded-lg shadow-lg z-50">
          <div className="p-4 space-y-3">
            <button
              onClick={handleGallery}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-background-tertiary text-text-primary transition-colors"
            >
              Gallery (soon!)
            </button>

            <div className="border-t border-border-primary pt-3">
              <Button
                onClick={handleLogout}
                variant="danger"
                size="md"
                fullWidth
                className="justify-center"
              >
                Logout
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
