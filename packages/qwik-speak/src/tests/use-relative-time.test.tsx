import { createDOM } from '@builder.io/qwik/testing';
import { component$ } from '@builder.io/qwik';
import { test, describe, expect } from 'vitest';

import { relativeTime as rt } from '../use-relative-time';
import { QwikSpeakProvider } from '../qwik-speak-component';
import { config } from './config';

const TestComponent = component$(() => {
  return (
    <div>
      <div id="A">{rt(-1, 'day')}</div>
      <div id="A1">{rt('-1', 'day', { numeric: 'auto', style: 'long' })}</div>
    </div>
  );
});

describe('relativeTime function', async () => {
  const { screen, render } = await createDOM();

  await render(
    <QwikSpeakProvider config={config} locale={config.defaultLocale}>
      <TestComponent />
    </QwikSpeakProvider>
  );

  test('format', () => {
    expect((screen.querySelector('#A') as HTMLDivElement).innerHTML).toContain('1 day ago');
    expect((screen.querySelector('#A1') as HTMLDivElement).innerHTML).toContain('yesterday');
  });
});
