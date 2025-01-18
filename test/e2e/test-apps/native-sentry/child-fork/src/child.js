const { raiseSegfault } = require('sadness-generator')

console.log('Child process started', typeof process.crashReporter);

if (process.crashReporter) {
  process.crashReporter.start({
    companyName: '',
    ignoreSystemCrashHandler: true,
    productName: 'app-name',
    submitURL: 'https://f.a.k/e',
    uploadToServer: false,
    compress: true,
  });
}

setTimeout(() => {
  raiseSegfault();
}, 1000);
