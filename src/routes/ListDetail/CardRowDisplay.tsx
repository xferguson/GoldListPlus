import type { Card } from '../../db/db';

type CardRowDisplayProps = {
  card: Card;
  locked: boolean;
  onEditRequested: () => void;
  onDelete: () => void;
};

export function CardRowDisplay({
  card,
  locked,
  onEditRequested,
  onDelete,
}: CardRowDisplayProps) {
  return (
    <div className="flex items-center gap-3 w-full">
      <span>{card.source}</span>
      <span className="text-neutral-500">/</span>
      <span>{card.target}</span>
      {!locked && (
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            data-testid={`card-edit-${card.id}`}
            aria-label="Edit card"
            onClick={onEditRequested}
            className="rounded border border-neutral-600 px-2 py-1 text-sm"
          >
            Edit
          </button>
          <button
            type="button"
            data-testid={`card-delete-${card.id}`}
            aria-label="Delete card"
            onClick={onDelete}
            className="rounded border border-red-700 px-2 py-1 text-sm text-red-200"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
