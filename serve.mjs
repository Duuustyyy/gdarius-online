import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const types = {
    ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
    ".wasm": "application/wasm", ".css": "text/css"
};

http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (p === "/") p = "/index.html";
    const base = p.startsWith("/assets/") ? root : path.join(root, "web");
    const file = path.normalize(path.join(base, p));
    if (!file.startsWith(base)) { res.writeHead(403).end(); return; }
    fs.stat(file, (e, st) => {
        if (e || !st.isFile()) { res.writeHead(404).end("not found"); return; }
        res.writeHead(200, {
            "Content-Type": types[path.extname(file)] || "application/octet-stream",
            "Content-Length": st.size, "Cache-Control": "no-store",
        });
        fs.createReadStream(file).pipe(res);
    });
}).listen(8080, "127.0.0.1", () => console.log("http://localhost:8080"));