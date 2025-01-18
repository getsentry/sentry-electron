const { raiseSegfault } = require('sadness-generator')

console.log('Child process started', typeof process.crashReporter);

setTimeout(() => {
  raiseSegfault();
}, 1000);
