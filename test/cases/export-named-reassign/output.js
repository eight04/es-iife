var exported = (function () {
var _iife_exports = {};
_iife_exports.foo = "123";
setTimeout(() => {
  _iife_exports.foo = "456";
}, 1000);
return _iife_exports;
})();
