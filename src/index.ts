import * as fs from 'fs';
import { sep } from 'path';
import { createFilter } from '@rollup/pluginutils';
import { Plugin } from 'rollup';
import type { FilterPattern } from '@rollup/pluginutils';


/**
 * The prefix to identify the virtual module
 */
const VIRTUAL_PREFIX = `\0xwts-i18n:`;


/**
 * Function to determine locale from file path
 */
type DetermineLocaleFunction = (path: string) => string;


/**
 * Output target
 */
interface CommonOutputTarget {
  /**
   * Output type
   */
  type: string;
}


/**
 * Output as virtual content
 */
interface VirtualOutputTarget {
  /**
   * Output type: virtual
   */
  type: 'virtual';
  /**
   * Module name
   */
  moduleName: string;
}


/**
 * Output as file content
 */
interface FileOutputTarget {
  /**
   * Output type: file
   */
  type: 'file';
  /**
   * Corresponding output filename (ESM format)
   */
  fileName: string;
  /**
   * Corresponding output filename (optional, CJS format)
   */
  cjsFileName?: string;
  /**
   * Corresponding output filename (optional, TS declaration)
   */
  dtsFilename?: string;
}



interface RollupXwtsI18nOptions {
  /**
   * Output target
   */
  output: VirtualOutputTarget|FileOutputTarget|CommonOutputTarget;
  /**
   * All root directories to be included, mapping to corresponding i18n modules
   */
  roots: Record<string, string[]>;
  /**
   * Pattern or array of pattern for files where the plugins should be operated on
   */
  include?: FilterPattern;
  /**
   * Pattern or array of pattern for files where the plugins should be excluded
   */
  exclude?: FilterPattern;
  /**
   * Determine the related locale from given filename
   */
  determineLocale?: DetermineLocaleFunction;
}


/**
 * Expand the target directory recursively for all JSON files
 * @param dir
 */
function* expandDirectoryForJson(dir: string): Generator<string> {
  for (const file of fs.readdirSync(dir)) {
    const path = `${dir}/${file}`;
    const stat = fs.lstatSync(path);
    if (stat.isDirectory()) {
      yield* expandDirectoryForJson(path);
    } else if (path.slice(-5) === '.json') {
      yield path;
    }
  }
}


/**
 * Default method to determine locale
 * @param filePath
 * @returns
 */
function defaultDetermineLocale(filePath: string): string {
  return filePath.split(sep).at(-2) as string;
}


/**
 * Filter check function
 */
type CreateFilterReturn = ReturnType<typeof createFilter>;


/**
 * Error handler
 */
type OnErrorFunction = (filePath: string, e: Error) => void;


/**
 * Compilation result
 */
interface CompilationResult {
  /**
   * Function name
   */
  name: string;
  /**
   * Compilation result code
   */
  code: string;
}


/**
 * Compile target as function
 * @param cwd Current working directory when plugin is executed
 * @param roots All roots to be compiled
 * @param filter Filter function from createFilter()
 * @param determineLocale Function determine function
 * @param onError Error handler
 * @returns
 */
function compileAsFunction(cwd: string, roots: Record<string, string[]>, filter: CreateFilterReturn, determineLocale: DetermineLocaleFunction, onError: OnErrorFunction): CompilationResult {
  const fnName = '__xwts_i18n_compiled_' + (new Date().getTime()) + '_' + Math.floor(Math.random() * 10000);
  let ret = `function ${fnName}(modDef) {`;

  for (const root in roots) {
    const rootPath = `${cwd}/${root}`;
    const rootModules = roots[root];

    let flattenRootModules = '';
    for (const rootModule of rootModules) {
      flattenRootModules += `,'${rootModule}'`;
    }
    flattenRootModules = flattenRootModules.substring(1);
    ret += `modDef.define(${flattenRootModules})`;

    for (const filePath of expandDirectoryForJson(rootPath)) {
      if (!filter(filePath)) continue;

      try {
        const locale = determineLocale(filePath);
        const targetName = (filePath.split(sep).at(-1) as string).slice(0, -5);

        const fileContent = fs.readFileSync(filePath, {
          encoding: 'utf8',
          flag: 'r',
        });
        const decodedContent = JSON.parse(fileContent);

        ret += `.defines('${targetName}', '${locale}', ${JSON.stringify(decodedContent)})`;
      } catch (e) {
        onError(filePath, e instanceof Error ? e : new Error(String(e)));
      }
    }

    ret += ';';
  }

  ret += `}`;
  return {
    name: fnName,
    code: ret,
  };
}


/**
 * Plugin function
 * @param options Options to the plugin
 * @returns Created plugin
 */
export default function xwtsI18n(options: RollupXwtsI18nOptions): Plugin {

  // Destructure from options
  const {
    output,
    roots,
    include,
    exclude,
    determineLocale = defaultDetermineLocale,
  } = options;

  const cwd = process.cwd();
  const filter = createFilter(include, exclude);

  let outputModuleName: string|null = null;
  let outputFileName: string|null = null;
  let outputCjsFileName: string|null = null;
  let outputDtsFileName: string|null = null;
  let isOutputGenerated: boolean = false;

  switch (output.type) {
    case 'virtual':
      {
        const virtualOutputTarget = output as VirtualOutputTarget;
        outputModuleName = virtualOutputTarget.moduleName;
      }
      break;
    case 'file':
      {
        const fileOutputTarget = output as FileOutputTarget;
        outputFileName = fileOutputTarget.fileName;
        outputCjsFileName = fileOutputTarget.cjsFileName ?? null;
        outputDtsFileName = fileOutputTarget.dtsFilename ?? null;
      }
      break;
    default:
      throw new Error(`Unsupported output type '${output.type}'`);
  }

  return {
    name: 'xwts-i18n',

    resolveId(id) {
      if (id === outputModuleName) return VIRTUAL_PREFIX + id;
      return null;
    },

    load(id) {
      if (!id.startsWith(VIRTUAL_PREFIX)) return null;

      const moduleId = id.slice(VIRTUAL_PREFIX.length);
      if (moduleId !== outputModuleName) return null;

      const fn = compileAsFunction(cwd, roots, filter, determineLocale, (filePath, e) => {
        this.error(`In ${filePath}: ${e.message}`);
      });

      return `export default ${fn.code}`;
    },

    generateBundle() {
      if (outputFileName !== null && !isOutputGenerated) {
        const fn = compileAsFunction(cwd, roots, filter, determineLocale, (filePath, e) => {
          this.error(`In ${filePath}: ${e.message}`);
        });
        isOutputGenerated = true;

        this.emitFile({
          type: 'asset',
          name: outputFileName,
          source: `export default ${fn.code}`,
        });

        if (outputCjsFileName !== null) {
          this.emitFile({
            type: 'asset',
            name: outputCjsFileName,
            source: `${fn.code}; exports.default = ${fn.name}; module.exports = Object.assign(exports.default, exports);`,
          });
        }

        if (outputDtsFileName !== null) {
          this.emitFile({
            type: 'asset',
            name: outputDtsFileName,
            source: `import { XwI18nModuleDefinable } from '@xirelogy/xwts'; export default function ${fn.name}(modDefs: XwI18nModuleDefinable): void;`,
          });
        }
      }
    },
  };
}