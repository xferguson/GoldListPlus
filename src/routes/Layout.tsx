import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { UpdatePrompt } from '../components/UpdatePrompt';

export function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="border-b border-neutral-800 bg-neutral-900/50 backdrop-blur">
        <nav className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3">
          <NavLink to="/" className="text-lg font-semibold tracking-tight">
            Gold List Plus
          </NavLink>
          <div className="ml-auto flex gap-4 text-sm text-neutral-300">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'text-white' : '')}>
              Dashboard
            </NavLink>
            <NavLink to="/stats" className={({ isActive }) => (isActive ? 'text-white' : '')}>
              Stats
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => (isActive ? 'text-white' : '')}>
              Settings
            </NavLink>
          </div>
        </nav>
      </header>
      {children}
      <UpdatePrompt />
    </>
  );
}
