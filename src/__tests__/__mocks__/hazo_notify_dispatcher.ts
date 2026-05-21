// Static mock for 'hazo_notify/dispatcher' used in Jest tests.
// Tests import dispatch directly (moduleNameMapper resolves to this file)
// and use mockClear() between tests to reset call history.

import { jest } from '@jest/globals';
import type { DispatchInput, DispatchResult } from 'hazo_notify/dispatcher';

export const dispatch: jest.MockedFunction<(input: DispatchInput) => Promise<DispatchResult>> =
  jest.fn(async (_input: DispatchInput): Promise<DispatchResult> => ({
    inbox_rows_upserted: 1,
    inbox_rows_inserted: 1,
    inbox_rows_aggregated: 0,
    deliveries_created: 1,
    deliveries_refreshed: 0,
    channels_dispatched: ['email', 'in_app'],
  }));
