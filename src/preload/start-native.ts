import { crashReporter } from 'electron';

crashReporter.start({
  companyName: '',
  ignoreSystemCrashHandler: true,
  productName: '{{appName}}',
  submitURL: '',
  uploadToServer: false,
});
