import http from "http";
const s = http.createServer((q, r) => r.end("ESM_WORKS"));
s.listen(3000, () => console.log("[ESM] SERVER ON 3000 - PID:", process.pid));
