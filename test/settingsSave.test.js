const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('keeps saved secret when settings update sends an empty password field', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-settings-'));
  const settingsPath = path.join(dir, 'settings.json');
  fs.writeFileSync(settingsPath, JSON.stringify({
    TELEGRAM_BOT_TOKEN: 'new-runtime-token',
    TELEGRAM_ADMIN_IDS: '672706052',
  }, null, 2));

  process.env.SETTINGS_PATH = settingsPath;
  process.env.TELEGRAM_BOT_TOKEN = 'old-env-token';
  const modulePath = require.resolve('../dist/config');
  delete require.cache[modulePath];
  const { saveSettings, config } = require('../dist/config');

  saveSettings({
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_ADMIN_IDS: '672706052\n8577020314',
  });

  const saved = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.equal(saved.TELEGRAM_BOT_TOKEN, 'new-runtime-token');
  assert.equal(saved.TELEGRAM_ADMIN_IDS, '672706052\n8577020314');
  assert.equal(config.telegram.botToken, 'new-runtime-token');
  assert.equal(config.telegram.adminIds, '672706052\n8577020314');
});
