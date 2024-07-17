# Rollup plugin to compile i18n resources

### Introduction

This is a rollup plugin to compile the i18n resources defined using XW (Typescript) framework.


### Usage

This plugin is used in corresponding `vite.config.ts` to control how i18n resources (locales) are compiled.

The plugin can be included using:

```typescript
import xwtsI18n from '@xirelogy/rollup-plugin-xwts-i18n';
```

And configured like:

```typescript
const i18n = xwtsI18n({
  output: { ... },
  roots: {
    'locales': [],
  },
  include: 'locales/**',
});
```

with following configuration options:

| Key | Usage |
| --- | --- |
| `output` | Define the output type. Currently `virtual` and `file` supported. |
| `roots` | Module prefix of the locales defined. This correspond to the names where the i18n module is initialized using `xw.i18n.initModule(...)` |
| `include` | Search folder for locale translation files |


#### Usage in projects (`virtual` output)

This is normally used for projects, whereby the deliverable is the project output.
Locales will be compiled into a virtual module defined using the `moduleName` argument.

| Key | Usage |
| --- | --- |
| `moduleName` | The module name whereby the locales can be included. |

Example:

```typescript
import { defineConfig } from 'vite';

import xwtsI18n from '@xirelogy/rollup-plugin-xwts-i18n';

const i18n = xwtsI18n({
  output: {
    type: 'virtual',
    moduleName: 'locale:compiled',
  },
  roots: {
    'locales': [],
  },
  include: 'locales/**',
});

export default defineConfig({
  plugins: [
    i18n,
  ],
  ...
});
```


#### Usage in libraries (`file` output)

This is normally used for libraries, whereby its outputs will be used by other projects.
Locales will be compiled into file supporting the following distribution target:

| Key | Usage |
| --- | --- |
| `fileName` | The filename for output in the ESM format. |
| `cjsFileName` | The filename for output in the CommonJS/UMD format. |
| `dtsFilename` | The filename for output containing the Typescript definition (`.d.ts`). |

Example:

```typescript
import { defineConfig } from 'vite';

import xwtsI18n from '@xirelogy/rollup-plugin-xwts-i18n';

const i18n = xwtsI18n({
  output: {
    type: 'file',
    fileName: 'locales.es.js',
    cjsFileName: 'locales.umd.js',
    dtsFilename: 'locales.d.ts',
  },
  roots: {
    'locales': [ '<module>', '<names>' ],
  },
  include: 'locales/**'
});

export default defineConfig({
  plugins: [
    i18n,
  ],
  ...
});
```


### Importing the locales

Compiled locales are normally imported and used in the the entrance file (like `main.ts`), in a section of code something like below:

```typescript
import { xw } from '@xirelogy/xwts';

// Import current project locales (virtual output)
import locales from 'locale:compiled';
locales(xw.i18nSetup);

// Import libraries locales (file output)
import xwLocales from '@xirelogy/xwts/locales';
xwLocales(xw.i18nSetup);

...
```


### Working with Typescript

When importing current project locales like below:

```typescript
import locales from 'locale:compiled';
locales(xw.i18nSetup);
```

The corresponding module might not be recognized and causes a warning. Create a shim file `shims-locale.d.ts` with the following content shall overcome this:

```typescript
/* eslint-disable */
declare module 'locale:compiled' {
  import { XwI18nModuleDefinable } from '@xirelogy/xwts';
  export default function locales(modDef: XwI18nModuleDefinable): void;
}
```