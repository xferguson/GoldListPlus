import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { newId } from '../../db/ids';
import type { Card } from '../../db/db';

type AddCardFormProps = {
  bookId: string;
  pageId: string;
  onAddSuccess: (card: Card) => Promise<void>;
};

export function AddCardForm({ bookId, pageId, onAddSuccess }: AddCardFormProps) {
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');
  const [sourceError, setSourceError] = useState(false);
  const [targetError, setTargetError] = useState(false);
  const sourceRef = useRef<HTMLInputElement | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const srcTrim = source.trim();
    const tgtTrim = target.trim();
    const srcBad = srcTrim.length === 0;
    const tgtBad = tgtTrim.length === 0;
    setSourceError(srcBad);
    setTargetError(tgtBad);
    if (srcBad || tgtBad) return;

    const card: Card = {
      id: newId(),
      bookId,
      pageId,
      source: srcTrim,
      target: tgtTrim,
      createdAt: Date.now(),
    };
    await onAddSuccess(card);
    setSource('');
    setTarget('');
    setSourceError(false);
    setTargetError(false);
    sourceRef.current?.focus();
  }

  return (
    <form
      aria-label="Add card"
      data-testid="add-card-form"
      onSubmit={(e) => {
        void onSubmit(e);
      }}
      noValidate
      className="mt-6 flex flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor="add-card-source">Source</label>
        <input
          id="add-card-source"
          ref={sourceRef}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            if (sourceError) setSourceError(false);
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
        {sourceError && (
          <p data-testid="error-add-source" role="alert" className="text-sm text-red-400">
            Source is required
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="add-card-target">Target</label>
        <input
          id="add-card-target"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            if (targetError) setTargetError(false);
          }}
          className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
        />
        {targetError && (
          <p data-testid="error-add-target" role="alert" className="text-sm text-red-400">
            Target is required
          </p>
        )}
      </div>

      <button
        type="submit"
        className="self-start rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
      >
        Add
      </button>
    </form>
  );
}
