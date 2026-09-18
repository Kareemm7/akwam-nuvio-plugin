# Akwam Nuvio Provider

Nuvio provider for `https://akwams.org`.

## Install

1. Upload `manifest.json` and `providers/akwam.js` to a **public GitHub repository**, preserving the paths.
2. In Nuvio: **Settings → Plugins → Add repository**.
3. Use the raw URL of `manifest.json`, for example:

`https://raw.githubusercontent.com/YOURNAME/akwam-nuvio-plugin/main/manifest.json`

4. Refresh and enable **Akwam**.

## What it supports

- TMDB ID based movie/TV lookup through Cinemeta
- Akwam title matching
- TV season/episode selection
- iframe/video/source URL discovery
- m3u8/mp4 stream objects with Akwam Referer/User-Agent headers

## Notes

The provider runs inside Nuvio/Hermes and uses browser-like `fetch`; it does not use Node `fs`, `path`, or other native modules. The provider follows the Nuvio provider API (`getStreams(tmdbId, mediaType, season, episode)`).

If Akwam changes its HTML or player/iframe implementation, the extractor may need an update.
