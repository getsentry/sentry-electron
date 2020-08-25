import { expect, use } from 'chai';
import chaiDateTime = require('chai-datetime');

import { NetTransport } from '../../src/main/transports/net';

use(chaiDateTime);

describe('net Transport', () => {
  describe('Rate Limiting', () => {
    it('Should prefer `x-sentry-rate-limits` header', () => {
      const checkTime = new Date(Date.now() + 73 * 1000);
      const transport = new NetTransport({ dsn: 'http://abv@sentry.io/1' }) as any;
      transport._handleRateLimit({
        'retry-after': '73',
        'x-sentry-rate-limits': '73:default;error;transaction;security:key',
      });
      expect(transport._rateLimits.all).to.be.undefined;
      expect(transport._rateLimits.default).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport._rateLimits.error).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport._rateLimits.transaction).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport._rateLimits.security).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport.isRateLimited('security')).to.be.true;
      expect(transport.isRateLimited('default')).to.be.true;
    });

    it('Should fallback to `retry-after` header', () => {
      const checkTime = new Date(Date.now() + 73 * 1000);
      const transport = new NetTransport({ dsn: 'http://abv@sentry.io/1' }) as any;
      transport._handleRateLimit({
        'retry-after': '73',
      });
      expect(transport._rateLimits.all).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport.isRateLimited('all')).to.be.true;
    });

    it('Should handle two categories', () => {
      const checkTime = new Date(Date.now() + 50 * 1000);
      const checkTime2 = new Date(Date.now() + 2700 * 1000);
      const transport = new NetTransport({ dsn: 'http://abv@sentry.io/1' }) as any;
      transport._handleRateLimit({
        'x-sentry-rate-limits': '50:transaction:key, 2700:error;default;attachment:organization',
      });
      expect(transport._rateLimits.transaction).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport._rateLimits.error).to.closeToTime(checkTime2, 1); // 1sec delta
      expect(transport._rateLimits.default).to.closeToTime(checkTime2, 1); // 1sec delta
      expect(transport._rateLimits.attachment).to.closeToTime(checkTime2, 1); // 1sec delta
      expect(transport.isRateLimited('attachment')).to.be.true;
    });

    it('Should keep maximum rate limit', () => {
      const checkTime = new Date(Date.now() + 50 * 1000);
      const transport = new NetTransport({ dsn: 'http://abv@sentry.io/1' }) as any;
      transport._handleRateLimit({
        'x-sentry-rate-limits': '3:transaction:key,50:transaction:key,5:transaction:key',
      });
      expect(transport._rateLimits.transaction).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport.isRateLimited('event')).to.be.false;
      expect(transport.isRateLimited('transaction')).to.be.true;
    });

    it('Should set all', () => {
      const checkTime = new Date(Date.now() + 1000 * 1000);
      const transport = new NetTransport({ dsn: 'http://abv@sentry.io/1' }) as any;
      transport._handleRateLimit({
        'x-sentry-rate-limits': '1000::organization ',
      });
      expect(transport._rateLimits.all).to.closeToTime(checkTime, 1); // 1sec delta
      expect(transport.isRateLimited('event')).to.be.true;
      expect(transport.isRateLimited('bla')).to.be.true;
    });
  });
});
