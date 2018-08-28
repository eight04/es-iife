es-iife
=======

[![Build Status](https://travis-ci.org/eight04/es-iife.svg?branch=master)](https://travis-ci.org/eight04/es-iife)
[![codecov](https://codecov.io/gh/eight04/es-iife/branch/master/graph/badge.svg)](https://codecov.io/gh/eight04/es-iife)
[![install size](https://packagephobia.now.sh/badge?p=es-iife)](https://packagephobia.now.sh/result?p=es-iife)

Transform ES module into a simple IIFE.

Features
--------

* `import` statements are resolved to global variables.
* `export` statements are exported as a global variable.

There are more samples under `test/cases` folder.

Usage
-----

```js
const {parse} = require("acorn");
const {transform} = require("es-iife");
const code = `
import foo from "./foo.js";
const main = (value) => return foo(value);
export default main;
`;
const result = transform({
  code,
  parse,
  name: "doFoo",
  resolveGlobal: (name) => {
    if (name === "./foo.js") {
      return "FOO";
    }
  }
})
console.log(result.code);
/* ->
var doFoo = (function () {

const main = (value) => return FOO(value);

return main;
})();
*/
```

API reference
-------------

This module exports following members.

* `transform`: A function which can convert ES module synax into an IIFE.

### transform

```js
const result = transform({
  code: String,
  parse?: Function,
  ast?: Object,
  sourcemap?: Boolean,
  resolveGlobal?: (importPath: String) => globalVariableName: String,
  name?: String
});
```

`code` - the JavaScript source code that would be transformed.

`parse` - a parser function which can parse JavaScript code into ESTree.

`ast` - AST object. If undefined then use `parse(code)`.

`sourcemap` - if true then generate the sourcemap.

The `result` object has following members:

* `code`: string. The result JavaScript code.
* `map?`: object. The source map object generated by [`magicString.generateMap`](https://github.com/Rich-Harris/magic-string#sgeneratemap-options-). If `sourcemap` is false then the map is null.

Changelog
---------

* 0.1.1 (Aug 28, 2018)

  - Fix: export from statements.

* 0.1.0 (Aug 28, 2018)

  - Initial release.
