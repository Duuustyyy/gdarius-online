import { DurableObject } from "cloudflare:workers";

export default {
    async fetch(req, env) {
        const url = new URL(req.url);

        if (url.pathname === "/ws") {                         // signaling: one Durable Object per room
            if (req.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
            const room = (url.searchParams.get("room") || "room1").slice(0, 64);
            return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(req);
        }

        if (url.pathname === "/turn") {                       // short-lived TURN credentials
            const o = req.headers.get("Origin");
            if (o && o !== url.origin) return new Response("forbidden", { status: 403 });
            const stun = [{ urls: "stun:stun.cloudflare.com:3478" }];
            if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return Response.json(stun);
            try {
                const r = await fetch(
                    `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate`,
                    {
                        method: "POST",
                        headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, "Content-Type": "application/json" },
                        body: JSON.stringify({ ttl: 14400 })
                    });
                if (!r.ok) throw new Error("turn " + r.status);
                const d = await r.json();
                return Response.json([].concat(d.iceServers), { headers: { "Cache-Control": "no-store" } });
            } catch { return Response.json(stun); }             // fall back to STUN only
        }

        return new Response("not found", { status: 404 });
    },
};

export class Room extends DurableObject {
    async fetch() {
        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server);                      // hibernation API
        return new Response(null, { status: 101, webSocket: client });
    }

    webSocketMessage(ws, raw) {
        if (typeof raw !== "string") return;
        let m; try { m = JSON.parse(raw); } catch { return; }
        const all = this.ctx.getWebSockets();
        const portOf = (s) => s.deserializeAttachment()?.port;

        if (m.type === "join") {
            const used = all.filter((s) => s !== ws).map(portOf).filter((p) => p !== undefined && p !== null);
            if (used.length >= 2) { ws.send(JSON.stringify({ type: "full" })); return; }
            const port = used.includes(0) ? 1 : 0;
            ws.serializeAttachment({ port });
            ws.send(JSON.stringify({ type: "joined", port }));
            if (port === 1) for (const s of all) if (portOf(s) === 0) s.send(JSON.stringify({ type: "peer" }));
        } else {
            for (const s of all) if (s !== ws && portOf(s) !== undefined) s.send(raw);   // relay offer/answer/ice
        }
    }

    webSocketClose(ws, code) { try { ws.close(code); } catch { } }
}