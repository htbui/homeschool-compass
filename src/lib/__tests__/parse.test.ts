import { describe, expect, it } from 'vitest';

import { parseCount, parseDate, parseMoney, parseTime } from '../parse';

describe('parseDate', () => {
  it.each([
    ['2017-05-21', '2017-05-21'],
    ['2017-5-21', '2017-05-21'],
    ['2017/05/21', '2017-05-21'],
    ['05/21/2017', '2017-05-21'],
    ['5/21/2017', '2017-05-21'],
    ['5-21-2017', '2017-05-21'],
    ['5.21.2017', '2017-05-21'],
    ['5/21/17', '2017-05-21'],
    ['May 21 2017', '2017-05-21'],
    ['May 21, 2017', '2017-05-21'],
    ['may 21st, 2017', '2017-05-21'],
    ['Sept 3 2016', '2016-09-03'],
    ['21 May 2017', '2017-05-21'],
    ['20170521', '2017-05-21'],
    ['  2/29/2020 ', '2020-02-29'],
  ])('%s → %s', (input, out) => expect(parseDate(input)).toBe(out));

  it.each(['', '2017', '13/01/2017', '2/30/2020', '2/29/2021', 'tomorrow', '5/21', 'Foo 21 2017', '1850-01-01'])('rejects %s', (input) =>
    expect(parseDate(input)).toBeUndefined(),
  );
});

describe('parseTime', () => {
  it.each([
    ['9', '09:00'],
    ['09:00', '09:00'],
    ['9:30', '09:30'],
    ['930', '09:30'],
    ['0930', '09:30'],
    ['13:30', '13:30'],
    ['1:30', '13:30'],
    ['1pm', '13:00'],
    ['1:15 PM', '13:15'],
    ['9:30am', '09:30'],
    ['12pm', '12:00'],
    ['12am', '00:00'],
    ['10', '10:00'],
    ['11:45 a.m.', '11:45'],
  ])('%s → %s', (input, out) => expect(parseTime(input)).toBe(out));

  it.each(['', '25:00', '9:75', '13pm', 'noonish', '9:3'])('rejects %s', (input) => expect(parseTime(input)).toBeUndefined());
});

describe('parseMoney / parseCount', () => {
  it('parses money', () => {
    expect(parseMoney('$1,250.50')).toBe(1250.5);
    expect(parseMoney('12.')).toBe(12);
    expect(parseMoney('0')).toBe(0);
    expect(parseMoney('abc')).toBeUndefined();
    expect(parseMoney('1.234')).toBeUndefined();
  });
  it('parses counts', () => {
    expect(parseCount('120')).toBe(120);
    expect(parseCount('1,000')).toBe(1000);
    expect(parseCount('0')).toBeUndefined();
    expect(parseCount('12.5')).toBeUndefined();
  });
});
