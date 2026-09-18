/* Akwam provider for Nuvio. Single-file build; no Node-only APIs. */
const BASE = 'https://akwams.org';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' };

function getText(url, extra) {
  return fetch(url, { headers: Object.assign({}, HEADERS, extra || {}) }).then(function (r) {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  });
}
function abs(u, base) {
  if (!u) return null;
  u = String(u).replace(/&amp;/g, '&').replace(/\\\//g, '/').trim();
  if (u.indexOf('//') === 0) return 'https:' + u;
  if (/^https?:\\/\\//i.test(u)) return u;
  try { return new URL(u, base).toString(); } catch (_) { return null; }
}
function htmlDecode(s) {
  return String(s || '').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function text(s) {
  return htmlDecode(String(s || '').replace(/<[^>]*>/g, ' ')).replace(/\\s+/g, ' ').trim();
}
function norm(s) {
  return text(s).toLowerCase().replace(/[إأآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim();
}
function score(a, b) {
  a = norm(a); b = norm(b); if (!a || !b) return 0; if (a === b) return 100;
  var aa = a.split(' ').filter(function(x){ return x.length > 1; });
  var hit = 0; aa.forEach(function(x){ if (b.indexOf(x) >= 0) hit++; });
  return Math.round(hit * 100 / Math.max(1, aa.length));
}
function cinemeta(tmdbId, mediaType) {
  var kind = mediaType === 'tv' ? 'series' : 'movie';
  return getText('https://v3-cinemeta.strem.io/meta/' + kind + '/tmdb:' + encodeURIComponent(tmdbId) + '.json')
    .then(function(t){ var x = JSON.parse(t); return x.meta || x; });
}
function searchAkwam(query, mediaType) {
  var q = encodeURIComponent(query);
  var urls = [
    BASE + '/search?q=' + q,
    BASE + '/search/' + q
  ];
  var i = 0;
  function next() {
    if (i >= urls.length) return Promise.resolve([]);
    var u = urls[i++];
    return getText(u).then(function(html){
      var out = [];
      var re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]{0,1200}?)<\\/a>/gi, m;
      while ((m = re.exec(html))) {
        var block = m[2];
        var href = abs(m[1], BASE);
        var title = text(block);
        if (!href || !title || href === BASE + '/' || href.indexOf('/search') >= 0) continue;
        if (mediaType === 'tv' && !/(مسلسل|series|tv|الحلقه|حلقة)/i.test(block)) continue;
        if (mediaType === 'movie' && /(مسلسل|الحلقه|حلقة)/i.test(block)) continue;
        if (title.length > 2 && title.length < 180) out.push({ title: title, url: href });
      }
      var seen = {}, unique = [];
      out.forEach(function(x){ if (!seen[x.url]) { seen[x.url] = 1; unique.push(x); } });
      return unique.length ? unique : next();
    }).catch(function(){ return next(); });
  }
  return next();
}
function extractLinks(html, pageUrl) {
  var out = [], seen = {};
  function add(u) {
    u = abs(u, pageUrl); if (!u || seen[u]) return; seen[u] = 1; out.push(u);
  }
  var m, patterns = [
    /<iframe[^>]+(?:src|data-src|data-url)=["']([^"']+)["']/gi,
    /<(?:video|source)[^>]+(?:src|data-src)=["']([^"']+)["']/gi,
    /(?:file|src|source|url|hls|mp4)\\s*[:=]\\s*["'](https?:\\/\\/[^"']+)["']/gi,
    /https?:\\/\\/[^\\s"'<>\\\\]+\\.(?:m3u8|mp4)(?:\\?[^\\s"'<>\\\\]*)?/gi
  ];
  patterns.forEach(function(re){ while ((m = re.exec(html))) add(m[1] || m[0]); });
  return out;
}
function findEpisode(html, season, episode, base) {
  var target = String(episode), m;
  var re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\\s\\S]{0,500}?)<\\/a>/gi;
  while ((m = re.exec(html))) {
    var t = text(m[2]);
    var ok = new RegExp('(الحلقه|حلقة|episode|ep\\.?|e)\\s*0?' + episode + '\\b', 'i').test(t) || new RegExp('s0?' + season + 'e0?' + episode + '\\b', 'i').test(t);
    if (ok) return abs(m[1], base);
  }
  // Some pages use episode URLs without visible episode text.
  var hrefRe = /href=["']([^"']+)["']/gi;
  while ((m = hrefRe.exec(html))) {
    if (new RegExp('(episode|ep|e|الحلقه|حلقة)[-_]?0?' + target + '\\b', 'i').test(m[1])) return abs(m[1], base);
  }
  return null;
}
function resolve(url, depth) {
  if (!url || depth > 3) return Promise.resolve([]);
  return getText(url, { Referer: url }).then(function(html){
    var links = extractLinks(html, url);
    var direct = links.filter(function(x){ return /\\.(?:m3u8|mp4)(?:$|\\?)/i.test(x); });
    if (direct.length) return direct;
    var frames = links.filter(function(x){ return !/\\.(?:m3u8|mp4)(?:$|\\?)/i.test(x); }).slice(0, 8);
    return Promise.all(frames.map(function(x){ return resolve(x, depth + 1).catch(function(){ return []; }); }))
      .then(function(all){ return [].concat.apply([], all); });
  }).catch(function(){ return []; });
}
function unique(arr) { var s = {}, out = []; arr.forEach(function(x){ if (x && !s[x]) { s[x] = 1; out.push(x); } }); return out; }
function makeStreams(urls) {
  return unique(urls).map(function(url, i){
    var q = /2160|4k/i.test(url) ? '4K' : /1080/i.test(url) ? '1080p' : /720/i.test(url) ? '720p' : 'Auto';
    return { name: 'Akwam', title: 'Akwam • Server ' + (i + 1), url: url, quality: q, headers: { 'User-Agent': UA, 'Referer': BASE + '/' } };
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return cinemeta(tmdbId, mediaType).then(function(meta){
    var wanted = meta.name || meta.original_name || meta.title || meta.original_title || '';
    if (!wanted) return [];
    return searchAkwam(wanted, mediaType).then(function(results){
      results.sort(function(a,b){ return score(wanted, b.title) - score(wanted, a.title); });
      var candidates = results.slice(0, 5);
      if (mediaType === 'tv') {
        return Promise.all(candidates.map(function(item){
          return getText(item.url, { Referer: BASE + '/' }).then(function(html){ return findEpisode(html, season, episode, item.url); }).catch(function(){ return null; });
        })).then(function(epPages){
          return Promise.all(epPages.filter(Boolean).map(function(u){ return resolve(u, 0); }));
        }).then(function(all){ return makeStreams([].concat.apply([], all)); });
      }
      return Promise.all(candidates.map(function(item){ return resolve(item.url, 0); }))
        .then(function(all){ return makeStreams([].concat.apply([], all)); });
    });
  }).catch(function(e){ console.log('[Akwam] ' + e.message); return []; });
}
module.exports = { getStreams: getStreams };
