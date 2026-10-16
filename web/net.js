export async function connect(room, status) {
    const local = ["localhost", "127.0.0.1"].includes(location.hostname);
    const qs = new URLSearchParams(location.search);
    let ice = [{ urls: "stun:stun.l.google.com:19302" }];
    if (!local) { try { const r = await fetch("/turn"); if (r.ok) ice = await r.json(); } catch { } }
    const cfg = { iceServers: ice, ...(qs.has("relay") ? { iceTransportPolicy: "relay" } : {}) };
    const url = local ? `ws://${location.hostname}:8081`
        : `wss://${location.host}/ws?room=${encodeURIComponent(room)}`;
    const invite = `${location.origin}/?room=${encodeURIComponent(room)}`;

    return new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const sig = (o) => ws.send(JSON.stringify(o));
        let pc, port, done = false;
        const ch = {};
        const check = () => {
            if (!done && ch.g?.readyState === "open" && ch.ctl?.readyState === "open") {
                done = true;
                status("Connected");
                try { ws.close(); } catch { }                        // signaling no longer needed
                resolve({ port, dc: ch.g, cc: ch.ctl });
            }
        };
        const adopt = (c) => { ch[c.label] = c; c.onopen = check; check(); };
        const makePc = () => {
            pc = new RTCPeerConnection(cfg);
            pc.onicecandidate = (e) => e.candidate && sig({ type: "ice", c: e.candidate });
            return pc;
        };
        ws.onerror = () => { if (!done) reject(new Error("Cannot reach signaling server")); };
        ws.onopen = () => sig({ type: "join", room });
        ws.onmessage = async (ev) => {
            const m = JSON.parse(ev.data);
            if (m.type === "full") return reject(new Error("Room is full"));
            if (m.type === "joined") {
                port = m.port;
                status(port === 0 ? `Waiting for player 2... Invite link: ${invite}` : "Connecting...");
                if (port === 1) makePc().ondatachannel = (e) => adopt(e.channel);
            } else if (m.type === "peer") {
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
        };
    });
}

const qroom = new URLSearchParams(location.search).get("room");
if (qroom) $("room").value = qroom;