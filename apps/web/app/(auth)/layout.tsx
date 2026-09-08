import type { ReactNode } from 'react';
import './auth.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      {/* The global .page-backdrop (green glow + starfield) shows through. */}
      <main className="auth-container">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
