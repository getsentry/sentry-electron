const { app } = require('electron');

app.setPath('userData', process.env['E2E_USERDATA_DIRECTORY']);
