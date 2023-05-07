import type { Plugin } from 'vite';
import type { NormalizedOutputOptions, OutputBundle, OutputAsset, OutputChunk } from 'rollup';
import { readFile, readdir, writeFile } from 'fs/promises';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { extname, normalize } from 'path';

import type { QwikSpeakInlineOptions, Translation } from '../core/types';
import type { Argument, Property } from '../core/parser';
import { getPluralAlias, getTranslateAlias, getInlineTranslateAlias, parseJson } from '../core/parser';
import { parseSequenceExpressions } from '../core/parser';
import { getOptions, getRules } from '../core/intl-parser';

const inlinePlaceholder = '__qsInline';
const inlinePluralPlaceholder = '__qsInlinePlural';

// Logs
const missingValues: string[] = [];
const dynamicKeys: string[] = [];
const dynamicParams: string[] = [];

/**
 * Qwik Speak Inline Vite plugin
 * 
 * Inline $translate, $inlineTranslate & $plural values
 */
export function qwikSpeakInline(options: QwikSpeakInlineOptions): Plugin {
  // Resolve options
  const resolvedOptions: Required<QwikSpeakInlineOptions> = {
    ...options,
    basePath: options.basePath ?? './',
    assetsPath: options.assetsPath ?? 'i18n',
    outDir: options.outDir ?? 'dist',
    keySeparator: options.keySeparator ?? '.',
    keyValueSeparator: options.keyValueSeparator ?? '@@'
  }

  // Translation data
  const translation: Translation = Object.fromEntries(resolvedOptions.supportedLangs.map(value => [value, {}]));

  // Client or server files
  let target: string;
  let input: string | undefined;

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-speak-inline',
    enforce: 'post',
    // Apply only on build
    apply: 'build',

    configResolved(resolvedConfig) {
      target = resolvedConfig.build?.ssr || resolvedConfig.mode === 'ssr' ? 'ssr' : 'client';

      const inputOption = resolvedConfig.build?.rollupOptions?.input;
      if (inputOption) {
        if (Array.isArray(inputOption))
          input = inputOption[0];
        else if (typeof inputOption === 'string')
          input = inputOption
      }
      input = input?.split('/')?.pop();
    },

    /**
     * Load translation files when build starts
     */
    async buildStart() {
      if (target === 'client') {
        // For all langs
        await Promise.all(resolvedOptions.supportedLangs.map(async lang => {
          const baseDir = normalize(`${resolvedOptions.basePath}/${resolvedOptions.assetsPath}/${lang}`);
          // For all files
          const files = await readdir(baseDir);

          if (files.length > 0) {
            const ext = extname(files[0]);
            let data: Translation = {};

            const tasks = files.map(filename => readFile(`${baseDir}/${filename}`, 'utf8'));
            const sources = await Promise.all(tasks);

            for (const source of sources) {
              if (source) {
                switch (ext) {
                  case '.json':
                    data = parseJson(data, source);
                    break;
                }
              }
            }

            translation[lang] = { ...translation[lang], ...data }; // Shallow merge
          }
        }));
      }
    },

    /**
     * Transform functions
     * Prefer transform hook because unused imports will be removed, unlike renderChunk
     */
    async transform(code: string, id: string) {
      if (target === 'client') {
        // Filter id
        if (/\/src\//.test(id) && /\.(js|cjs|mjs|jsx|ts|tsx)$/.test(id)) {
          // TEST
          /* if (code.includes('$translate')) {
            console.log(code);
          } */
          // Filter code: $plural
          if (/\$plural/.test(code)) {
            code = transformPlural(code);
          }
          // Filter code: $translate
          if (/\$translate/.test(code)) {
            code = transform(code);
          }
          // Filter code: $inlineTranslate
          if (/\$inlineTranslate/.test(code)) {
            code = transformInline(code);
          }
          // TEST
          /* if (code.includes('$translate')) {
            console.log(code);
          } */
          return code;
        }
      }
    },

    /**
     * Split chunks by lang
     */
    async writeBundle(options: NormalizedOutputOptions, bundle: OutputBundle) {
      if (target === 'client') {
        const dir = options.dir ? options.dir : normalize(`${resolvedOptions.basePath}/${resolvedOptions.outDir}`);
        const bundles = Object.values(bundle);

        const tasks = resolvedOptions.supportedLangs
          .map(x => writeChunks(x, bundles, dir, translation, resolvedOptions));
        await Promise.all(tasks);
      }
    },

    async closeBundle() {
      if (target === 'client') {
        const log = createWriteStream('./qwik-speak-inline.log', { flags: 'a' });

        log.write(`${target}: ` + (input ?? '-') + '\n');

        missingValues.forEach(x => log.write(x + '\n'));
        dynamicKeys.forEach(x => log.write(x + '\n'));
        dynamicParams.forEach(x => log.write(x + '\n'));

        log.write((`Qwik Speak Inline: build ends at ${new Date().toLocaleString()}\n`));
      }
    }
  };

  return plugin;
}

export async function writeChunks(
  lang: string,
  bundles: (OutputAsset | OutputChunk)[],
  dir: string,
  translation: Translation,
  opts: Required<QwikSpeakInlineOptions>
) {
  const targetDir = normalize(`${dir}/build/${lang}`);
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const tasks: Promise<void>[] = [];
  for (const chunk of bundles) {
    if (chunk.type === 'chunk' && 'code' in chunk && /build\//.test(chunk.fileName)) {
      const filename = normalize(`${targetDir}/${chunk.fileName.split('/')[1]}`);

      // TEST
      /* if (chunk.code.includes(inlinePlaceholder)) {
        console.log(filename);
        console.log(chunk.code);
      } */
      // Inline
      let code = inlinePlural(chunk.code, inlinePluralPlaceholder, inlinePlaceholder, lang, opts);
      code = inline(code, translation, inlinePlaceholder, lang, opts);
      tasks.push(writeFile(filename, code));
      // TEST
      /* if (chunk.code.includes(inlinePlaceholder)) {
        console.log(filename);
        console.log(code);
      } */

      // Original chunks to default lang
      if (lang === opts.defaultLang) {
        const defaultTargetDir = normalize(`${dir}/build`);
        const defaultFilename = normalize(`${defaultTargetDir}/${chunk.fileName.split('/')[1]}`);
        tasks.push(writeFile(defaultFilename, code));
      }
    }
  }
  await Promise.all(tasks);
}

/**
 * Transform $translate to placeholder
 */
export function transform(code: string): string {
  const alias = getTranslateAlias(code);

  // Parse sequence
  const sequence = parseSequenceExpressions(code, alias);

  if (sequence.length === 0) return code;

  for (const expr of sequence) {
    // Original function
    const originalFn = expr.value;
    // Arguments
    const args = expr.arguments;

    if (args?.length > 0) {
      if (checkDynamic(args, originalFn)) continue;

      // Transpile with placeholder
      const transpiled = originalFn.replace(new RegExp(`${alias}\\(`), `${inlinePlaceholder}(`);
      // Replace
      code = code.replace(originalFn, transpiled);
    }
  }

  return code;
}

/**
 * Transform $inlineTranslate to placeholder
 */
export function transformInline(code: string): string {
  const alias = getInlineTranslateAlias(code);

  // Parse sequence
  const sequence = parseSequenceExpressions(code, alias);

  if (sequence.length === 0) return code;

  for (const expr of sequence) {
    // Original function
    const originalFn = expr.value;
    // Arguments
    const args = expr.arguments;

    if (args?.length > 0) {
      if (checkDynamicInline(args, originalFn)) continue;

      // Transpile with placeholder
      const transpiled = originalFn.replace(new RegExp(`${alias}\\(`), `${inlinePlaceholder}(`);
      // Replace
      code = code.replace(originalFn, transpiled);
    }
  }

  return code;
}

/**
 * Transform $plural to placeholder
 */
export function transformPlural(code: string): string {
  const alias = getPluralAlias(code);

  // Parse sequence
  const sequence = parseSequenceExpressions(code, alias);

  if (sequence.length === 0) return code;

  for (const expr of sequence) {
    // Original function
    const originalFn = expr.value;
    // Arguments
    const args = expr.arguments;

    if (args?.length > 0) {
      if (checkDynamicPlural(args, originalFn)) continue;

      // Transpile with placeholder
      const transpiled = originalFn.replace(new RegExp(`${alias}\\(`), `${inlinePluralPlaceholder}(`);
      // Replace
      code = code.replace(originalFn, transpiled);
    }
  }

  return code;
}

export function inline(
  code: string,
  translation: Translation,
  placeholder: string,
  lang: string,
  opts: Required<QwikSpeakInlineOptions>
): string {
  // Parse sequence
  const sequence = parseSequenceExpressions(code, placeholder);

  if (sequence.length === 0) return code;

  for (const expr of sequence) {
    // Original function
    const originalFn = expr.value;
    // Arguments
    const args = expr.arguments;

    if (args?.length > 0) {
      const resolvedLang = withLang(lang, args[2], opts);

      let resolvedValue: string | Translation = quoteValue('');

      // Get array of keys or key
      if (args[0].type === 'ArrayExpression') {
        const keys = getKeys(args[0], opts.keyValueSeparator);

        const keyValues: (string | Translation)[] = [];
        for (const key of keys) {
          const value = getValue(key, translation[resolvedLang], args[1], opts.keySeparator);
          if (!value) {
            missingValues.push(`${resolvedLang} - missing value for key: ${key}`);
            keyValues.push(quoteValue(''));
          } else {
            keyValues.push(value);
          }
        }
        resolvedValue = keyValues;
      } else if (args?.[0]?.value) {
        const key = getKey(args[0].value, opts.keyValueSeparator);

        const value = getValue(key, translation[resolvedLang], args[1], opts.keySeparator);
        if (!value) {
          missingValues.push(`${resolvedLang} - missing value for key: ${key}`);
        } else {
          resolvedValue = value;
        }
      }

      // Transpile
      const transpiled = transpileFn(resolvedValue);

      // Replace
      code = code.replace(originalFn, transpiled);
    }
  }

  return code;
}

export function inlinePlural(
  code: string,
  pluralPlaceholder: string,
  placeholder: string,
  lang: string,
  opts: Required<QwikSpeakInlineOptions>
): string {
  // Parse sequence
  const sequence = parseSequenceExpressions(code, pluralPlaceholder);

  if (sequence.length === 0) return code;

  for (const expr of sequence) {
    // Original function
    const originalFn = expr.value;
    // Arguments
    const args = expr.arguments;

    if (args?.length > 0) {
      const resolvedLang = withLang(lang, args[4], opts);

      // Rules
      const options = getOptions(args[3]?.properties);
      const rules = getRules(resolvedLang, options);

      // Transpile
      const transpiled = transpilePluralFn(rules, resolvedLang, placeholder, args, opts);

      // Replace
      code = code.replace(originalFn, transpiled);
    }
  }

  return code;
}

/**
 * Transpile the function
 */
export function transpileFn(value: string | Translation): string {
  if (typeof value === 'object') {
    return `${stringifyObject(value)}`;
  } else {
    return value;
  }
}

/**
 * Transpile the plural function
 */
export function transpilePluralFn(
  rules: string[],
  lang: string,
  placeholder: string,
  args: Argument[],
  opts: Required<QwikSpeakInlineOptions>
): string {
  let translation = '';

  const transpileRules = (lang: string): string => {
    let expr = '(';
    for (const rule of rules) {
      let key = args[1]?.value;
      key = key ? `${key}${opts.keySeparator}${rule}` : rule;

      // Params
      const params: Property[] = [{
        type: 'Property',
        key: { type: 'Identifier', value: 'value' },
        value: { type: 'Identifier', value: args[0].value! }
      }];
      if (args[2]?.properties) {
        for (const p of args[2].properties) {
          params.push(p);
        }
      }
      const strParams = params.map(p => `${p.key.value}: ${stringifyParam(p)}`).join(', ');

      if (rule !== rules[rules.length - 1]) {
        const strOptions = args[3]?.properties?.map(p => `${p.key.value}: ${stringifyParam(p)}`)?.join(', ');
        const strRule = stringifyRule(lang, args[0].value!, rule, strOptions);
        expr += (strRule + ` && ${placeholder}(${quoteValue(key)}, {${strParams}}, ${quoteValue(lang)}) || `);
      } else {
        expr += `${placeholder}(${quoteValue(key)}, {${strParams}}, ${quoteValue(lang)})`;
      }
    }
    expr += ')';
    return expr;
  }

  translation += transpileRules(lang);

  return translation;
}

export function checkDynamic(args: Argument[], originalFn: string): boolean {
  if (args?.[0]?.value) {
    // Dynamic key
    if (args[0].type === 'Identifier') {
      if (args[0].value !== 'key' && args[0].value !== 'keys') dynamicKeys.push(`dynamic key: ${originalFn.replace(/\s+/g, ' ')} - skip`)
      return true;
    }
    if (args[0].type === 'Literal') {
      if (args[0].value !== 'key' && args[0].value !== 'keys' && /\${.*}/.test(args[0].value)) {
        dynamicKeys.push(`dynamic key: ${originalFn.replace(/\s+/g, ' ')} - skip`)
        return true;
      }
    }

    // Dynamic argument (params, lang)
    if (args[1]?.type === 'Identifier' || args[1]?.type === 'CallExpression' ||
      args[2]?.type === 'Identifier' || args[2]?.type === 'CallExpression') {
      dynamicParams.push(`dynamic params: ${originalFn.replace(/\s+/g, ' ')} - skip`);
      return true;
    }
  }
  return false;
}

export function checkDynamicInline(args: Argument[], originalFn: string): boolean {
  if (args?.[0]?.value) {
    // Dynamic key
    if (args[0].type === 'Identifier') {
      if (args[0].value !== 'key' && args[0].value !== 'keys') dynamicKeys.push(`dynamic key: ${originalFn.replace(/\s+/g, ' ')} - skip`)
      return true;
    }
    if (args[0].type === 'Literal') {
      if (args[0].value !== 'key' && args[0].value !== 'keys' && /\${.*}/.test(args[0].value)) {
        dynamicKeys.push(`dynamic key: ${originalFn.replace(/\s+/g, ' ')} - skip`)
        return true;
      }
    }

    // Dynamic argument (params, lang)
    if (args[2]?.type === 'Identifier' || args[2]?.type === 'CallExpression' ||
      args[3]?.type === 'Identifier' || args[3]?.type === 'CallExpression') {
      dynamicParams.push(`dynamic params: ${originalFn.replace(/\s+/g, ' ')} - skip`);
      return true;
    }
  }
  return false;
}

export function checkDynamicPlural(args: Argument[], originalFn: string): boolean {
  if (args?.[0]?.value) {
    // Dynamic argument (key, params, options, lang)
    if (args[1]?.type === 'Identifier' || args[1]?.type === 'CallExpression' ||
      args[2]?.type === 'Identifier' || args[2]?.type === 'CallExpression' ||
      args[3]?.type === 'Identifier' || args[3]?.type === 'CallExpression' ||
      args[4]?.type === 'Identifier' || args[4]?.type === 'CallExpression') {
      dynamicParams.push(`dynamic plural: ${originalFn.replace(/\s+/g, ' ')} - skip`);
      return true;
    }
  }
  return false;
}

export function withLang(lang: string, arg: Argument, opts: Required<QwikSpeakInlineOptions>): string {
  let optionalLang: string | undefined;

  // Check multilingual
  if (arg?.type === 'Literal') {
    optionalLang = opts.supportedLangs.find(x => x === arg.value);
  }

  return optionalLang ?? lang;
}

export function getKey(key: string, keyValueSeparator: string): string {
  key = key.split(keyValueSeparator)[0];
  return key;
}

export function getKeys(key: Argument, keyValueSeparator: string): string[] {
  const keys: string[] = [];
  if (key.elements) {
    for (const element of key.elements) {
      if (element.type === 'Literal') {
        keys.push(element.value.split(keyValueSeparator)[0]);
      }
    }
  }
  return keys;
}

export function getValue(
  key: string,
  data: Translation,
  params: Argument | undefined,
  keySeparator: string
): string | Translation | undefined {
  const value = key.split(keySeparator).reduce((acc, cur) =>
    (acc && acc[cur] !== undefined) ?
      acc[cur] :
      undefined, data);

  if (value) {
    if (typeof value === 'string') return params ? transpileParams(value, params) : quoteValue(value);
    if (typeof value === 'object') return value;
  }

  return undefined;
}


export function transpileParams(value: string, params: Argument): string | undefined {
  if (params.properties) {
    for (const property of params.properties) {
      value = value.replace(/{{\s?([^{}\s]*)\s?}}/g, (token: string, key: string) => {
        return key === property.key.value ? interpolateParam(property) : token;
      });
    }
  }
  return quoteValue(value);
}

/**
 * Return the value in backticks
 */
export function quoteValue(value: string): string {
  return !/^`.*`$/.test(value) ? '`' + value + '`' : value;
}

export function interpolateParam(property: Property): string {
  return property.value.type === 'Literal' ? property.value.value : '${' + property.value.value + '}';
}

export function stringifyParam(property: Property): string {
  return property.value.type === 'Literal' ? quoteValue(property.value.value) : property.value.value;
}

export function stringifyRule(lang: string, value: string | number, rule: string, options?: string): string {
  if (options) {
    return `new Intl.PluralRules(${quoteValue(lang)}, {${options}}).select(+${value}) === ${quoteValue(rule)}`;
  } else {
    return `new Intl.PluralRules(${quoteValue(lang)}).select(+${value}) === ${quoteValue(rule)}`;
  }
}

/**
 * Ensure that values between backticks are not stringified
 */
export function stringifyObject(value: Translation): string {
  let strValue = JSON.stringify(value, replacer);
  strValue = strValue.replace(/("__qsOpenBt)|(__qsCloseBt")/g, '`');
  return strValue;
}

/**
 * Replace quoted values with a placeholder
 */
function replacer(key: string, value: string | Translation): string | Translation {
  if (typeof value === 'string' && /^`.*`$/.test(value)) return value.replace(/^`/, '__qsOpenBt').replace(/`$/, '__qsCloseBt');
  return value;
}


