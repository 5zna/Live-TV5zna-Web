import http from 'http';

export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  var STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4527';

  var proxyReq = http.get(STREAM_URL, function(proxyRes) {
    if (proxyRes.statusCode !== 200) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Stream unavailable. Status code: ' + proxyRes.statusCode);
      return;
    }

    // Critical: 'X-Accel-Buffering': 'no' tells Vercel/Nginx proxy NOT to buffer
    // the response, enabling true chunk-by-chunk live streaming to the browser.
    res.writeHead(200, {
      'Content-Type': 'video/MP2T',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no' 
    });

    proxyRes.pipe(res);
  });

  proxyReq.on('error', function(err) {
    console.error('Proxy error:', err);
    try {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('Proxy error: ' + err.message);
    } catch (e) {}
  });

  // Close upstream connection if client disconnects
  req.on('close', function() {
    proxyReq.destroy();
  });
}
