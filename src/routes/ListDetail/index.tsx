import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as pages from '../../db/repos/pages';
import * as cards from '../../db/repos/cards';
import { TierBadge } from '../../components/TierBadge';
import { TierBorder } from '../../components/TierBorder';
import { AddCardForm } from './AddCardForm';
import type { Card, Page } from '../../db/db';

const HEADLIST_WARNING_THRESHOLD = 26;

export function ListDetail() {
  const { pageId } = useParams<{ pageId: string }>();
  const [page, setPage] = useState<Page | undefined>(undefined);
  const [cardList, setCardList] = useState<Card[]>([]);
  const [warningDismissed, setWarningDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (pageId === undefined) return;
    void (async () => {
      const [p, cs] = await Promise.all([
        pages.get(pageId),
        cards.listByPage(pageId),
      ]);
      if (cancelled) return;
      setPage(p);
      setCardList(cs);
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  if (page === undefined) {
    return (
      <main data-testid="route-list-detail" className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold">List</h1>
        {pageId !== undefined && (
          <p className="mt-1 text-sm text-neutral-500">{pageId}</p>
        )}
      </main>
    );
  }

  const locked = page.reviewedAt !== undefined;
  const showWarning =
    !locked && page.cardIds.length >= HEADLIST_WARNING_THRESHOLD && !warningDismissed;

  async function onAddSuccess(newCard: Card): Promise<void> {
    if (page === undefined) return;
    await cards.create(newCard);
    const nextCardIds = [...page.cardIds, newCard.id];
    await pages.update(page.id, { cardIds: nextCardIds });
    setPage({ ...page, cardIds: nextCardIds });
    setCardList((prev) => [...prev, newCard]);
  }

  async function onDelete(cardId: string): Promise<void> {
    if (page === undefined) return;
    await cards.remove(cardId);
    const nextCardIds = page.cardIds.filter((id) => id !== cardId);
    await pages.update(page.id, { cardIds: nextCardIds });
    setPage({ ...page, cardIds: nextCardIds });
    setCardList((prev) => prev.filter((c) => c.id !== cardId));
  }

  async function onEditSave(
    cardId: string,
    source: string,
    target: string,
  ): Promise<void> {
    await cards.update(cardId, { source, target });
    setCardList((prev) =>
      prev.map((c) => (c.id === cardId ? { ...c, source, target } : c)),
    );
  }

  return (
    <main data-testid="route-list-detail" className="mx-auto max-w-4xl px-4 py-8">
      <TierBorder tier={page.tier}>
        <div className="p-4">
          <header className="flex items-center gap-3">
            <TierBadge tier={page.tier} />
            <h1 className="text-2xl font-semibold">{page.title}</h1>
          </header>

          {locked && (
            <p data-testid="list-locked" className="mt-4 text-neutral-300">
              This list has been reviewed and is read-only.
            </p>
          )}

          <ul data-testid="cards-list" className="mt-6 flex flex-col gap-2">
            {cardList.map((card) => (
              <CardRow
                key={card.id}
                card={card}
                locked={locked}
                onSave={(source, target) => onEditSave(card.id, source, target)}
                onDelete={() => onDelete(card.id)}
              />
            ))}
          </ul>

          {!locked && showWarning && (
            <div
              data-testid="headlist-warning"
              role="status"
              className="mt-6 flex items-start gap-2 rounded border border-amber-600 bg-amber-950 px-3 py-2 text-sm text-amber-100"
            >
              <span>
                {'You have 26 cards on this list. The Gold List Method recommends keeping a headlist around 25 entries — longer lists make distillation harder to remember.'}
              </span>
              <button
                type="button"
                data-testid="warning-dismiss"
                aria-label="Dismiss warning"
                onClick={() => setWarningDismissed(true)}
                className="ml-auto"
              >
                &times;
              </button>
            </div>
          )}

          {!locked && (
            <AddCardForm
              bookId={page.bookId}
              pageId={page.id}
              onAddSuccess={onAddSuccess}
            />
          )}
        </div>
      </TierBorder>
    </main>
  );
}

type CardRowProps = {
  card: Card;
  locked: boolean;
  onSave: (source: string, target: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

function CardRow({ card, locked, onSave, onDelete }: CardRowProps) {
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState(card.source);
  const [target, setTarget] = useState(card.target);

  function startEdit(): void {
    setSource(card.source);
    setTarget(card.target);
    setEditing(true);
  }

  async function handleSave(): Promise<void> {
    await onSave(source.trim(), target.trim());
    setEditing(false);
  }

  function handleCancel(): void {
    setSource(card.source);
    setTarget(card.target);
    setEditing(false);
  }

  const srcId = `card-edit-source-${card.id}`;
  const tgtId = `card-edit-target-${card.id}`;

  if (editing && !locked) {
    return (
      <li data-testid={`card-row-${card.id}`} className="rounded border border-neutral-700 p-2">
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
              onClick={handleCancel}
              className="rounded border border-neutral-600 px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li data-testid={`card-row-${card.id}`} className="flex items-center gap-3 rounded border border-neutral-700 p-2">
      <span>{card.source}</span>
      <span className="text-neutral-500">/</span>
      <span>{card.target}</span>
      {!locked && (
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            data-testid={`card-edit-${card.id}`}
            aria-label="Edit card"
            onClick={startEdit}
            className="rounded border border-neutral-600 px-2 py-1 text-sm"
          >
            Edit
          </button>
          <button
            type="button"
            data-testid={`card-delete-${card.id}`}
            aria-label="Delete card"
            onClick={() => {
              void onDelete();
            }}
            className="rounded border border-red-700 px-2 py-1 text-sm text-red-200"
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );
}

