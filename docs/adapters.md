# Qwik Speak and Adapters

`loadTranslation$` is the core function of the library. It is a customizable function, with which you can load the translation files in the way you prefer. A simple implementation is to fetch files from the public folder:

```typescript
export const loadTranslation$: LoadTranslationFn = $(async (lang: string, asset: string, origin?: string) => {
  let url = '';
  // Absolute urls on server
  if (isServer && origin) {
    url = origin;
  }
  url += `/public/i18n/${lang}/${asset}.json`;
  const response = await fetch(url);

  if (response.ok) {
    return response.json();
  }
  else {
    console.error(`loadTranslation$: ${url}`, response);
  }
});
```

> The function must be able to load files to both the server and the client

If you use Qwik-provided adapters for publishing your app, especially with _edge functions_ or _static generation_, it is recommended to bundle the translation files:
```typescript
/**
 * Translation files are lazy-loaded via dynamic import and will be split into separate chunks during build.
 * Json files are converted to objects: keys must be valid variable names
 */
const translationData = import.meta.glob('/i18n/**/*.json');

const loadTranslation$: LoadTranslationFn = server$((lang: string, asset: string) =>
  translationData[`/i18n/${lang}/${asset}.json`]?.()
);
```
> Using `server$` instead of `$`, translation data is always accessed on the server

If your production environment doesn't support _dynamic import_, you might prefer this way:
```typescript
/**
 * Translation files are imported directly as string
 */
const translationData = import.meta.glob('/i18n/**/*.json', { as: 'raw', eager: true });

const loadTranslation$: LoadTranslationFn = server$((lang: string, asset: string) =>
  JSON.parse(translationData[`/i18n/${lang}/${asset}.json`])
);
```

> Note. It is recommended to put this function in a separate file from the configuration, to allow the Qwik compiler to respect the initialization order of the functions

Refer to _Vite_ documentation for more information on [Glob import](https://vitejs.dev/guide/features.html#glob-import)

## Static Site Generation (SSG)
If you want to use Static Site Generation with the localized router, it is necessary to manage the dynamic language parameter, and you need to add the values it can take to the pages:

```typescript
/**
 * Dynamic SSG route
 */
export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: config.supportedLocales.map(locale => {
      return { lang: locale.lang !== config.defaultLocale.lang ? locale.lang : '' };
    })
  };
};
```
