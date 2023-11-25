import { createDOM } from '@builder.io/qwik/testing';
import { component$ } from '@builder.io/qwik';
import { test, describe, expect } from 'vitest';

import { useRelativeTime } from '../src/use-relative-time';
import { QwikSpeakMockProvider } from '../src/use-qwik-speak';
import { config } from './config';

const TestComponent = component$(() => {
  const rt = useRelativeTime();

  return (
    <div>
      <div id="A">{rt(-1, 'day')}</div>
      <div id="A1">{rt('-1', 'day', { numeric: 'auto', style: 'long' })}</div>
    </div>
  );
});

describe('useRelativeTime function', async () => {
  const { screen, render } = await createDOM();

  await render(
    <QwikSpeakMockProvider config={config} locale={config.defaultLocale}>
      <TestComponent />
    </QwikSpeakMockProvider>
  );

  test('format', () => {
    expect((screen.querySelector('#A') as HTMLDivElement).innerHTML).toContain('1 day ago');
    expect((screen.querySelector('#A1') as HTMLDivElement).innerHTML).toContain('yesterday');
  });
});
