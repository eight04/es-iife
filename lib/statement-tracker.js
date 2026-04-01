
function createStatementTracker() {
  const statements = new Map();

  return {enter, leave, getCurrentStatement};

  function enter(node) {
    if (isStatement(node)) {
      statements.set(node, node);
    }
  }
}

module.exports = {createStatementTracker};
