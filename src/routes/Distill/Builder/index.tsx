import { useParams } from 'react-router-dom';

export function Builder() {
  const { parentId } = useParams<{ parentId: string }>();
  return (
    <main data-testid="route-distill-builder" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Distillation Builder</h1>
      <p className="mt-2 text-neutral-400">{parentId ?? ''}</p>
    </main>
  );
}
