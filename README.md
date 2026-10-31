# Watchlist Manager (mobile web app)

Keeps a list of movies, series, dramas and anime. No login, no server, no database.
Everything is saved inside the browser on each person's own device.

## Auto-fill by name (TMDB)
Open app.js and set ONE of these near the top:
- TMDB_PROXY: address of your Cloudflare Worker (see proxy/worker.js). Your key stays private.
- TMDB_BUILTIN_KEY: your own TMDB key. Simplest, but visible to anyone who views the page source.
If both are empty, each person can paste their own free TMDB key in Settings.
Only the text someone searches for is sent on; their list never leaves their phone.

TMDB attribution: the notice is in Settings > About. TMDB also asks for its approved logo there:
download one from themoviedb.org/about/logos-attribution and save it as icons/tmdb.svg.

## Publishing on GitHub Pages
Upload these files (not a folder around them), then Settings > Pages > Deploy from a branch > main > /(root).
After editing any file, change the version number in sw.js (CACHE) so phones pick up the update.
The proxy folder is not needed on GitHub; it is only for Cloudflare.
