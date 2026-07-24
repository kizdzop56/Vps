import http from "http";
import net from "net";

const EXPO_PORT = 22710;
const API_PORT = 8080;
const PROXY_PORT = 5000;

function isApiPath(url) {
  const pathname = new URL(url || "/", "http://localhost").pathname;
  return pathname === "/api" || pathname.startsWith("/api/");
}

function proxyRequest(req, res, targetPort) {
  const options = {
    hostname: "localhost",
    port: targetPort,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `localhost:${targetPort}` },
  };

  const proxy = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on("error", () => {
    res.writeHead(502);
    res.end("Service unavailable, please wait...");
  });

  req.pipe(proxy, { end: true });
}

const server = http.createServer((req, res) => {
  proxyRequest(req, res, isApiPath(req.url) ? API_PORT : EXPO_PORT);
});

// Tunnel WebSocket upgrades (e.g. Expo HMR) to the appropriate target.
server.on("upgrade", (req, socket, head) => {
  const targetPort = isApiPath(req.url) ? API_PORT : EXPO_PORT;
  const upstream = net.connect(targetPort, "localhost", () => {
    const headers = { ...req.headers, host: `localhost:${targetPort}` };
    const headerLines = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\r\n");
    upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n${headerLines}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
});

server.listen(PROXY_PORT, "0.0.0.0", () => {
  console.log(`Preview proxy: :${PROXY_PORT} → /api/* → :${API_PORT}, /* → :${EXPO_PORT}`);
});
