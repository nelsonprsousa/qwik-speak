import { $ } from '@builder.io/qwik';
import type { SpeakConfig, LoadTranslationFn, TranslationFn } from '../types';

export const config: SpeakConfig = {
  defaultLocale: { lang: 'en-US', currency: 'USD', timeZone: 'America/Los_Angeles', units: { 'length': 'mile' } },
  supportedLocales: [
    { lang: 'en-US', currency: 'USD', timeZone: 'America/Los_Angeles', units: { 'length': 'mile' } }
  ],
  assets: ['test'],
  keySeparator: '.',
  keyValueSeparator: '@@'
};

export const loadTranslationStub$: LoadTranslationFn = $(() => {
  return {
    test: 'Test',
    testParams: 'Test {{param}}',
    nested: {
      test: 'Test',
      array: ['Test1', 'Test2'],
    },
    one: 'One {{ role }} developer',
    other: '{{value}} {{ role }} developers',
    arrayObjects: [
      { num: '1' },
      { num: '3' }
    ]
  };
});

export const translationFnStub: TranslationFn = {
  loadTranslation$: loadTranslationStub$
};
