const { app } = require('electron');

app.setName(process.env['E2E_APP_NAME']);
app.setPath('userData', process.env['E2E_USERDATA_DIRECTORY']);
