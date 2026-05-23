import { Link } from 'react-router-dom';

export function Dashboard() {
  return (
    <main data-testid="route-dashboard" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <Link
        to="/book/new"
        className="mt-4 inline-block rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
      >
        New Book
      </Link>
    </main>
  );
}
