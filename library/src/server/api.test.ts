import { describe, expect, it } from 'vitest';
import { fixture } from '../core/test-fixture.js';
import { handleApi } from './api.js';

const collection = fixture();
const collections = new Map([['test', collection]]);

describe('handleApi operation names', () => {
  // Names every object inherits are not operations: `in` would find them on the prototype.
  it.each(['constructor', 'hasOwnProperty', 'toString', '__proto__'])('gives 404 for %s', (name) => {
    const res = handleApi(collections, 'POST', `/api/collections/test/${name}`, {});
    expect(res?.status).toBe(404);
  });
});
