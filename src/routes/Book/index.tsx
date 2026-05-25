import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import * as books from '../../db/repos/books';
import * as pages from '../../db/repos/pages';
import { newId } from '../../db/ids';
import { nextBronzeTitle } from '../../lib/bronzeTitle';
import { TierBadge } from '../../components/TierBadge';
import { TierBorder } from '../../components/TierBorder';
import type { Book as BookType, Page } from '../../db/db';
import { MS_PER_DAY } from '../../lib/time';

export function Book() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const [book, setBook] = useState<BookType | undefined>(undefined);
  const [bookLoaded, setBookLoaded] = useState(false);
  const [pageList, setPageList] = useState<Page[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (bookId === undefined) return;
    void (async () => {
      const [b, ps] = await Promise.all([
        books.get(bookId),
        pages.listByBook(bookId),
      ]);
      if (cancelled) return;
      setBook(b);
      setBookLoaded(true);
      setPageList(ps);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  async function onNewBronzeList(): Promise<void> {
    if (bookId === undefined || book === undefined) return;
    const bronzeTitles = pageList
      .filter((p) => p.tier === 'bronze')
      .map((p) => p.title);
    const title = nextBronzeTitle(bronzeTitles);
    const now = Date.now();
    const newPage: Page = {
      id: newId(),
      bookId,
      title,
      tier: 'bronze',
      createdAt: now,
      reviewableAt: now + book.settings.distillationIntervalDays * MS_PER_DAY,
      cardIds: [],
    };
    await pages.create(newPage);
    navigate(`/list/${newPage.id}`);
  }

  const sortedPages = [...pageList].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <main data-testid="route-book" className="mx-auto max-w-4xl px-4 py-8">
      {bookLoaded && book === undefined && (
        <p data-testid="book-not-found">Book not found</p>
      )}
      <h1 className="text-2xl font-semibold">{book?.name ?? 'Book'}</h1>
      {bookId !== undefined && (
        <p className="mt-1 text-sm text-neutral-500">{bookId}</p>
      )}

      <button
        type="button"
        data-testid="new-bronze-list"
        onClick={() => {
          void onNewBronzeList();
        }}
        className="mt-4 rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
      >
        New Bronze List
      </button>

      {sortedPages.length === 0 ? (
        <p data-testid="pages-empty" className="mt-6 text-neutral-400">
          No lists yet. Create your first Bronze List to start.
        </p>
      ) : (
        <ul data-testid="pages-list" className="mt-6 flex flex-col gap-3">
          {sortedPages.map((p) => (
            <li key={p.id} data-testid={`page-row-${p.id}`}>
              <TierBorder tier={p.tier}>
                <div className="flex items-center gap-3 p-3">
                  <TierBadge tier={p.tier} />
                  <a
                    data-testid={`page-link-${p.id}`}
                    href={`#/list/${p.id}`}
                    className="font-medium hover:underline"
                  >
                    {p.title}
                  </a>
                  <time
                    data-testid={`page-created-${p.id}`}
                    dateTime={new Date(p.createdAt).toISOString()}
                    className="ml-auto text-sm text-neutral-400"
                  >
                    {new Date(p.createdAt).toLocaleDateString()}
                  </time>
                </div>
              </TierBorder>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
