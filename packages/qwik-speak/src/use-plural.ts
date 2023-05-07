import { useSpeakContext } from './use-speak';
import { translate } from './core';

export type PluralFn = {
  /**
   * Get the plural by a number. 
   * The value is passed as a parameter to the translate function
   * @param value A number or a string
   * @param key Optional key
   * @param params Optional parameters contained in the values
   * @param options Intl PluralRulesOptions object
   * @param lang Optional language if different from the current one
   * @returns The translation for the plural
   */
  (value: number | string, key?: string, params?: any, options?: Intl.PluralRulesOptions, lang?: string): string;
};

export const usePlural: PluralFn = (
  value: number | string,
  key?: string,
  params?: any,
  options?: Intl.PluralRulesOptions,
  lang?: string
) => {
  const ctx = useSpeakContext();
  const { locale, translation, config } = ctx;

  lang ??= locale.lang;

  value = +value;

  const rule = new Intl.PluralRules(lang, options).select(value);
  key = key ? `${key}${config.keySeparator}${rule}` : rule;

  return translate(key, translation[lang], { value, ...params }, config.keySeparator, config.keyValueSeparator);
};

export { usePlural as $plural };
