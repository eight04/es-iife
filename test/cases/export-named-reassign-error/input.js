export let foo = "123";
setTimeout(function*(){
  foo += "789";
  [foo] = ["789"];
  foo++;
  const {foo: bar = foo} = foo;
  console.log(bar);
  yield bar = ({foo} = {foo: "000"});
  baz = () => ({foo} = {foo: "000"});
  for (foo of ["111", "222"]);
}, 1000);
