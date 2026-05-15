import { HashRouter, Routes, Route, NavLink } from 'react-router-dom';

const Placeholder = ({ title }: { title: string }) => (
  <main className="mx-auto max-w-4xl px-4 py-8">
    <h1 className="text-2xl font-semibold">{title}</h1>
    <p className="mt-2 text-neutral-400">Coming soon.</p>
  </main>
);

export function App() {
  return (
    <HashRouter>
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
      <Routes>
        <Route path="/" element={<Placeholder title="Dashboard" />} />
        <Route path="/stats" element={<Placeholder title="Stats" />} />
        <Route path="/settings" element={<Placeholder title="Settings" />} />
        <Route path="/about" element={<Placeholder title="About" />} />
      </Routes>
    </HashRouter>
  );
}
