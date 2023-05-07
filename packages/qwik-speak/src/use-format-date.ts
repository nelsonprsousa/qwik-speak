
import { useSpeakLocale } from './use-speak';

export type FormatDateFn = {
  /**
   * Format a date
   * @param value A date, a number (milliseconds since UTC epoch) or a string
   * @param options Intl DateTimeFormatOptions object
   * @param lang Optional language if different from the current one
   * @param timeZone Optional time zone if different from the current one
   * @returns The formatted date
   */
  (value: Date | number | string, options?: Intl.DateTimeFormatOptions, lang?: string, timeZone?: string): string;
};

export const useFormatDate = (
  value: Date | number | string,
  options?: Intl.DateTimeFormatOptions,
  lang?: string,
  timeZone?: string
): string => {
  const locale = useSpeakLocale();

  lang ??= locale.extension ?? locale.lang;
  timeZone ??= locale.timeZone;

  value = new Date(value);

  options = { ...options };
  if (timeZone) options.timeZone = timeZone;

  return new Intl.DateTimeFormat(lang, options).format(value);
};

export { useFormatDate as formatDate };
