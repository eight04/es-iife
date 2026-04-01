const camelcase = require("camelcase");
const MagicString = require("magic-string");
const isReference = require("is-reference");
const {attachScopes} = require("@rollup/pluginutils");
const {walk} = require("zimmerframe");

const {createAssignmentTracker} = require("./lib/assignment-tracker");

function makeObj(types, fn) {
  return types.reduce((obj, type) => {
    obj[type] = fn;
    return obj;
  }, {});
}

function analyzeImport(node, importBindings, code) {
  code.remove(node.start, node.end);
  for (const spec of node.specifiers) {
    importBindings.set(spec.local.name, [
      spec.imported ? spec.imported.name : "default",
      node.source.value
    ]);
  }
}

function analyzeExportDefault(node, exportBindings, code) {
  if (node.declaration.type === "Identifier") {
    // export default foo;
    exportBindings.set("default", node.declaration.name);
    code.remove(node.start, node.end);
  } else if (
    node.declaration.id && (
      node.declaration.type === "ClassDeclaration" ||
      node.declaration.type === "FunctionDeclaration"
    )
  ) {
    // export default function foo() {} or export default class Foo {}
    exportBindings.set("default", node.declaration.id.name);
    code.remove(node.start, node.declaration.start);
  } else {
    // export default (expression)
    exportBindings.set("default", "_iife_default");
    code.overwrite(node.start, node.declaration.start, "var _iife_default = ", {
      contentOnly: true
    });
  }
}

function analyzeExportNamed(node, exportBindings, code) {
  if (!node.declaration) {
    // export { foo, bar as baz } from "source";
    for (const spec of node.specifiers) {
      exportBindings.set(
        spec.exported.name, node.source ?
        [spec.local.name, node.source.value] : spec.local.name
      );
    }
    code.remove(node.start, node.end);
  } else {
    // export const foo = "123"; or export function foo() {}
    if (node.declaration.type === "VariableDeclaration") {
      for (const dec of node.declaration.declarations) {
        exportBindings.set(dec.id.name, dec.id.name);
      }
    } else {
      exportBindings.set(node.declaration.id.name, node.declaration.id.name);
    }
    code.remove(node.start, node.declaration.start);
  }
}

function transform({
  code,
  parse,
  ast = parse(code),
  sourcemap = false,
  strict = false,
  resolveGlobal = () => {},
  name
}) {
  code = new MagicString(code);
  resolveGlobal = createResolveGlobal(resolveGlobal);

  const importBindings = new Map; // name -> [property, source]
  const exportBindings = new Map; // exported name -> local name or [property, source]
  let scope = attachScopes(ast, "scope");
  const assignmentTracker = createAssignmentTracker();
  const references = []; // MemberExpression | Identifier

  walk(ast, {scope: null}, {
    _(node, {state, next, path}) {
      if (node.scope) {
        state = {...state, scope: node.scope};
      }
      if (isReference(node, path.at(-1))) {
        references.push({...state, node, parent: path.at(-1)});
      }
      next(state);
    },
    ImportDeclaration(node) {
      analyzeImport(node, importBindings, code);
    },
    ExportDefaultDeclaration(node, {next}) {
      analyzeExportDefault(node, exportBindings, code);
      next();
    },
    ExportNamedDeclaration(node, {next}) {
      analyzeExportNamed(node, exportBindings, code);
      next();
    },
    VariableDeclarator(node, {state, visit, next}) {
      if (node.init) {
        visit(node.id, {
          ...state,
          assignmentExpression: node,
          isSimpleAssignment: true
        });
        visit(node.init);
      } else {
        next();
      }
    },
    AssignmentExpression(node, {state, path, visit}) {
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

  const globals = new Set;

  for (const [, source] of importBindings.values()) {
    globals.add(resolveGlobal(source));
  }
  let exportReassigned = false;
  
  for (const {node, scope, parent, isSimpleAssignment, assignmentExpression} of references) {
    const id = getLeftMostIdentifier(node);
    if (importBindings.has(id.name) && !scope.contains(id.name)) {
      overwriteVar(id, parent, getBindingName(importBindings.get(id.name)));
    } else if (globals.has(id.name) && scope.contains(id.name)) {
      overwriteVar(id, parent, `_local_${id.name}`);
    }
    if (assignmentExpression && exportBindings.hasLocal(id.name) && !isLocalVariable(id.name, scope)) {
      if (!isSimpleAssignment) {
        throw new TransformError(`Unsupported assignment to ${id.name} at ${assignmentExpression.start}:${assignmentExpression.end}`, assignmentExpression);
      }
      if (node.type === "MemberExpression") {
        // nothring to do, the export will be updated in place
        continue;
      }
      if (exportBindings.localToExport(id.name) === "default" && exportBindings.size === 1) {
        throw new TransformError(`Reassignment to default export is not supported at ${assignmentExpression.start}:${assignmentExpression.end}`, assignmentExpression);
      }
      // FIXME: this won't work if we bind one local variable to multiple exports, but that's not a common pattern and we can address it later if needed
      code.appendRight(assignmentExpression.right.start, `__iife_exports.${exportBindings.localToExport(id.name)} = `);
      exportReassigned = true;
    }
  }

  const shouldReturnUpdatedValue = reassignedExports.length > 0;
  rewriteExportedBindings(exportBindings, code, resolveGlobal);
  if (shouldReturnUpdatedValue) {
    rewriteReassignedExportedBindings(nodes);
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

  function getReturn() {
    if (!exportBindings.size) {
      return "";
    }
    if (exportBindings.size === 1 && exportBindings.has("default")) {
      return `return ${exportBindings.get("default")};\n`;
    }
    if (exportReassigned) {
      return `${
        [...exportBindings.entries()]
          .map(([left, right]) => `__iife_exports.${left} = ${getName(right)};`)
          .join("\n")
      }\nreturn __iife_exports;\n`;
    }
    return `return {\n${
      [...exportBindings.entries()]
        .map(([left, right]) => `  ${left}: ${getName(right)}`)
        .join(",\n")
    }\n};\n`;

    function getName(name) {
      if (Array.isArray(name)) {
        return getBindingName(name);
      }
      return name;
    }
  }

  function getPrefix() {
    return exportBindings.size ? `var ${name} = ` : "";
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
