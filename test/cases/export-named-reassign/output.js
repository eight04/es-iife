var exported = (function () {
var _iife_exports = {};
let foo = _iife_exports.foo = "123";
setTimeout(() => {
  foo = _iife_exports.foo = "456";
  console.log(foo);
}, 1000);
return _iife_exports;
})();
