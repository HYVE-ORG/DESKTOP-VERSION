import assert from 'node:assert/strict';
import test from 'node:test';
import {getLaunchCountdown, launchAt} from '../apps/web/src/landing/launch-date';

test('countdown uses the Brasilia launch instant and separates time units', () => {
  const target = Date.parse(launchAt);
  assert.equal(target, Date.parse('2027-01-25T03:00:00Z'));
  assert.deepEqual(getLaunchCountdown(target - 90061000), {days:1, hours:1, minutes:1, seconds:1, reached:false});
  assert.equal(getLaunchCountdown(target - 1).seconds, 1);
});

test('countdown reaches zero and never becomes negative after launch', () => {
  for (const now of [Date.parse(launchAt), Date.parse(launchAt) + 86400000]) {
    assert.deepEqual(getLaunchCountdown(now), {days:0, hours:0, minutes:0, seconds:0, reached:true});
  }
});
