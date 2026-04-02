var exported = (function () {
var __iife_exports = {};
let foo = "123";
setTimeout(function*(){
  foo = __iife_exports.foo = "456";
  foo.bar = "000";
  const {foo: bar = foo} = foo;
  console.log(foo, bar);
  if (bar) {
    let foo;
    foo = 1;
  }
}, 1000);
__iife_exports.foo = foo;
return __iife_exports;
})();
