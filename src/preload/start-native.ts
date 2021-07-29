import { crashReporter } from 'electron';

// We will manually submit errors, but CrashReporter requires a submitURL in
// some versions. Also, provide a productName and companyName, which we will
// add manually to the event's context during submission.
crashReporter.start({
  companyName: '',
  ignoreSystemCrashHandler: true,
  productName: '{{appName}}',
  submitURL: '',
  uploadToServer: false,
});
