import { component$ } from '@builder.io/qwik';
import type { DocumentHead } from '@builder.io/qwik-city';
import { useLocation } from "@builder.io/qwik-city";
import { useTranslate } from 'qwik-speak';
import { usePageContextLoader } from '~/routes/layout';

export default component$(() => {
  const t = useTranslate();
  const loc = useLocation()
  const pageContextSignal = usePageContextLoader();

  return (
    <div class="content">
      <h1>{t('app.title')}</h1>
      <h2>{t('app.subtitle')}</h2>

      <p>{loc.params.slug}</p>

      <br/>

      {pageContextSignal.value.map(dummyStr => {
        return (<p key={dummyStr}>{dummyStr}</p>);
      })}

    </div>
  );
});

export const head: DocumentHead = {
  title: 'runtime.head.page.title',
  meta: [{ name: 'description', content: 'runtime.head.page.description' }]
};
