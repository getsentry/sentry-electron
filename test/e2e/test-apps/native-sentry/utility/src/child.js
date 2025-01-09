const { raiseSegfault } = require('sadness-generator')

setTimeout(() => {
  raiseSegfault();
}, 1000);
