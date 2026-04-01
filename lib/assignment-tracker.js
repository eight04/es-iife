function createAssignmentTracker(statementTracker) {
  const nodes = [];
  const maybeAssignmentTarget = new Map; // node -> assignment expression node

  return {
    enter,
    leave,
    getRootVariableReassigns() {
      return nodes.filter(n => n.defineScope && !n.defineScope.parent);
    }
  };

  function enter(node, parent, scope) {
    if (node.type === "AssignmentExpression") {
      maybeAssignmentTarget.set(node.left, node);
    } else {
      let assignmentExpression = maybeAssignmentTarget.get(node);
      if (!assignmentExpression) return;
      if (node.type === "Identifier") {
        nodes.push({
          node: node,
          currentScope: scope,
          defineScope: getDefineScope(node.name, scope),
          assignmentExpression: assignmentExpression,
          statement: statementTracker.getCurrentStatement()
        });
      } else if (node.type === "MemberExpression") {
        nodes.push({
          node: node,
          currentScope: scope,
          defineScope: getDefineScope(getRootObject(node), scope),
          assignmentExpression: assignmentExpression,
          statement: statementTracker.getCurrentStatement()
        });
      } else if (node.type === "ObjectPattern") {
        for (const prop of node.properties) {
          if (prop.type === "Property") {
            maybeAssignmentTarget.set(prop.value, assignmentExpression);
          } else if (prop.type === "RestElement") {
            maybeAssignmentTarget.set(prop.argument, assignmentExpression);
          }
        }
      } else if (node.type === "ArrayPattern") {
        for (const element of node.elements) {
          if (element) {
            maybeAssignmentTarget.set(element, assignmentExpression);
          }
        }
      } else if (node.type === "AssignmentPattern") {
        maybeAssignmentTarget.set(node.left, assignmentExpression);
      }
    }
  }
  
  function leave(node) {
    // pass
  }
}

module.exports = {createAssignmentTracker};
