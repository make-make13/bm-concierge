const data = {
  message: "Хотим номер на двоих с видом на море с 15 по 18 июля"
};

fetch('http://localhost:3010/api/console/conversations', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ channel: 'test', guest_name: 'Тест', guest_contact: '@test' })
}).then(r => r.json()).then(conv => {
  console.log('Conv:', conv);
  return fetch(`http://localhost:3010/api/console/conversations/${conv.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}).then(r => r.json()).then(res => {
  console.log('Msg2:', res);
});
