import '@testing-library/jest-dom/vitest';
import 'fake-indexeddb/auto';

// jsdom 25 ships a Blob without async readers. Polyfill Blob.prototype.text /
// arrayBuffer using Node's Buffer so tests can call `await blob.text()`.
if (typeof Blob.prototype.text !== 'function') {
  Object.defineProperty(Blob.prototype, 'text', {
    configurable: true,
    value(this: Blob) {
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ''));
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsText(this);
      });
    },
  });
}
if (typeof Blob.prototype.arrayBuffer !== 'function') {
  Object.defineProperty(Blob.prototype, 'arrayBuffer', {
    configurable: true,
    value(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
        reader.readAsArrayBuffer(this);
      });
    },
  });
}
