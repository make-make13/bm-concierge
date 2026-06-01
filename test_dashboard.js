const http = require('http');
const TOKEN = '0087BF70ac2f';

function getData(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:3010/api/console${path}?token=${TOKEN}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { resolve(data); }
      });
    }).on('error', reject);
  });
}

(async () => {
  try {
    const status = await getData('/status');
    console.log('Status:', status);
    
    const convs = await getData('/conversations');
    console.log(`Convs count: ${convs.length}`);
    if (convs.length > 0) {
      console.log('Last conv guest:', convs[convs.length-1].guest_name);
    }
  } catch (err) {
    console.error(err);
  }
})();
