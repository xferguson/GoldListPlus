import { useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({});
  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm text-neutral-100 shadow-lg"
    >
      <span>A new version is available.</span>
      <button
        type="button"
        onClick={() => updateServiceWorker(true)}
        className="rounded bg-amber-500 px-3 py-1 font-medium text-neutral-950 hover:bg-amber-400"
      >
        Reload
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="rounded border border-neutral-600 px-3 py-1 text-neutral-200 hover:bg-neutral-800"
      >
        Dismiss
      </button>
    </div>
  );
}
