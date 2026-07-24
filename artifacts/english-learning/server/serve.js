/**
 * Standalone production server for Expo static builds.
 *
 * Serves the output of build.js (static-build/) with two special routes:
 * - GET / or /manifest with expo-platform header → platform manifest JSON
 * - GET / without expo-platform → web build (SPA)
 * Everything else falls through to static file serving from ./static-build/.
 *
 * Zero external dependencies — uses only Node.js built-ins (http, fs, path).
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const STATIC_ROOT = path.resolve(__dirname, "..", "static-build");
const WEB_ROOT = path.join(STATIC_ROOT, "web");
const TEMPLATE_PATH = path.resolve(__dirname, "templates", "landing-page.html");
const basePath = (process.env.BASE_PATH || "/").replace(/\/+$/, "");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".map": "application/json",
};

function getAppName() {
  try {
    const appJsonPath = path.resolve(__dirname, "..", "app.json");
    const appJson = JSON.parse(fs.readFileSync(appJsonPath, "utf-8"));
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

function serveManifest(platform, res) {
  const manifestPath = path.join(STATIC_ROOT, platform, "manifest.json");

  if (!fs.existsSync(manifestPath)) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(
      JSON.stringify({ error: `Manifest not found for platform: ${platform}` }),
    );
    return;
  }

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.writeHead(200, {
    "content-type": "application/json",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  res.end(manifest);
}

// Hashed build assets are immutable; HTML must never be cached so that a new
// deploy's index.html (with new bundle hashes) is always picked up by browsers.
function cacheHeaderFor(ext, filePath) {
  if (ext === ".html") return "no-cache, no-store, must-revalidate";
  if (/-[0-9a-f]{16,}\./.test(path.basename(filePath)) || filePath.includes("_expo/static")) {
    return "public, max-age=31536000, immutable";
  }
  return "public, max-age=300";
}

const COMPRESSIBLE = new Set([".js", ".css", ".html", ".json", ".svg", ".txt"]);

function sendFile(req, res, filePath, extraHeaders) {
  const ext = path.extname(filePath).toLowerCase();
  const content = fs.readFileSync(filePath);
  const headers = {
    "content-type": MIME_TYPES[ext] || "application/octet-stream",
    "cache-control": cacheHeaderFor(ext, filePath),
    ...extraHeaders,
  };
  const acceptEncoding = req.headers["accept-encoding"] || "";
  if (COMPRESSIBLE.has(ext) && acceptEncoding.includes("gzip")) {
    const compressed = zlib.gzipSync(content, { level: 6 });
    headers["content-encoding"] = "gzip";
    headers["vary"] = "Accept-Encoding";
    res.writeHead(200, headers);
    res.end(compressed);
  } else {
    res.writeHead(200, headers);
    res.end(content);
  }
}

function serveWebBuild(req, urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");

  // 1. Try web root first
  const webFilePath = path.join(WEB_ROOT, safePath);
  if (webFilePath.startsWith(WEB_ROOT) && fs.existsSync(webFilePath) && !fs.statSync(webFilePath).isDirectory()) {
    sendFile(req, res, webFilePath);
    return;
  }

  // 2. Try static root (Expo Go bundle/asset files don't always send expo-platform header)
  const staticFilePath = path.join(STATIC_ROOT, safePath);
  if (staticFilePath.startsWith(STATIC_ROOT) && fs.existsSync(staticFilePath) && !fs.statSync(staticFilePath).isDirectory()) {
    sendFile(req, res, staticFilePath);
    return;
  }

  // 2.5 Stale-bundle fallback: a browser with a cached index.html may request an
  // old hashed entry bundle that no longer exists after a redeploy. Serve the
  // current entry bundle instead of 404 so those clients still boot the app.
  const entryMatch = safePath.match(/(?:^|[\\/])_expo[\\/]static[\\/]js[\\/]web[\\/]entry-[0-9a-f]+\.js$/);
  if (entryMatch) {
    const webJsDir = path.join(WEB_ROOT, "_expo", "static", "js", "web");
    try {
      const current = fs.readdirSync(webJsDir).find((f) => /^entry-[0-9a-f]+\.js$/.test(f));
      if (current) {
        const content = fs.readFileSync(path.join(webJsDir, current));
        const acceptEncoding = req.headers["accept-encoding"] || "";
        if (acceptEncoding.includes("gzip")) {
          const compressed = zlib.gzipSync(content, { level: 6 });
          res.writeHead(200, {
            "content-type": MIME_TYPES[".js"],
            "cache-control": "no-cache, no-store, must-revalidate",
            "content-encoding": "gzip",
            "vary": "Accept-Encoding",
          });
          res.end(compressed);
        } else {
          res.writeHead(200, { "content-type": MIME_TYPES[".js"], "cache-control": "no-cache, no-store, must-revalidate" });
          res.end(content);
        }
        return;
      }
    } catch { /* fall through to 404 */ }
  }

  // 3. SPA fallback — only for paths without a file extension (app routes like /login, /home)
  const fileExt = path.extname(urlPath);
  if (!fileExt) {
    const indexPath = path.join(WEB_ROOT, "index.html");
    if (fs.existsSync(indexPath)) {
      sendFile(req, res, indexPath);
      return;
    }
  }

  res.writeHead(404);
  res.end("Not Found");
}

function serveLandingPage(req, res, landingPageTemplate, appName) {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = forwardedProto || "https";
  const host = req.headers["x-forwarded-host"] || req.headers["host"];
  const baseUrl = `${protocol}://${host}`;
  const expsUrl = `${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}

function serveStaticFile(urlPath, res) {
  const safePath = path.normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const filePath = path.join(STATIC_ROOT, safePath);

  if (!filePath.startsWith(STATIC_ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";
  const content = fs.readFileSync(filePath);
  res.writeHead(200, { "content-type": contentType });
  res.end(content);
}

const webBuildExists = fs.existsSync(path.join(WEB_ROOT, "index.html"));
const landingPageTemplate = fs.readFileSync(TEMPLATE_PATH, "utf-8");
const appName = getAppName();

if (webBuildExists) {
  console.log("Web build found — browser visitors will see the web app");
} else {
  console.log("No web build found — browser visitors will see the landing page");
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let pathname = url.pathname;

  if (basePath && pathname.startsWith(basePath)) {
    pathname = pathname.slice(basePath.length) || "/";
  }

  if (pathname === "/healthz" || pathname === "/status") {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
    return;
  }

  if (pathname === "/manifest") {
    const platform = req.headers["expo-platform"];
    if (platform === "ios" || platform === "android") {
      return serveManifest(platform, res);
    }
  }

  const platform = req.headers["expo-platform"];

  // Expo Go requests — serve manifest or static bundle files
  if (platform === "ios" || platform === "android") {
    if (pathname === "/" || pathname === "/manifest") {
      return serveManifest(platform, res);
    }
    return serveStaticFile(pathname, res);
  }

  // Dedicated Expo Go landing page with QR code
  if (pathname === "/expo") {
    return serveLandingPage(req, res, landingPageTemplate, appName);
  }

  // Browser requests — serve the web build (SPA)
  if (webBuildExists) {
    return serveWebBuild(req, pathname, res);
  }

  // Fallback: landing page if no web build
  if (pathname === "/") {
    return serveLandingPage(req, res, landingPageTemplate, appName);
  }

  serveStaticFile(pathname, res);
});

const port = parseInt(process.env.PORT || "3000", 10);
server.listen(port, "0.0.0.0", () => {
  console.log(`Serving static Expo build on port ${port}`);
});
