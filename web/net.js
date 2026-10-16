// connect(room, status, { mode: "create" | "join", signal })
//   mode "join" fails with a clear error if nobody is hosting that code.
//   signal is an AbortSignal (the lobby's Cancel button).
export async function connect(room, status, { mode = "create", signal } = {}) {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const qs = new URLSearchParams(location.search);
    status("Connecting to server...");
    let ice = [{ urls: "stun:stun.l.google.com:19302" }];
    if (!local) { try { const r = await fetch("/turn"); if (r.ok) ice = await r.json(); } catch { } }
    const cfg = { iceServers: ice, ...(qs.has("relay") ? { iceTransportPolicy: "relay" } : {}) };
    const url = local ? `ws://${location.hostname}:8081`
        : `wss://${location.host}/ws?room=${encodeURIComponent(room)}`;
    const NOCONN = "Could not connect to the other player. A strict network or firewall may be blocking direct connections.";

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const sig = (o) => { try { ws.send(JSON.stringify(o)); } catch { } };
        let pc, port, done = false, failed = false, timer = 0;
        const ch = {};
        const fail = (msg) => {
            if (done || failed) return;
            failed = true;
            clearTimeout(timer);
            try { ws.close(); } catch { }
            try { pc?.close(); } catch { }
            reject(new Error(msg));
        };
        const arm = () => { clearTimeout(timer); timer = setTimeout(() => fail(NOCONN), 20000); };
        if (signal?.aborted) return fail("Cancelled");
        signal?.addEventListener("abort", () => fail("Cancelled"), { once: true });

        const check = () => {
            if (!done && !failed && ch.g?.readyState === "open" && ch.ctl?.readyState === "open") {
                done = true;
                clearTimeout(timer);
                status("Connected");
                try { ws.close(); } catch { }                        // signaling no longer needed
                resolve({ port, dc: ch.g, cc: ch.ctl });
            }
        };
        const adopt = (c) => { ch[c.label] = c; c.onopen = check; check(); };
        const makePc = () => {
            pc = new RTCPeerConnection(cfg);
            pc.onicecandidate = (e) => e.candidate && sig({ type: "ice", c: e.candidate });
            pc.onconnectionstatechange = () => { if (pc.connectionState === "failed") fail(NOCONN); };
            return pc;
        };
        ws.onerror = () => fail("Cannot reach the server");
        ws.onclose = () => fail("Lost connection to the server");   // ignored once connected or failed
        ws.onopen = () => sig({ type: "join", room });
        ws.onmessage = async (ev) => {
            try {
                const m = JSON.parse(ev.data);
                if (m.type === "full") return fail("That game is full");
                if (m.type === "joined") {
                    port = m.port;
                    if (mode === "join" && port === 0) return fail("No game found with that code");
                    status(port === 0 ? "Waiting for player 2..." : "Connecting...");
                    if (port === 1) { arm(); makePc().ondatachannel = (e) => adopt(e.channel); }
                } else if (m.type === "peer") {
                    status("Player 2 found, connecting...");
                    arm();
                    makePc();
                    adopt(pc.createDataChannel("ctl"));
                    adopt(pc.createDataChannel("g", { ordered: false, maxRetransmits: 0 }));
                    await pc.setLocalDescription(await pc.createOffer());
                    sig({ type: "offer", d: pc.localDescription });
                } else if (m.type === "offer") {
                    await pc.setRemoteDescription(m.d);
                    await pc.setLocalDescription(await pc.createAnswer());
                    sig({ type: "answer", d: pc.localDescription });
                } else if (m.type === "answer") {
                    await pc.setRemoteDescription(m.d);
                } else if (m.type === "ice") {
                    try { await pc.addIceCandidate(m.c); } catch { }
                }
            } catch (e) { fail(e.message || "Connection error"); }
        };
    });
}
