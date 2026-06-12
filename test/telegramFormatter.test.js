const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTelegramReply } = require('../dist/adapters/telegramFormatter');

test('leaves short simple replies as plain text', () => {
  assert.deepEqual(formatTelegramReply('Да, парковка есть.'), {
    text: 'Да, парковка есть.',
  });
});

test('formats structured replies with safe Telegram HTML', () => {
  const formatted = formatTelegramReply([
    'Что важно:',
    '- заезд начинается с 15:00',
    '- ранний заезд зависит от готовности номера',
    '',
    'Подскажите дату заезда и номер бронирования <если есть>.',
  ].join('\n'));

  assert.equal(formatted.extra?.parse_mode, 'HTML');
  assert.match(formatted.text, /<b>Что важно<\/b>:/);
  assert.match(formatted.text, /• заезд начинается с 15:00/);
  assert.match(formatted.text, /&lt;если есть&gt;/);
});

test('keeps long but simple one-paragraph replies unformatted', () => {
  const text = 'Ранний заезд возможен, если номер уже свободен и подготовлен, но это зависит от загрузки отеля в день приезда.';

  assert.deepEqual(formatTelegramReply(text), { text });
});
