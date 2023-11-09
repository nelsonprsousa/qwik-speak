import { component$ } from '@builder.io/qwik';
import { routeLoader$, type DocumentHead } from '@builder.io/qwik-city';
import { Speak, useTranslate } from 'qwik-speak';
import { usePageContextLoader } from '~/routes/layout';


// export const usePageContextLoader = routeLoader$(({ sharedMap }) => {
//   return sharedMap.get('pageContext') as string[];
// });

export const Page = component$(() => {
  const t = useTranslate();
  const pageContextSignal = usePageContextLoader();

  const key = 'dynamic';

  console.log('Page called')

  return (
    <>
      <div class="content">
        <h1>{t('app.title')}</h1>
        <h2>{t('app.subtitle')}</h2>

        <p>{t('page.text')}</p>
        <p>{t('page.default@@I\'m a default value')}</p>
        <p>{t(`runtimePage.${key}`)}</p>
      </div>

      <br/>

      {pageContextSignal.value.map(dummyStr => {
        return (<p key={dummyStr}>{dummyStr}</p>);
      })}
    </>
  );
});

export default component$(() => {
  return (
    /**
     * Add Page translations (only available in child components)
     */
    <Speak assets={['page']} runtimeAssets={['runtimePage']}>
      <Page />
    </Speak>
  );
});

export const head: DocumentHead = {
  title: 'runtime.head.page.title',
  meta: [{ name: 'description', content: 'runtime.head.page.description' }]
};
