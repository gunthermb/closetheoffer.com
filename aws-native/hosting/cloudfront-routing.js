// Created by GuntherCloudSolutions
// Last updated: 2026-06-28
//
// CloudFront Function (viewer-request) — replaces vercel.json `cleanUrls` + `rewrites`.
// Pure ES5.1 (CloudFront Functions runtime). Keep it simple and synchronous.
//
//   /                       -> /index.html
//   /privacy /terms ...     -> /privacy.html ... (clean URLs)
//   /dashboard /login ...   -> mapped .html files
//   /freemode               -> /app-free.html
//   /<username>             -> /app.html   (single-segment catch-all)
//   anything with a "."     -> served as-is (real asset: .html, .js, .css, images, /vendor/*)

function handler(event) {
  var req = event.request;
  var uri = req.uri;

  if (uri === '/') { req.uri = '/index.html'; return req; }

  // strip a single trailing slash
  if (uri.length > 1 && uri.charAt(uri.length - 1) === '/') {
    uri = uri.substring(0, uri.length - 1);
  }

  // real asset (has a file extension in the last segment) -> pass through
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  if (last.indexOf('.') !== -1) { req.uri = uri; return req; }

  // explicit rewrites
  var map = {
    '/dashboard': '/dashboard.html',
    '/login': '/login.html',
    '/signup': '/login.html',
    '/freemode': '/app-free.html'
  };
  if (map[uri]) { req.uri = map[uri]; return req; }

  // clean-URL static pages -> append .html
  var pages = { '/about': 1, '/blog': 1, '/changelog': 1, '/privacy': 1, '/terms': 1, '/index': 1 };
  if (pages[uri]) { req.uri = uri + '.html'; return req; }

  // count non-empty path segments
  var segs = uri.split('/');
  var count = 0;
  for (var i = 0; i < segs.length; i++) { if (segs[i]) { count++; } }

  // single-segment catch-all -> the per-username app
  if (count === 1) { req.uri = '/app.html'; return req; }

  // fallback: try the .html version
  req.uri = uri + '.html';
  return req;
}
