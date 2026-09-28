/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');

// Match Metro's singleton module identity, especially for operation ownership.
function createLoader(mocks = {}, globals = {}) {
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(root, relative);
    if (cache.has(file)) return cache.get(file);
    const exports = {};
    cache.set(file, exports);
    const source = fs.readFileSync(file, 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    vm.runInNewContext(code, { exports, Error, Uint8Array, TextEncoder, TextDecoder,
      __DEV__: false, process: { env: {} }, ...globals, require(name) {
        if (name in mocks) return mocks[name];
        if (name.startsWith('@/')) return load(`src/${name.slice(2)}.ts`);
        if (name.startsWith('.')) return load(path.relative(root, path.resolve(path.dirname(file), `${name}.ts`)));
        throw new Error(`Unexpected dependency: ${name}`);
      } });
    return exports;
  }
  return load;
}
const activity = createLoader()('src/features/activity/operation-lifecycle.ts');
module.exports = { createLoader, activity };
