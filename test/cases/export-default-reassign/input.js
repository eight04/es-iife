export default class App {}
setTimeout(function(){
  App = wrap(App);
}, 1000);
