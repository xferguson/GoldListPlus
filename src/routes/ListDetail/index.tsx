import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as pages from '../../db/repos/pages';
import * as cards from '../../db/repos/cards';
import { TierBadge } from '../../components/TierBadge';
import { TierBorder } from '../../components/TierBorder';
import { AddCardForm } from './AddCardForm';
import { CardRow } from './CardRow';
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


