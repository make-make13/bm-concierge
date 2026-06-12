const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatEscalationNotification,
  formatTelegramSendError,
  shouldNotifyEscalation,
} = require('../dist/integrations/telegramAdminNotifier');

test('formats escalation notification for admin with readable reason and console link', () => {
  const text = formatEscalationNotification({
    conversationId: 'telegram:12345',
    channel: 'telegram',
    guestName: 'Иван <script>',
    guestContact: '@ivan&co',
    message: 'Можно ранний заезд в 12:00 <если номер готов>?',
    reason: 'admin_decision',
    consoleUrl: 'https://ai.4-am.ru/console',
  });

  assert.match(text, /<b>Нужен администратор<\/b>/);
  assert.match(text, /Гость: <b>Иван &lt;script&gt;<\/b>/);
  assert.match(text, /Канал: Telegram/);
  assert.match(text, /Причина: вопрос требует решения администратора/);
  assert.match(text, /Контакт: @ivan&amp;co/);
  assert.match(text, /Можно ранний заезд в 12:00 &lt;если номер готов&gt;\?/);
  assert.match(text, /<b>Открыть Console:<\/b>\nhttps:\/\/ai\.4-am\.ru\/console/);
});

test('does not notify again while conversation already needs attention', () => {
  assert.equal(shouldNotifyEscalation({ needs_attention: 1, escalation_reason: 'admin_decision' }), false);
  assert.equal(shouldNotifyEscalation({ needs_attention: true, escalation_reason: 'complaint' }), false);
});

test('notifies when conversation has not been escalated yet', () => {
  assert.equal(shouldNotifyEscalation({ needs_attention: 0, escalation_reason: null }), true);
  assert.equal(shouldNotifyEscalation(null), true);
});


test('explains Telegram 403 for new admin ids', () => {
  const error = formatTelegramSendError('8577020314', 403, "Forbidden: bot can't initiate conversation with a user");

  assert.match(error, /8577020314: HTTP 403/);
  assert.match(error, /нажать \/start/);
});

test('explains Telegram chat not found for new admin ids', () => {
  const error = formatTelegramSendError('8577020314', 400, 'Bad Request: chat not found');

  assert.match(error, /8577020314: HTTP 400/);
  assert.match(error, /нажать \/start/);
  assert.match(error, /проверьте Telegram ID/);
});
