import { useParams } from 'react-router-dom';

export function Review() {
  const { pageId } = useParams<{ pageId: string }>();
  return (
    <main data-testid="route-review" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Review</h1>
      <p className="mt-2 text-neutral-400">{pageId ?? ''}</p>
    </main>
  );
}
