export let foo = "123";
setTimeout(function*(){
  foo = "456";
  // foo += "789";
  foo.bar = "000";
  // [foo] = ["789"];
  const {foo: bar = foo} = foo;
  // yield bar = ({foo} = {foo: "000"});
  // baz = () => ({foo} = {foo: "000"});
  // for (foo of ["111", "222"]) {
  //   console.log(foo);
  // }
  // for (foo = 0; foo < 2; foo++) {
  //   console.log(foo);
  // }
  // if (kap({foo} = bar)) {
  //   console.log(foo);
  // }
  console.log(foo);
}, 1000);
