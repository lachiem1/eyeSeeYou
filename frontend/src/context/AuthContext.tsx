'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { cognitoAuth } from '@/lib/auth/cognitoAuth';
import type { User, AuthState } from '@/types/auth';

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Check authentication state on mount
  useEffect(() => {
    // Try to migrate tokens from sessionStorage to localStorage
    // (sessionStorage is used during OAuth callback flow on Safari/mobile)
    cognitoAuth.migrateTokensToLocalStorage();

    const authenticatedUser = cognitoAuth.getCurrentUser();
    setUser(authenticatedUser);
    setIsAuthenticated(cognitoAuth.isAuthenticated());
    setIsLoading(false);
  }, []);

  // Automatic token refresh - check every minute
  useEffect(() => {
    if (!isAuthenticated) return;

    const checkAndRefreshToken = async () => {
      if (cognitoAuth.isTokenExpired()) {
        const refreshed = await cognitoAuth.refreshTokens();

        if (!refreshed) {
          // Refresh failed - log out the user
          logout();
        } else {
          // Refresh succeeded - update user state
          const authenticatedUser = cognitoAuth.getCurrentUser();
          setUser(authenticatedUser);
        }
      }
    };

    // Check immediately
    checkAndRefreshToken();

    // Check every minute
    const interval = setInterval(checkAndRefreshToken, 60 * 1000);

    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const login = () => {
    cognitoAuth.initiateGoogleLogin();
  };

  const logout = () => {
    cognitoAuth.logout();
    setUser(null);
    setIsAuthenticated(false);
  };

  // During initial load, show nothing to prevent hydration mismatch
  if (isLoading) {
    return <div className="w-full h-screen bg-background-primary" />;
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
