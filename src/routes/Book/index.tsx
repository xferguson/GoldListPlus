import { useParams } from 'react-router-dom';

export function Book() {
  const { bookId } = useParams<{ bookId: string }>();
  return (
    <main data-testid="route-book" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Book</h1>
      <p className="mt-2 text-neutral-400">{bookId ?? ''}</p>
    </main>
  );
}
