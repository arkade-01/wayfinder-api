const http = require('http');

const req = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/scan',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('POST /scan status:', res.statusCode);
    console.log('Response:', data);
  });
});

req.on('error', e => console.error('Error:', e));
req.write(JSON.stringify({ address: '0x889D9950B046FAA99D5040F4FAe27e66dbC3de02', mode: 'quick' }));
req.end();

const req2 = http.request({
  hostname: 'localhost',
  port: 3000,
  path: '/scan/quick',
  method: 'GET'
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('GET /scan/quick status:', res.statusCode);
    console.log('Response:', data);
  });
});
req2.end();
