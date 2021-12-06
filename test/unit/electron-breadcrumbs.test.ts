import { expect, should, use } from 'chai';
import chaiAsPromised = require('chai-as-promised');
import { normalizeOptions } from '../../src/main/integrations/electron-breadcrumbs';

should();
use(chaiAsPromised);

describe('Electron Breadcrumbs', () => {
  it('Normalize Options', () => {
    const options = normalizeOptions({
      app: false,
      powerMonitor: true,
      screen: ['something'],
      autoUpdater: (_) => false,
    });

    // False should remain to ensure no default
    expect(options.app).to.be.false;

    // True should become undefined so it's overridden by defaults
    expect(options.powerMonitor).to.be.undefined;

    // String array should become function that check if includes
    expect(typeof options.screen).to.equal('function');
    expect(options.screen ? options.screen?.('anything') : true).to.equal(false);
    expect(options.screen ? options.screen?.('something') : false).to.equal(true);

    // Functions should remain
    expect(typeof options.autoUpdater).to.equal('function');
  });
});
