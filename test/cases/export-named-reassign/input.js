export let foo = "123";
setTimeout(() => {
  foo = "456";
  console.log(foo);
}, 1000);
