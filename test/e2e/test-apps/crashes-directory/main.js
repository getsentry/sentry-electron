const { app, crashReporter } = require('electron');

app.commandLine.appendSwitch('enable-crashpad');
const majorVersion = parseInt(process.versions.electron.split('.')[0]);
const crashDir = majorVersion >= 9 ? app.getPath('crashDumps') : crashReporter.getCrashesDirectory();
console.log(crashDir);
process.exit();
