import { useState } from 'react';
import type { Card } from '../../db/db';

type CardRowEditorProps = {
  card: Card;
  onSave: (source: string, target: string) => Promise<void> | void;
  onCancel: () => void;
};

export function CardRowEditor({ card, onSave, onCancel }: CardRowEditorProps) {
  const [source, setSource] = useState(card.source);
  const [target, setTarget] = useState(card.target);

  const srcId = `card-edit-source-${card.id}`;
  const tgtId = `card-edit-target-${card.id}`;

  async function handleSave(): Promise<void> {
    await onSave(source.trim(), target.trim());
  }

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={srcId}>Source</label>
      <input
        id={srcId}
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
      />
      <label htmlFor={tgtId}>Target</label>
      <input
        id={tgtId}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          className="rounded bg-amber-600 px-3 py-1 text-sm text-white"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-600 px-3 py-1 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
