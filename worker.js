const STREAM_URL = 'http://ugeen.live:8080/Ugeen_VIPtHEG0y/1hLFbj/4526';

export default {
  async fetch(req) {
    if (req.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    const url = new URL(req.url);
    if (url.pathname !== '/proxy') {
      return new Response('Not found', { status: 404 });
    }

    try {
      const resp = await fetch(STREAM_URL, { redirect: 'follow' });
      if (!resp.ok && resp.status !== 200) {
        return new Response('Stream unavailable', { status: 502 });
      }
      return new Response(resp.body, {
        headers: {
          'Content-Type': 'video/MP2T',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache',
        },
      });
    } catch {
      return new Response('Proxy error', { status: 502 });
    }
  },
};
