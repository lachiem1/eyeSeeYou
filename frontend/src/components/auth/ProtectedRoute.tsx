'use client';

import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/');
    } else {
      setIsChecking(false);
    }
  }, [isAuthenticated, router]);

  if (isChecking || !isAuthenticated) {
    return <div className="w-full h-screen bg-background-primary" />;
  }

  return <>{children}</>;
}
