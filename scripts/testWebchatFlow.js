const http = require('http');

async function sendChat(message, sessionId) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      message,
      sessionId
    });

    const options = {
      hostname: 'localhost',
      port: 3010,
      path: '/api/chat/web',
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
  console.log("=== WEBCHAT REST TEST ===");
  
  console.log("\\nСценарий 1: Спрашиваем про собаку (без sessionId)...");
  let res1 = await sendChat('Можно ли с собакой?');
  console.log(res1);
  const sessionId = res1.sessionId;
  console.log("Получен sessionId:", sessionId);

  console.log("\\nСценарий 2: Спрашиваем про Wi-Fi (с sessionId)...");
  let res2 = await sendChat('Какой пароль от Wi-Fi?', sessionId);
  console.log(res2);

  console.log("\\nСценарий 3: Делаем броневой запрос (тот же sessionId)...");
  let res3 = await sendChat('Хотим номер на двоих с видом на море с 15 по 18 июля', sessionId);
  console.log(res3);
}

run().catch(console.error);
