import { WebSocketServer } from "ws";
const rooms = new Map();
const wss = new WebSocketServer({ port: 8081 });

wss.on("connection", (ws) => {
    ws.on("message", (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "join") {
            const r = rooms.get(m.room) ?? [];
            if (r.length >= 2) return ws.send(JSON.stringify({ type: "full" }));
            r.push(ws); rooms.set(m.room, r); ws.room = m.room;
            ws.send(JSON.stringify({ type: "joined", port: r.length - 1 }));
            if (r.length === 2) r[0].send(JSON.stringify({ type: "peer" }));
        } else {
            for (const p of rooms.get(ws.room) ?? []) if (p !== ws) p.send(raw.toString());
        }
    });
    ws.on("close", () => {
        const r = (rooms.get(ws.room) ?? []).filter((p) => p !== ws);
        r.length ? rooms.set(ws.room, r) : rooms.delete(ws.room);
    });
});
console.log("signaling on ws://localhost:8081");