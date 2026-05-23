import { useParams } from 'react-router-dom';

export function GoldSummary() {
  const { pageId } = useParams<{ pageId: string }>();
  return (
    <main data-testid="route-distill-gold-summary" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Gold Summary</h1>
      <p className="mt-2 text-neutral-400">{pageId ?? ''}</p>
    </main>
  );
}
