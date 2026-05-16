import { monotonicFactory } from 'ulid';

const generate = monotonicFactory();

export function newId(): string {
  return generate();
}
