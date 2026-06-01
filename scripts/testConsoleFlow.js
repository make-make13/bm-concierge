const http = require('http');

async function sendChat(message) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      message,
      channel: 'console',
      guestName: 'Console Tester',
      guestContact: 'console@test.local'
    });

    const options = {
      hostname: 'localhost',
      port: 3010,
      path: '/api/chat/test',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { resolve(body); }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log("1. Спрашиваем про собаку...");
  let res1 = await sendChat('Можно ли с собакой?');
  console.log(res1);

  console.log("\\n2. Спрашиваем про Wi-Fi...");
  let res2 = await sendChat('Какой пароль от Wi-Fi?');
  console.log(res2);

  console.log("\\n3. Делаем броневой запрос...");
  let res3 = await sendChat('Хотим номер на двоих с видом на море с 15 по 18 июля');
  console.log(res3);
}

run().catch(console.error);
