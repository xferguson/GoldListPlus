import { useState } from 'react';
import type { Card } from '../../db/db';
import { CardRowDisplay } from './CardRowDisplay';
import { CardRowEditor } from './CardRowEditor';

type CardRowProps = {
  card: Card;
  locked: boolean;
  onSave: (source: string, target: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

export function CardRow({ card, locked, onSave, onDelete }: CardRowProps) {
  const [editing, setEditing] = useState(false);
  const inEdit = editing && !locked;
  return (
    <li data-testid={`card-row-${card.id}`} className="rounded border border-neutral-700 p-2">
      {inEdit ? (
        <CardRowEditor card={card} onCancel={() => setEditing(false)}
          onSave={async (source, target) => { await onSave(source, target); setEditing(false); }} />
      ) : (
        <CardRowDisplay card={card} locked={locked}
          onEditRequested={() => setEditing(true)}
          onDelete={() => { void onDelete(); }} />
      )}
    </li>
  );
}
