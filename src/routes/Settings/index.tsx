import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import * as books from '../../db/repos/books';
import {
  buildExportEnvelope,
  formatExportFilename,
  parseExport,
  validateForeignKeys,
} from '../../lib/sync/exportImport';
import type { ExportEnvelope, ImportError } from '../../lib/sync/exportImport';
import { Modal } from '../../components/Modal';
import {
  collectDbIds,
  readNonBookRows,
  runImportTransaction,
} from './syncActions';

const HELPER_COPY =
  'Your data never leaves your device unless you export it. Use Export to make a backup, and Import to restore one on this or another device.';

type AnyImportError = ImportError | { kind: 'fk-missing' };

const MALFORMED_ROW_NOUNS: Record<'books' | 'pages' | 'cards' | 'reviews', string> = {
  books: 'book',
  pages: 'list',
  cards: 'card',
  reviews: 'review',
};

function errorCopy(error: AnyImportError): string {
  switch (error.kind) {
    case 'invalid-json':
      return "That file isn't valid JSON. Pick an exported backup file.";
    case 'not-a-backup':
      return "That file isn't a Gold List Plus backup.";
    case 'newer-version':
      return 'This backup was made by a newer version of Gold List Plus. Update the app and try again.';
    case 'malformed-row': {
      const noun = MALFORMED_ROW_NOUNS[error.table];
      return `This backup has a malformed ${noun} at row ${error.index}. Nothing was imported.`;
    }
    case 'fk-missing':
      return "This backup is missing data it depends on (e.g. a list whose book isn't included). Nothing was imported.";
  }
}

function counts(env: ExportEnvelope): { b: number; l: number; c: number; r: number } {
  return {
    b: env.books.length,
    l: env.pages.length,
    c: env.cards.length,
    r: env.reviews.length,
  };
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(file);
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function Settings() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [pendingEnvelope, setPendingEnvelope] = useState<ExportEnvelope | null>(null);

  async function handleExport(): Promise<void> {
    setExporting(true);
    setErrorText(null);
    setStatus(null);
    try {
      const exportedAt = Date.now();
      const bookRows = await books.list();
      const rest = await readNonBookRows();
      const envelope = buildExportEnvelope({
        books: bookRows,
        pages: rest.pages,
        cards: rest.cards,
        reviews: rest.reviews,
        exportedAt,
      });
      const blob = new Blob([JSON.stringify(envelope)], { type: 'application/json' });
      triggerDownload(blob, formatExportFilename(exportedAt));
      const { b, l, c, r } = counts(envelope);
      setStatus(`Exported ${b} books, ${l} lists, ${c} cards, ${r} reviews.`);
    } catch {
      setErrorText('Export failed.');
    } finally {
      setExporting(false);
    }
  }

  function handleImportClick(): void {
    setErrorText(null);
    setStatus(null);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setErrorText(null);
    setStatus(null);

    const text = await readFileText(file);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(text);
    } catch {
      setErrorText(errorCopy({ kind: 'invalid-json' }));
      return;
    }

    const parseResult = parseExport(parsedJson);
    if (!parseResult.ok) {
      setErrorText(errorCopy(parseResult.error));
      return;
    }

    const dbIds = await collectDbIds();
    const fkResult = validateForeignKeys(parseResult.envelope, dbIds);
    if (!fkResult.ok) {
      setErrorText(errorCopy(fkResult.error));
      return;
    }

    setPendingEnvelope(parseResult.envelope);
  }

  async function handleConfirmImport(): Promise<void> {
    if (pendingEnvelope === null) return;
    const envelope = pendingEnvelope;
    setPendingEnvelope(null);
    try {
      const { overwritten } = await runImportTransaction(envelope);
      const { b, l, c, r } = counts(envelope);
      setStatus(
        `Imported ${b} books, ${l} lists, ${c} cards, ${r} reviews (${overwritten} overwritten).`,
      );
    } catch {
      setErrorText('Import failed.');
    }
  }

  function handleCancelImport(): void {
    setPendingEnvelope(null);
  }

  const confirmBody = pendingEnvelope
    ? `Import ${pendingEnvelope.books.length} books, ${pendingEnvelope.pages.length} lists, ${pendingEnvelope.cards.length} cards, ${pendingEnvelope.reviews.length} reviews? Existing entries with matching IDs will be overwritten. Other data on this device is kept.`
    : '';

  return (
    <main data-testid="route-settings" className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <section className="mt-8">
        <h2 className="text-xl font-semibold">Backup & restore</h2>
        <p className="mt-2 text-sm text-neutral-300">{HELPER_COPY}</p>
        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-60"
          >
            {exporting ? 'Exporting…' : 'Export backup'}
          </button>
          <button
            type="button"
            onClick={handleImportClick}
            className="rounded border border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-800"
          >
            Import backup
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            data-testid="import-file-input"
            onChange={handleFileChange}
            className="sr-only"
          />
        </div>
        {status !== null && (
          <p data-testid="sync-status" role="status" className="mt-3 text-sm text-green-400">
            {status}
          </p>
        )}
        {errorText !== null && (
          <p data-testid="sync-error" role="alert" className="mt-3 text-sm text-red-400">
            {errorText}
          </p>
        )}
      </section>
      <Modal
        open={pendingEnvelope !== null}
        onClose={handleCancelImport}
        title="Confirm import"
      >
        <div className="rounded bg-neutral-900 p-6">
          <h3 className="text-lg font-semibold">Confirm import</h3>
          <p className="mt-3 text-sm">{confirmBody}</p>
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleCancelImport}
              className="rounded border border-neutral-700 px-4 py-2 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmImport}
              className="rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
            >
              Import
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}
