import { describe, it, expect, beforeEach } from '@jest/globals';

// hazo_connect/server is mapped to src/__tests__/__mocks__/hazo_connect_server.ts
// via moduleNameMapper in jest.config.cjs (jest.mock() auto-hoisting is not supported
// with ts-jest ESM + --experimental-vm-modules).

interface FakeAdapter { rows: Array<Record<string, unknown>>; }

function makeAdapter(): FakeAdapter { return { rows: [] }; }

import { create_vote_service } from '../db/vote_service.js';

describe('vote_service', () => {
  let adapter: FakeAdapter;
  beforeEach(() => { adapter = makeAdapter(); });

  it('toggle_vote inserts a row when none exists', async () => {
    const svc = create_vote_service(adapter);
    const result = await svc.toggle_vote('sub-1', 'user-1');
    expect(result).toEqual({ voted: true, count: 1 });
    expect(adapter.rows).toHaveLength(1);
    expect(adapter.rows[0]).toMatchObject({ submission_id: 'sub-1', user_id: 'user-1' });
  });

  it('toggle_vote removes the row when one exists', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    const result = await svc.toggle_vote('sub-1', 'user-1');
    expect(result).toEqual({ voted: false, count: 0 });
    expect(adapter.rows).toHaveLength(0);
  });

  it('count_votes returns the number of votes for a submission', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    await svc.toggle_vote('sub-1', 'user-2');
    await svc.toggle_vote('sub-2', 'user-1');
    expect(await svc.count_votes('sub-1')).toBe(2);
    expect(await svc.count_votes('sub-2')).toBe(1);
  });

  it('has_voted reports whether a user has voted for a submission', async () => {
    const svc = create_vote_service(adapter);
    await svc.toggle_vote('sub-1', 'user-1');
    expect(await svc.has_voted('sub-1', 'user-1')).toBe(true);
    expect(await svc.has_voted('sub-1', 'user-2')).toBe(false);
  });
});
