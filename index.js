const {default: camelcase} = require("camelcase");
const MagicString = require("magic-string");
const {attachScopes} = require("@rollup/pluginutils");
// const {walk} = require("zimmerframe");

class TransformError extends Error {
  constructor(message, node) {
    super(`${message}${node.loc ? ` at ${node.loc.start.line}:${node.loc.start.column}` : node.start ? ` at ${node.start}` : ""}`);
    this.node = node;
  }
}

function isLocalVariable(name, scope) {
  while (scope.parent) {
    if (scope.declarations[name]) {
      return true;
    }
    scope = scope.parent;
  }
  return false;
}

function makeObj(types, fn) {
  return types.reduce((obj, type) => {
    obj[type] = fn;
    return obj;
  }, {});
}

async function transform({
  code,
  parse,
  ast = parse(code),
  sourcemap = false,
  strict = false,
  resolveGlobal = () => {},
  name
}) {
  // FIXME: https://github.com/sveltejs/zimmerframe/issues/35
  const {walk} = await import("zimmerframe");
  const {default: isReference} = await import("is-reference");
  code = new MagicString(code);
  resolveGlobal = createResolveGlobal(resolveGlobal);

  const importBindings = new Map; // name -> [property, source]
  const scope = attachScopes(ast, "scope");
  const references = []; // MemberExpression | Identifier
  const exportStatements = [];

  walk(ast, {scope}, {
    _(node, {state, next}) {
      if (node.scope) {
        state = {...state, scope: node.scope};
      }
      next(state);
    },
    Identifier(node, {state, path}) {
      const parent = path.at(-1);
      // NOTE: isReference may return member expression.
      if (isReference(node, parent)) {
        references.push({...state, node, parent});
      }
    },
    ImportDeclaration(node) {
      analyzeImport(node, importBindings, code);
    },
    ExportDefaultDeclaration(node, {state, next}) {
      analyzeExportDefault(node, state);
      next();
    },
    ExportNamedDeclaration(node, {state, visit}) {
      analyzeExportNamed(node, state, visit);
      // next({...state, exportDeclaration: node});
    },
    VariableDeclarator(node, {state, visit, next, path}) {
      if (node.init) {
        const declarationNode = path.at(-1);
        visit(node.id, {
          ...state,
          assignmentExpression: node,
          isSimpleAssignment: true,
          // var declarations can either be a declaration or an assignment.
          isDeclarator: declarationNode && declarationNode.type === "VariableDeclaration" && declarationNode.kind !== "var"
        });
        visit(node.init);
      } else {
        next();
      }
    },
    AssignmentExpression(node, {state, visit}) {
      visit(node.left, {
        ...state,
        assignmentExpression: node,
        isSimpleAssignment: (node.left.type === "Identifier" || node.left.type === "MemberExpression") && node.operator === "="
      });
      visit(node.right, {
        ...state,
        assignmentExpression: null
      });
    },
    AssignmentPattern(node, {state, visit}) {
      visit(node.left);
      visit(node.right, {
        ...state,
        assignmentExpression: null
      });
    },
    // ObjectPattern(node, {state, next}) {
    //   if (state.assignmentExpression) {
    //     next({...state, isSimpleAssignment: false});
    //   } else {
    //     next();
    //   }
    // },
    // ArrayPattern(node, {state, next}) {
    //   if (state.assignmentExpression) {
    //     next({...state, isSimpleAssignment: false});
    //   } else {
    //     next();
    //   }
    // },
    ...makeObj(["ForInStatement", "ForOfStatement"], (node, {state, visit}) => {
      visit(node.left, {
        ...state,
        assignmentExpression: node,
        isSimpleAssignment: false
      });
      visit(node.right, state);
      visit(node.body, state);
    })
  });

  const exportedLocals = exportStatements.reduce((map, e) => {
    if (map.has(e.localName)) {
      throw new TransformError(`Duplicate export of local ${e.localName}`, e.node);
    }
    map.set(e.localName, e);
    return map;
  }, new Map);
  const exportedExports = exportStatements.reduce((map, e) => {
    if (map.has(e.exportedName)) {
      throw new TransformError(`Duplicate export of name ${e.exportedName}`, e.node);
    }
    map.set(e.exportedName, e);
    return map;
  }, new Map);

  const globals = new Set;
  for (const [, source] of importBindings.values()) {
    globals.add(resolveGlobal(source));
  }
  let exportReassigned = false;
  
  for (const {node, scope, parent, isSimpleAssignment, assignmentExpression, isDeclarator} of references) {
    if (importBindings.has(node.name) && !scope.contains(node.name)) {
      overwriteVar(node, parent, getBindingName(importBindings.get(node.name)));
    } else if (globals.has(node.name) && scope.contains(node.name)) {
      overwriteVar(node, parent, `_local_${node.name}`);
    }
    const es = exportedLocals.get(node.name);
    if (es && !es.isExpression && assignmentExpression && !isLocalVariable(node.name, scope) && !isDeclarator && parent.type !== "MemberExpression") {
      if (!isSimpleAssignment) {
        throw new TransformError(`Unsupported assignment to ${node.name}`, assignmentExpression);
      }
      if (es.exportedName === "default" && exportedLocals.size === 1) {
        throw new TransformError(`Reassignment to default export is not supported`, assignmentExpression);
      }
      // FIXME: this won't work if we bind one local variable to multiple exports, but that's not a common pattern and we can address it later if needed
      code.appendRight(assignmentExpression.right.start, `__iife_exports.${es.exportedName} = `);
      exportReassigned = true;
    }
  }

  code.appendLeft(
    ast.body[0].start,
    `${getPrefix()}(function () {\n${strict ? "'use strict';\n" : ""}${exportReassigned ? "var __iife_exports = {};\n" : ""}`
  );
  code.appendRight(
    ast.body[ast.body.length - 1].end,
    `\n${getReturn()}})();`
  );

  return {
    code: code.toString(),
    map: sourcemap ? code.generateMap({hires: true}) : null
  };

  function analyzeImport(node, importBindings, code) {
    code.remove(node.start, node.end);
    for (const spec of node.specifiers) {
      importBindings.set(spec.local.name, [
        spec.imported ? spec.imported.name : "default",
        node.source.value
      ]);
    }
  }

  function analyzeExportDefault(node, state) {
    if (node.declaration.type === "Identifier") {
      // export default foo;
      exportStatements.push({
        ...state,
        node,
        localName: node.declaration.name,
        exportedName: "default",
        isExpression: true
      });
      code.remove(node.start, node.end);
    } else if (
      node.declaration.id && (
        node.declaration.type === "ClassDeclaration" ||
        node.declaration.type === "FunctionDeclaration"
      )
    ) {
      // export default function foo() {} or export default class Foo {}
      exportStatements.push({
        ...state,
        node,
        localName: node.declaration.id.name,
        exportedName: "default"
      });
      code.remove(node.start, node.declaration.start);
    } else {
      // export default (expression)
      exportStatements.push({
        ...state,
        node,
        localName: "_iife_default",
        exportedName: "default",
        isExpression: true
      });
      code.overwrite(node.start, node.declaration.start, "var _iife_default = ", {
        contentOnly: true
      });
    }
  }

  function analyzeExportNamed(node, state, visit) {
    if (!node.declaration) {
      // export { foo, bar as baz } from "source";
      for (const spec of node.specifiers) {
        exportStatements.push({
          node: node,
          localName: spec.local.name,
          exportedName: spec.exported.name,
          source: node.source ? node.source.value : null
        });
        visit(spec, {...state, exportDeclaration: node});
      }
      if (node.source) {
        visit(node.source);
      }
      code.remove(node.start, node.end);
    } else {
      if (node.declaration.type === "VariableDeclaration") {
        // export const foo = "123";
        for (const dec of node.declaration.declarations) {
          exportStatements.push({
            node: node,
            localName: dec.id.name,
            exportedName: dec.id.name
          });
          visit(dec.id, {...state, exportDeclaration: node});
          visit(dec.init);
        }
      } else {
        // export function foo() {} or export class Foo {}
        exportStatements.push({
          node: node,
          localName: node.declaration.id.name,
          exportedName: node.declaration.id.name
        });
        visit(node.declaration.id, {...state, exportDeclaration: node});
        visit(node.declaration.params);
        visit(node.declaration.body);
      }
      code.remove(node.start, node.declaration.start);
    }
  }

  function getReturn() {
    if (!exportedExports.size) {
      return "";
    }
    if (exportedExports.size === 1 && exportedExports.has("default")) {
      return `return ${exportedExports.get("default").localName};\n`;
    }
    if (exportReassigned) {
      return `${
        [...exportedExports.values()]
          .map(({exportedName, localName, source}) => `__iife_exports.${exportedName} = ${getName(localName, source)};`)
          .join("\n")
      }\nreturn __iife_exports;\n`;
    }
    return `return {\n${
      [...exportedExports.values()]
        .map(({exportedName, localName, source}) => `  ${exportedName}: ${getName(localName, source)}`)
        .join(",\n")
    }\n};\n`;

    function getName(name, source) {
      if (source) {
        return getBindingName([name, source]);
      }
      return name;
    }
  }

  function getPrefix() {
    return exportedExports.size ? `var ${name} = ` : "";
  }

  function getBindingName([prop, source]) {
    if (prop === "default") {
      return resolveGlobal(source);
    }
    return `${resolveGlobal(source)}.${prop}`;
  }

  function overwriteVar(node, parent, name) {
    if (node.name === name || node.isOverwritten) {
      return;
    }
    if (parent.type === "Property" && parent.key.start === parent.value.start) {
      code.appendLeft(node.end, `: ${name}`);
      parent.key.isOverwritten = true;
      parent.value.isOverwritten = true;
    } else {
      code.overwrite(node.start, node.end, name, {contentOnly: true});
      // with object shorthand, the node would be accessed twice (.key and .value)
      node.isOverwritten = true;
    }
  }

  function createResolveGlobal(resolveGlobal) {
    const cache = new Map;

    return name => {
      if (!cache.has(name)) {
        cache.set(name, resolveGlobal(name) || camelcase(name));
      }
      return cache.get(name);
    };
  }
}

module.exports = {transform};
