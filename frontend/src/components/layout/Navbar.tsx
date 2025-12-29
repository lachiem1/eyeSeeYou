'use client';

import React from 'react';

interface NavbarProps {
  children?: React.ReactNode;
}

export default function Navbar({ children }: NavbarProps) {
  return (
    <nav className="w-full bg-background-secondary border-b border-border-primary">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-accent-primary">Eye See You</h1>
          </div>

          {children}
        </div>
      </div>
    </nav>
  );
}
