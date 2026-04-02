export let foo = "123";
setTimeout(function*(){
  foo = "456";
  foo.bar = "000";
  const {foo: bar = foo} = foo;
  console.log(foo, bar);
  if (bar) {
    let foo;
    foo = 1;
  }
}, 1000);
