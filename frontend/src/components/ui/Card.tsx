import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export default function Card({ className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`bg-background-secondary border border-border-primary rounded-lg shadow-lg ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
