import { component$, Slot } from '@builder.io/qwik';

import { Header } from '../components/header/header';
import type { RequestHandler} from '@builder.io/qwik-city';
import { routeLoader$ } from '@builder.io/qwik-city';

export const onGet: RequestHandler = async ({ cacheControl }) => {
  // Control caching for this request for best performance and to reduce hosting costs:
  // https://qwik.builder.io/docs/caching/
  cacheControl({
    // Always serve a cached response by default, up to a week stale
    staleWhileRevalidate: 60 * 60 * 24 * 7,
    // Max once every 5 seconds, revalidate on the server to get a fresh version of this page
    maxAge: 5,
  });
};

export const onRequest: RequestHandler = async ({
  sharedMap,
}) => {
  // const pageContext = await getPageContext();
  const pageContext = [
    "my dummy string 1",
    "my dummy string 2",
    "my dummy string 3",
  ];

  sharedMap.set('pageContext', pageContext);
};

export const usePageContextLoader = routeLoader$(({ sharedMap }) => {
  return sharedMap.get('pageContext') as string[];
});

// export const getPageContext = async (): Promise<string[]> => {
//   const strs = [
//     "my dummy string 1",
//     "my dummy string 2",
//     "my dummy string 3",
//   ];

//   return await Promise.resolve(strs);
// };

export default component$(() => {
  return (
    <main>
      <Header />
      <Slot />
    </main>
  );
});
