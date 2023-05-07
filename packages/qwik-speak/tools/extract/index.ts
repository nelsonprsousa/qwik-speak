import { readdir, readFile, writeFile } from 'fs/promises';
import { existsSync, mkdirSync } from 'fs';
import { extname, join, normalize } from 'path';

import type { QwikSpeakExtractOptions, Translation } from '../core/types';
import type { Argument, CallExpression, Element } from '../core/parser';
import { getPluralAlias, getTranslateAlias, getInlineTranslateAlias, getUseTranslateAlias, parseJson, parseSequenceExpressions } from '../core/parser';
import { deepClone, deepMerge, deepSet } from '../core/merge';
import { minDepth, sortTarget, toJsonString } from '../core/format';
import { getOptions, getRules } from '../core/intl-parser';

/**
 * Extract translations from source files
 */
export async function qwikSpeakExtract(options: QwikSpeakExtractOptions) {
  // Resolve options
  const resolvedOptions: Required<QwikSpeakExtractOptions> = {
    ...options,
    basePath: options.basePath ?? './',
    sourceFilesPaths: options.sourceFilesPaths ?? ['src'],
    excludedPaths: options.excludedPaths ?? [],
    assetsPath: options.assetsPath ?? 'i18n',
    format: options.format ?? 'json',
    filename: options.filename ?? 'app',
    keySeparator: options.keySeparator ?? '.',
    keyValueSeparator: options.keyValueSeparator ?? '@@',
  }

  // Logs
  const stats = new Map<string, number>();

  const baseSources = resolvedOptions.sourceFilesPaths.map(value => normalize(`${resolvedOptions.basePath}/${value}`));
  const excludedPaths = resolvedOptions.excludedPaths.map(value => normalize(`${resolvedOptions.basePath}/${value}`));

  // Source files
  const sourceFiles: string[] = [];
  // Translation data
  const translation: Translation = Object.fromEntries(resolvedOptions.supportedLangs.map(value => [value, {}]));

  /**
   * Read source files recursively
   */
  const readSourceFiles = async (sourceFilesPath: string, excludedPaths: string[]) => {
    const files = await readdir(sourceFilesPath, { withFileTypes: true });
    for (const file of files) {
      const filePath = join(sourceFilesPath, file.name);
      const ext = extname(file.name);
      if (file.isDirectory()) {
        if (!excludedPaths.includes(filePath)) {
          await readSourceFiles(filePath, excludedPaths);
        }
      } else if (/\.js|\.ts|\.jsx|\.tsx/.test(ext) && !(/test|spec/).test(file.name)) {
        sourceFiles.push(filePath);
      }
    }
  };

  const checkDynamic = (element: Element | Argument): boolean => {
    // Dynamic key
    if (element.type === 'Identifier') {
      stats.set('dynamic', (stats.get('dynamic') ?? 0) + 1);
      return true;
    }
    if (element.type === 'Literal' && element.value) {
      if (/\${.*}/.test(element.value)) {
        stats.set('dynamic', (stats.get('dynamic') ?? 0) + 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Parse source file to return keys
   */
  const parseSourceFile = async (file: string): Promise<string[]> => {
    const keys: string[] = [];

    let code = await readFile(normalize(`${resolvedOptions.basePath}/${file}`), 'utf8');

    const clearTypes = (alias: string) => {
      code = code.replace(new RegExp(`${alias}<.*>\\(`, 'g'), `${alias.replace('\\b', '')}(`);
    }

    const parseSequence = (sequence: CallExpression[]) => {
      for (const expr of sequence) {
        const args = expr.arguments;

        if (args?.length > 0) {
          // Get array of keys or key
          if (args[0].type === 'ArrayExpression') {
            if (args[0].elements) {
              for (const element of args[0].elements) {
                if (element.type === 'Literal') {
                  if (checkDynamic(element))
                    continue;

                  keys.push(element.value);
                }
              }
            }
          } else if (args?.[0]?.value) {
            if (checkDynamic(args[0]))
              continue;

            keys.push(args[0].value);
          }
        }
      }
    }

    // $translate
    if (/\$translate/.test(code)) {
      const alias = getTranslateAlias(code);
      // Clear types
      clearTypes(alias);
      // Parse sequence
      const sequence = parseSequenceExpressions(code, alias);
      parseSequence(sequence);
    }

    // $inlineTranslate
    if (/\$inlineTranslate/.test(code)) {
      const alias = getInlineTranslateAlias(code);
      // Clear types
      clearTypes(alias);
      // Parse sequence
      const sequence = parseSequenceExpressions(code, alias);
      parseSequence(sequence);
    }

    // $plural
    if (/\$plural/.test(code)) {
      const alias = getPluralAlias(code);
      // Parse sequence
      const sequence = parseSequenceExpressions(code, alias);

      for (const expr of sequence) {
        const args = expr.arguments;

        if (args?.length > 0) {
          // Dynamic argument (key, options)
          if (args[1]?.type === 'Identifier' || args[1]?.type === 'CallExpression' ||
            args[3]?.type === 'Identifier' || args[3]?.type === 'CallExpression') {
            stats.set('dynamic plural', (stats.get('dynamic plural') ?? 0) + 1);
            continue;
          }

          // Map of rules
          const rules = new Set<string>();
          const options = getOptions(args[3]?.properties);
          for (const lang of resolvedOptions.supportedLangs) {
            const rulesByLang = getRules(lang, options);
            for (const rule of rulesByLang) {
              rules.add(rule);
            }
          }

          for (const rule of rules) {
            let key = args?.[1]?.value;
            key = key ? `${key}${resolvedOptions.keySeparator}${rule}` : rule;
            keys.push(key);
          }
        }
      }
    }

    // useTranslate$
    if (/useTranslate\$/.test(code)) {
      const alias = getUseTranslateAlias(code);
      if (alias) {
        // Clear types
        clearTypes(alias);
        // Parse sequence
        const sequence = parseSequenceExpressions(code, alias);
        parseSequence(sequence);
      }
    }

    return keys;
  };

  /**
   * Read assets
   */
  const readAssets = async (): Promise<Map<string, Translation>> => {
    const assetsData = new Map<string, Translation>();

    for (const lang of resolvedOptions.supportedLangs) {
      const baseAssets = normalize(`${resolvedOptions.basePath}/${resolvedOptions.assetsPath}/${lang}`);

      if (existsSync(baseAssets)) {

        const files = await readdir(baseAssets);

        if (files.length > 0) {
          const ext = extname(files[0]);
          let data: Translation = {};

          const tasks = files.map(filename => readFile(`${baseAssets}/${filename}`, 'utf8'));
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

          assetsData.set(lang, data);
        }
      }
    }

    return assetsData;
  };

  /**
   * Write translation data
   * 
   * Naming convention of keys:
   * min depth > 0: filenames = each top-level property name
   * min depth = 0: filename = 'app'
   */
  const writeAssets = async () => {
    for (const lang of resolvedOptions.supportedLangs) {
      const baseAssets = normalize(`${resolvedOptions.basePath}/${resolvedOptions.assetsPath}/${lang}`);

      if (!existsSync(baseAssets)) {
        mkdirSync(baseAssets, { recursive: true });
      }

      const topLevelKeys = Object.keys(translation[lang]).filter(key => minDepth(translation[lang][key]) > 0);
      const bottomLevelKeys = Object.keys(translation[lang]).filter(key => minDepth(translation[lang][key]) === 0);

      const bottomTranslation: Translation = {};
      if (translation[lang][resolvedOptions.filename]) {
        bottomTranslation[resolvedOptions.filename] = translation[lang][resolvedOptions.filename];
      }
      for (const bottomLevelKey of bottomLevelKeys) {
        bottomTranslation[bottomLevelKey] = translation[lang][bottomLevelKey];
      }
      if (Object.keys(bottomTranslation).length > 0) {
        await writeAsset(bottomTranslation, resolvedOptions.filename, baseAssets);
      }

      for (const topLevelKey of topLevelKeys.filter(key => key !== resolvedOptions.filename)) {
        await writeAsset({ [topLevelKey]: translation[lang][topLevelKey] }, topLevelKey, baseAssets);
      }
    }
  };

  const writeAsset = async (translation: Translation, filename: string, baseAssets: string) => {
    let data: string;
    switch (resolvedOptions.format) {
      case 'json':
        // Computed property name
        data = toJsonString(translation);
        break;
    }
    const file = normalize(`${baseAssets}/${filename}.${resolvedOptions.format}`);
    await writeFile(file, data);
    console.log(file);
  };

  /**
   * START PIPELINE
   */

  /* Read sources files */
  for (const baseSource of baseSources) {
    await readSourceFiles(baseSource, excludedPaths);
  }

  /* Parse sources */
  const tasks = sourceFiles.map(file => parseSourceFile(file));
  const sources = await Promise.all(tasks);

  let keys: string[] = [];
  for (const source of sources) {
    keys = keys.concat(source);
  }

  /* Unique keys */
  keys = [...new Set<string>(keys)];
  stats.set('unique keys', (stats.get('unique keys') ?? 0) + keys.length);

  /* Deep set in translation data */
  for (let key of keys) {
    let defaultValue: string | Translation | undefined = undefined;

    [key, defaultValue] = key.split(resolvedOptions.keyValueSeparator);

    // Objects/arrays
    if (/^[[{].*[\]}]$/.test(defaultValue) && !/^{{/.test(defaultValue)) {
      defaultValue = JSON.parse(defaultValue);
    }

    for (const lang of resolvedOptions.supportedLangs) {
      deepSet(translation[lang], key.split(resolvedOptions.keySeparator), deepClone(defaultValue || ''));
    }
  }

  /* Read assets */
  const assetsData = await readAssets();

  /* Deep merge translation data */
  if (assetsData.size > 0) {
    for (const [lang, data] of assetsData) {
      deepMerge(translation[lang], data);
    }
  }

  /* Sort by key */
  for (const lang of resolvedOptions.supportedLangs) {
    translation[lang] = sortTarget(translation[lang]);
  }

  /* Write translation data */
  await writeAssets();

  /* Log */
  for (const [key, value] of stats) {
    switch (key) {
      case 'unique keys':
        console.log('\x1b[32m%s\x1b[0m', `extracted keys: ${value}`);
        break;
      case 'dynamic':
        console.log('\x1b[32m%s\x1b[0m', `translations skipped due to dynamic keys: ${value}`);
        break;
      case 'dynamic plural':
        console.log('\x1b[32m%s\x1b[0m', `plurals skipped due to dynamic keys/options: ${value}`);
        break;
    }
  }
}

export type { QwikSpeakExtractOptions };
