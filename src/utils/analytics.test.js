import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ANALYTICS_START_DATE, getAnalyticsStartDate, isDateInAnalyticsWindow } from './analytics.js';

test('getAnalyticsStartDate returns the default start date when none is configured', () => {
  const startDate = getAnalyticsStartDate({});
  assert.equal(`${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`, DEFAULT_ANALYTICS_START_DATE);
});

test('isDateInAnalyticsWindow excludes records before the configured start date', () => {
  const startDate = getAnalyticsStartDate({ analyticsStartDate: '2026-06-01' });
  assert.equal(isDateInAnalyticsWindow('2026-05-31', startDate), false);
  assert.equal(isDateInAnalyticsWindow('2026-06-01', startDate), true);
  assert.equal(isDateInAnalyticsWindow('2026-07-01', startDate), true);
});
