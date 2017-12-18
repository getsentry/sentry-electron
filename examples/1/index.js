const { Main } = require('electron-boilerplate')
const { ElectronSentry } = require('../../dist/index')

ElectronSentry.start();

const main = new Main()
  .standardConfiguration()
  .run()

