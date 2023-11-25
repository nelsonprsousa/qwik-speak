import { createDOM } from '@builder.io/qwik/testing';
import { component$ } from '@builder.io/qwik';
import { test, describe, expect } from 'vitest';

import { useFormatNumber } from '../src/use-format-number';
import { QwikSpeakMockProvider } from '../src/use-qwik-speak';
import { config } from './config';
import { useSpeakLocale } from '../src/use-functions';

const TestComponent = component$(() => {
  const fn = useFormatNumber();

  const locale = useSpeakLocale();
  const units = locale.units!;

  return (
    <div>
      <div id="A">{fn(1234.5)}</div>
      <div id="A1">{fn(1234.5, { minimumIntegerDigits: 1, minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
      <div id="A2">{fn(1000, { style: 'currency' })}</div>
      <div id="A3">{fn(1, { style: 'unit', unit: units['length'] })}</div>
    </div>
  );
});

describe('useFormatNumber function', async () => {
  const { screen, render } = await createDOM();

  await render(
    <QwikSpeakMockProvider config={config} locale={config.defaultLocale}>
      <TestComponent />
    </QwikSpeakMockProvider>
  );

  test('format', () => {
    expect((screen.querySelector('#A') as HTMLDivElement).innerHTML).toContain('1,234.5');
    expect((screen.querySelector('#A1') as HTMLDivElement).innerHTML).toContain('1,234.50');
    expect((screen.querySelector('#A2') as HTMLDivElement).innerHTML).toContain('$1,000.00');
    expect((screen.querySelector('#A3') as HTMLDivElement).innerHTML).toContain('1 mi');
  });
});
