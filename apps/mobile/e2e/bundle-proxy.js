/**
 * Simple HTTP proxy that strips multipart/chunked encoding from Metro responses.
 *
 * BUG-7 workaround: Metro on Windows sends chunked transfer encoding that causes
 * OkHttp's MultipartStreamReader to fail with:
 *   ProtocolException: Expected leading [0-9a-fA-F] character but was 0xd
 *
 * This proxy fetches the bundle as a plain response and re-serves it to the
 * dev-client without multipart or chunked encoding.
 *
 * Usage:
 *   node e2e/bundle-proxy.js
 *   # Then configure dev-client to connect to port 8082 instead of 8081
 */
const http = require('http');

const METRO_PORT = 8081;
const PROXY_PORT = 8082;

const server = http.createServer((req, res) => {
  // Strip Accept: multipart/mixed header — force Metro to send plain response
  const headers = { ...req.headers };
  delete headers['accept'];
  headers['accept'] = '*/*';
  // Remove host header to avoid issues
  delete headers['host'];

  const proxyReq = http.request(
    {
      hostname: 'localhost',
      port: METRO_PORT,
      path: req.url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      // Remove chunked transfer encoding — send with content-length instead
      const chunks = [];
      proxyRes.on('data', (chunk) => chunks.push(chunk));
      proxyRes.on('end', () => {
        const body = Buffer.concat(chunks);

        // Copy response headers but override content-type and remove transfer-encoding
        const responseHeaders = { ...proxyRes.headers };
        delete responseHeaders['transfer-encoding'];
        responseHeaders['content-length'] = body.length;

        // If Metro sent multipart, strip it — just send the bundle directly
        if (responseHeaders['content-type']?.includes('multipart/mixed')) {
          responseHeaders['content-type'] = 'application/javascript';

          // Extract the actual bundle from the multipart response
          const bodyStr = body.toString('utf-8');
          const boundaryMatch =
            proxyRes.headers['content-type']?.match(/boundary="([^"]+)"/);
          if (boundaryMatch) {
            const boundary = boundaryMatch[1];
            const parts = bodyStr.split('--' + boundary);
            // The last real part (before --boundary--) contains the JS bundle
            for (let i = parts.length - 1; i >= 0; i--) {
              const part = parts[i];
              if (part.includes('application/javascript')) {
                // Extract body after double newline
                const bodyStart = part.indexOf('\r\n\r\n');
                if (bodyStart !== -1) {
                  const jsBody = part.substring(bodyStart + 4);
                  const jsBuffer = Buffer.from(jsBody, 'utf-8');
                  responseHeaders['content-length'] = jsBuffer.length;
                  res.writeHead(proxyRes.statusCode, responseHeaders);
                  res.end(jsBuffer);
                  return;
                }
              }
            }
          }
        }

        res.writeHead(proxyRes.statusCode, responseHeaders);
        res.end(body);
      });
    }
  );

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502);
    res.end('Proxy error: ' + err.message);
  });

  req.pipe(proxyReq);
});

server.listen(PROXY_PORT, () => {
  console.log(
    `Bundle proxy listening on port ${PROXY_PORT}, forwarding to Metro on port ${METRO_PORT}`
  );
  console.log(
    'Configure dev-client to connect to: http://10.0.2.2:' + PROXY_PORT
  );
});
