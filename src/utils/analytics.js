import { startOfDay } from 'date-fns';

export const DEFAULT_ANALYTICS_START_DATE = '2026-06-01';

function parseAnalyticsDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : startOfDay(value);
  }

  if (typeof value === 'number') {
    const parsedDate = new Date(value);
    return Number.isNaN(parsedDate.getTime()) ? null : startOfDay(parsedDate);
  }

  if (typeof value === 'string') {
    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const parsedDate = new Date(trimmedValue);
    if (!Number.isNaN(parsedDate.getTime())) {
      return startOfDay(parsedDate);
    }
  }

  return null;
}

export function getAnalyticsStartDate(settings = {}) {
  const configuredValue = settings?.analyticsStartDate || DEFAULT_ANALYTICS_START_DATE;
  const parsedDate = parseAnalyticsDate(configuredValue);
  return parsedDate || parseAnalyticsDate(DEFAULT_ANALYTICS_START_DATE);
}

export function isDateInAnalyticsWindow(dateValue, analyticsStartDate = getAnalyticsStartDate()) {
  const normalizedStartDate = analyticsStartDate instanceof Date
    ? startOfDay(analyticsStartDate)
    : getAnalyticsStartDate({ analyticsStartDate });

  const normalizedDate = parseAnalyticsDate(dateValue);
  if (!normalizedDate || !normalizedStartDate) {
    return false;
  }

  return normalizedDate >= normalizedStartDate;
}
