const http = require('http');
const url = require('url');

function proxyStream(streamUrl, clientRes, clientReq, depth) {
  if (depth > 5) {
    clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
    clientRes.end('Too many redirects');
    return;
  }

  var parsedUrl = url.parse(streamUrl);
  var options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || 80,
    path: parsedUrl.path,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': '*/*',
      'Connection': 'keep-alive'
    }
  };

  var proxyReq = http.get(options, function(proxyRes) {
    var statusCode = proxyRes.statusCode;

    // Handle redirects (301, 302, 303, 307, 308)
    if (statusCode === 301 || statusCode === 302 || statusCode === 303 || statusCode === 307 || statusCode === 308) {
      var redirectUrl = proxyRes.headers.location;
      if (redirectUrl) {
        console.log('Redirecting to: ' + redirectUrl);
        proxyReq.destroy(); // Clean up current socket
        // Resolve relative redirects if any
        if (!redirectUrl.startsWith('http://') && !redirectUrl.startsWith('https://')) {
          var protocol = parsedUrl.protocol || 'http:';
          var host = parsedUrl.host;
          if (redirectUrl.startsWith('/')) {
            redirectUrl = protocol + '//' + host + redirectUrl;
          } else {
            var pathname = parsedUrl.pathname || '';
            var pathDir = pathname.substring(0, pathname.lastIndexOf('/') + 1);
            redirectUrl = protocol + '//' + host + pathDir + redirectUrl;
          }
        }
        proxyStream(redirectUrl, clientRes, clientReq, depth + 1);
        return;
      }
    }

    if (statusCode !== 200) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('Stream unavailable. Status code: ' + statusCode);
      return;
    }

    clientRes.writeHead(200, {
      'Content-Type': 'video/MP2T',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    proxyRes.pipe(clientRes);

    clientReq.on('close', function() {
      proxyReq.destroy();
    });
  });

  proxyReq.on('error', function(err) {
    console.error('Proxy error:', err);
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('Proxy error: ' + err.message);
    }
  });
}

module.exports = function(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method not allowed');
    return;
  }

  var INITIAL_STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4527';
  proxyStream(INITIAL_STREAM_URL, res, req, 0);
};
