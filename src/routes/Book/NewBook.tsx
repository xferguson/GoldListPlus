import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import * as books from '../../db/repos/books';
import { newId } from '../../db/ids';
import { BOOK_NAME_MAX_LENGTH, DEFAULT_BOOK_SETTINGS } from '../../lib/defaults';
import { useAppStore } from '../../stores/useAppStore';
import type { Book } from '../../db/db';

type FieldErrors = {
  name?: string;
  sourceLang?: string;
  targetLang?: string;
};

function validateName(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Name is required';
  if (trimmed.length > BOOK_NAME_MAX_LENGTH) {
    return 'Name must be 80 characters or fewer';
  }
  return undefined;
}

function validateRequired(value: string, message: string): string | undefined {
  return value.trim().length === 0 ? message : undefined;
}

export function NewBook() {
  const navigate = useNavigate();
  const setCurrentBookId = useAppStore((s) => s.setCurrentBookId);

  const [name, setName] = useState('');
  const [sourceLang, setSourceLang] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  function clearErrorIfValid(
    field: keyof FieldErrors,
    nextValue: string,
  ): void {
    setErrors((prev) => {
      if (prev[field] === undefined) return prev;
      const nextError =
        field === 'name'
          ? validateName(nextValue)
          : validateRequired(
              nextValue,
              field === 'sourceLang'
                ? 'Source language is required'
                : 'Target language is required',
            );
      if (nextError === undefined) {
        const { [field]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: nextError };
    });
  }

  function onBlurField(field: keyof FieldErrors, value: string): void {
    const message =
      field === 'name'
        ? validateName(value)
        : validateRequired(
            value,
            field === 'sourceLang'
              ? 'Source language is required'
              : 'Target language is required',
          );
    setErrors((prev) => {
      if (message === undefined) {
        if (prev[field] === undefined) return prev;
        const { [field]: _omit, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: message };
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const nameErr = validateName(name);
    const srcErr = validateRequired(sourceLang, 'Source language is required');
    const tgtErr = validateRequired(targetLang, 'Target language is required');
    const nextErrors: FieldErrors = {};
    if (nameErr) nextErrors.name = nameErr;
    if (srcErr) nextErrors.sourceLang = srcErr;
    if (tgtErr) nextErrors.targetLang = tgtErr;
    setErrors(nextErrors);
    if (nameErr || srcErr || tgtErr) return;

    const book: Book = {
      id: newId(),
      name: name.trim(),
      sourceLang: sourceLang.trim(),
      targetLang: targetLang.trim(),
      createdAt: Date.now(),
      settings: DEFAULT_BOOK_SETTINGS,
    };

    try {
      await books.create(book);
    } catch {
      setSubmitError('Could not create book. Please try again.');
      return;
    }
    setSubmitError(null);
    setCurrentBookId(book.id);
    navigate(`/book/${book.id}`);
  }

  return (
    <main data-testid="route-new-book" className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold">New Book</h1>
      <form
        aria-label="New Book"
        onSubmit={onSubmit}
        className="mt-6 flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1">
          <label htmlFor="name">Name</label>
          <input
            id="name"
            name="name"
            value={name}
            maxLength={BOOK_NAME_MAX_LENGTH}
            aria-describedby={errors.name ? 'error-name' : undefined}
            aria-invalid={errors.name ? true : undefined}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              clearErrorIfValid('name', v);
            }}
            onBlur={(e) => onBlurField('name', e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
          {errors.name !== undefined && (
            <p
              data-testid="error-name"
              id="error-name"
              role="alert"
              className="text-sm text-red-400"
            >
              {errors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="sourceLang">Source language</label>
          <input
            id="sourceLang"
            name="sourceLang"
            value={sourceLang}
            aria-describedby={errors.sourceLang ? 'error-sourceLang' : undefined}
            aria-invalid={errors.sourceLang ? true : undefined}
            onChange={(e) => {
              const v = e.target.value;
              setSourceLang(v);
              clearErrorIfValid('sourceLang', v);
            }}
            onBlur={(e) => onBlurField('sourceLang', e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
          {errors.sourceLang !== undefined && (
            <p
              data-testid="error-sourceLang"
              id="error-sourceLang"
              role="alert"
              className="text-sm text-red-400"
            >
              {errors.sourceLang}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="targetLang">Target language</label>
          <input
            id="targetLang"
            name="targetLang"
            value={targetLang}
            aria-describedby={errors.targetLang ? 'error-targetLang' : undefined}
            aria-invalid={errors.targetLang ? true : undefined}
            onChange={(e) => {
              const v = e.target.value;
              setTargetLang(v);
              clearErrorIfValid('targetLang', v);
            }}
            onBlur={(e) => onBlurField('targetLang', e.target.value)}
            className="rounded border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
          {errors.targetLang !== undefined && (
            <p
              data-testid="error-targetLang"
              id="error-targetLang"
              role="alert"
              className="text-sm text-red-400"
            >
              {errors.targetLang}
            </p>
          )}
        </div>

        {submitError !== null && (
          <p
            data-testid="error-submit"
            role="alert"
            className="text-sm text-red-400"
          >
            {submitError}
          </p>
        )}

        <button
          type="submit"
          className="mt-2 self-start rounded bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Create Book
        </button>
      </form>
    </main>
  );
}
