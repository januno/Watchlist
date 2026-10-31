// Cloudflare Worker: lets the app search TMDB without putting your key in the app.
// Setup: add a secret named TMDB_KEY (your TMDB API key or read access token).
// Change ALLOWED_ORIGIN to the address of your site.
const ALLOWED_ORIGIN = 'https://januno.github.io';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Vary': 'Origin',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: { ...cors, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Accept' },
      });
    }
    if (request.method !== 'GET' || url.pathname !== '/search') {
      return new Response('Not found', { status: 404, headers: cors });
    }

    const query = (url.searchParams.get('query') || '').trim().slice(0, 100);
    if (query.length < 2) {
      return new Response('{"results":[]}', { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    const api = new URL('https://api.themoviedb.org/3/search/multi');
    api.searchParams.set('query', query);
    api.searchParams.set('include_adult', 'false');

    const headers = { Accept: 'application/json' };
    const key = String(env.TMDB_KEY || '').trim();
    if (key.startsWith('eyJ')) headers.Authorization = 'Bearer ' + key;   // read access token
    else api.searchParams.set('api_key', key);                            // v3 API key

    const upstream = await fetch(api.toString(), { headers, cf: { cacheTtl: 3600, cacheEverything: true } });
    return new Response(upstream.body, {
      status: upstream.status === 401 ? 502 : upstream.status,           // never pass a 401 to the app
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  },
};
