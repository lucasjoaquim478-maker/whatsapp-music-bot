import http from "http";
const s = http.createServer((q, r) => r.end("INDEX_JS_WORKS"));
s.listen(3000, () => console.log("[INDEX] SERVER ON 3000 - PID:", process.pid));
