export function connect(room, status) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.hostname}:8081`);
        const sig = (o) => ws.send(JSON.stringify(o));
        let pc, port;
        const ch = {};
        const check = () => {
            if (ch.g?.readyState === "open" && ch.ctl?.readyState === "open") {
                status("Connected");
                resolve({ port, dc: ch.g, cc: ch.ctl });
            }
        };
        const adopt = (c) => { ch[c.label] = c; c.onopen = check; check(); };
        const makePc = () => {
            pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
            pc.onicecandidate = (e) => e.candidate && sig({ type: "ice", c: e.candidate });
            return pc;
        };
        ws.onerror = () => reject(new Error("Cannot reach signaling server"));
        ws.onopen = () => sig({ type: "join", room });
        ws.onmessage = async (ev) => {
            const m = JSON.parse(ev.data);
            if (m.type === "full") return reject(new Error("Room is full"));
            if (m.type === "joined") {
                port = m.port;
                status(port === 0 ? "Waiting for player 2..." : "Connecting...");
                if (port === 1) makePc().ondatachannel = (e) => adopt(e.channel);
            } else if (m.type === "peer") {                       // host: second player arrived
                makePc();
                adopt(pc.createDataChannel("ctl"));                                    // reliable: handshake, hashes
                adopt(pc.createDataChannel("g", { ordered: false, maxRetransmits: 0 })); // inputs: unordered, no retransmit
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