const { join } = require('path');

if (process.env.E2E_TEST_FIXTURE) {
  setTimeout(() => {
    require(join(__dirname, 'fixtures', process.env.E2E_TEST_FIXTURE));
  }, 100);
}
