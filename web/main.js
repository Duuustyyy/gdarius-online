import createCore from "./wasm/core.mjs";
import { connect } from "./net.js";
import { putFile, getFile } from "./storage.js";

const $ = (id) => document.getElementById(id);
const canvas = $("screen"), ctx = canvas.getContext("2d");
const setStatus = (s) => ($("status").textContent = s);

// ---- input
const KEYS = {
    ArrowUp: 4, ArrowDown: 5, ArrowLeft: 6, ArrowRight: 7, KeyZ: 0, KeyX: 8,
    KeyA: 1, KeyS: 9, KeyQ: 10, KeyW: 11, Enter: 3, ShiftRight: 2, Backspace: 2
};
let keyMask = 0;
addEventListener("keydown", (e) => {
    if (e.code in KEYS) { keyMask |= 1 << KEYS[e.code]; e.preventDefault(); }
    if (e.code === "KeyF") document.documentElement.requestFullscreen?.();
});
addEventListener("keyup", (e) => { if (e.code in KEYS) { keyMask &= ~(1 << KEYS[e.code]); e.preventDefault(); } });
const PAD_MAP = { 0: 0, 1: 8, 2: 1, 3: 9, 4: 10, 5: 11, 6: 12, 7: 13, 8: 2, 9: 3, 12: 4, 13: 5, 14: 6, 15: 7 };
function padMask() {
    let m = 0;
    for (const gp of navigator.getGamepads()) {
        if (!gp) continue;
        for (const [b, id] of Object.entries(PAD_MAP)) if (gp.buttons[b]?.pressed) m |= 1 << id;
        const x = gp.axes[0] || 0, y = gp.axes[1] || 0;
        if (x < -0.5) m |= 1 << 6; if (x > 0.5) m |= 1 << 7;
        if (y < -0.5) m |= 1 << 4; if (y > 0.5) m |= 1 << 5;
        break;
    }
    return m;
}
const sample = () => keyMask | padMask();

// ---- audio
const WORKLET = `
class Q extends AudioWorkletProcessor {
  constructor() {
    super(); this.q = []; this.cur = null; this.i = 0; this.n = 0;
    this.port.onmessage = (e) => {
      this.q.push(e.data); this.n += e.data.length / 2;
      if (this.n > 8820) while (this.n > 4410) { this.n -= this.q.shift().length / 2; }
    };
  }
  process(_, outs) {
    const L = outs[0][0], R = outs[0][1];
    for (let k = 0; k < L.length; k++) {
      if (!this.cur || this.i >= this.cur.length) {
        this.cur = this.q.shift() || null; this.i = 0;
        if (this.cur) this.n -= this.cur.length / 2;
      }
      if (this.cur) { L[k] = this.cur[this.i++]; R[k] = this.cur[this.i++]; }
      else { L[k] = 0; R[k] = 0; }
    }
    return true;
  }
}
registerProcessor("q", Q);`;

let M, FS, actx, audioNode, stateBuf, stateSize;

async function setupAudio() {
    actx = new AudioContext({ sampleRate: 44100 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await actx.audioWorklet.addModule(url);
    audioNode = new AudioWorkletNode(actx, "q", { outputChannelCount: [2] });
    audioNode.connect(actx.destination);
    await actx.resume();
}

function cstr(s) {
    const b = new TextEncoder().encode(s + "\0");
    const p = M._malloc(b.length); M.HEAPU8.set(b, p); return p;
}

function drawFrame() {
    const w = M._gd_fb_w(), h = M._gd_fb_h();
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.putImageData(new ImageData(new Uint8ClampedArray(M.HEAPU8.buffer, M._gd_fb(), w * h * 4), w, h), 0, 0);
}

function pushAudio() {
    const n = M._gd_audio_frames();
    if (!n) return;
    const s = new Int16Array(M.HEAPU8.buffer, M._gd_audio(), n * 2);
    const f = new Float32Array(n * 2);
    for (let i = 0; i < f.length; i++) f[i] = s[i] / 32768;
    audioNode.port.postMessage(f, [f.buffer]);
}

let ident = "";
const fnv = (u8, h = 2166136261) => { for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); } return h >>> 0; };
async function identity(bios, disc) {                   // same BIOS + same disc => same string
    const b = new Uint8Array(await bios.arrayBuffer());
    const d = new Uint8Array(await disc.slice(0, 1 << 20).arrayBuffer());
    return `${fnv(b)}-${fnv(d)}-${disc.size}`;
}
async function writeBlob(blob, path, label) {
    const stream = FS.open(path, "w");
    const reader = blob.stream().getReader();
    let got = 0;
    for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        FS.write(stream, value, 0, value.length);
        got += value.length;
        setStatus(`${label} ${Math.round((got / blob.size) * 100)}%`);
    }
    FS.close(stream);
}

async function boot() {
    const bios = await getFile("bios"), disc = await getFile("disc");
    if (!bios || !disc) throw new Error("Add your BIOS and disc first");
    setStatus("Starting audio...");
    await setupAudio();                                   // must run inside the click
    setStatus("Loading engine...");
    M = await createCore({ print() { }, printErr() { } });
    FS = M.FS;
    FS.mkdir("/system"); FS.mkdir("/system/bios"); FS.mkdir("/saves"); FS.mkdir("/disc");
    await writeBlob(bios, "/system/" + bios.name, "BIOS");
    FS.writeFile("/system/bios/" + bios.name, FS.readFile("/system/" + bios.name));
    await writeBlob(disc, "/disc/game.chd", "Disc");
    ident = await identity(bios, disc);
    setStatus("Booting...");
    M._gd_init(cstr("/system"), cstr("/saves"));
    if (!M._gd_load(cstr("/disc/game.chd"))) throw new Error("Could not load disc");
    stateSize = M._gd_state_size();
    stateBuf = M._malloc(stateSize);
}

function run(stepFn) {
    $("title").style.display = "none";
    canvas.style.display = "block";
    const FRAME = 1000 / M._gd_fps();
    let acc = 0, last = performance.now();
    const tick = (now) => {
        acc += Math.min(now - last, 100); last = now;
        while (acc >= FRAME) { if (!stepFn()) break; acc -= FRAME; }
        acc = Math.min(acc, FRAME * 3);                     // don't fast-forward after a stall
        drawFrame();
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}

// ---------------- solo ----------------
$("start").onclick = async () => {
    $("start").disabled = $("online").disabled = true;
    try {
        await boot();
        run(() => { M._gd_set_pad(0, sample()); M._gd_run(); pushAudio(); return true; });
    } catch (e) { console.error(e); setStatus("Error: " + e.message); $("start").disabled = $("online").disabled = false; }
};

// ---------------- online lockstep ----------------
$("online").onclick = async () => {
    $("start").disabled = $("online").disabled = true;
    try {
        await boot();
        const { port, dc, cc } = await connect($("room").value.trim() || "room1", setStatus);
        const other = 1 - port, hud = $("hud");

        // both players must have the same BIOS and disc, or the game desyncs
        let peerId = null, gotId;
        const idPromise = new Promise((r) => (gotId = r));
        cc.onmessage = (e) => { const [t, v] = e.data.split(","); if (t === "id") { peerId = v; gotId(); } };
        cc.send(`id,${ident}`);
        await idPromise;
        if (peerId !== ident) throw new Error("Your BIOS or disc differs from the other player's");

        // ---- debug network simulation, applied to what THIS window sends: ?lag=40&jitter=20&loss=3
        const qs = new URLSearchParams(location.search);
        const LAG = +qs.get("lag") || 0, JIT = +qs.get("jitter") || 0, LOSS = (+qs.get("loss") || 0) / 100;
        const safe = (c, m) => { try { c.send(m); } catch { } };
        const sendG = (m) => {                                  // game channel: delay, jitter (can reorder), loss
            if (Math.random() < LOSS) return;
            const d = LAG + Math.random() * JIT;
            d > 0 ? setTimeout(() => safe(dc, m), d) : safe(dc, m);
        };
        let lastT = 0;
        const sendC = (m) => {                                  // control channel: delay only, stays ordered
            const now = performance.now();
            const t = Math.max(now + LAG + Math.random() * JIT, lastT); lastT = t;
            t > now ? setTimeout(() => safe(cc, m), t - now) : safe(cc, m);
        };

        // ---- state
        const inputs = [new Map(), new Map()];                  // player -> (frame -> mask)
        const mine = new Map(), theirs = new Map();
        const rtts = [];
        let D = 0, frame = 0, nextLocal = 0, recvUpTo = -1, theirAck = -1, lastTheirHash = -1;
        let myHash = [-1, -1], cleanLocal = 0, cleanRemote = 0, lastSend = 0, pingMs = 0;
        let stalls = 0, desync = -1, closed = false, started = false;

        const ramHash = () => {
            M._gd_serialize(stateBuf, stateSize);
            return M._gd_hash(stateBuf + 0x9025, 0x200000) >>> 0;
        };
        const compare = (f) => {
            if (mine.has(f) && theirs.has(f)) {
                if (mine.get(f) !== theirs.get(f) && desync < 0) desync = f;
                mine.delete(f); theirs.delete(f);
            }
        };
        const advance = () => { while (inputs[other].has(recvUpTo + 1)) recvUpTo++; };
        const stats = () => {
            const s = [...rtts].sort((a, b) => a - b);
            return { med: s.length ? s[s.length >> 1] : 0, p90: s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 100 };
        };

        // game packet: "i,ack,hashFrame,hash,startFrame,m,m,m..."
        const onInputs = (p) => {
            theirAck = Math.max(theirAck, +p[1]);
            const hf = +p[2];
            if (hf > lastTheirHash) { lastTheirHash = hf; theirs.set(hf, +p[3]); compare(hf); }
            const start = +p[4];
            for (let k = 5; k < p.length; k++) {
                const f = start + k - 5;
                if (f > recvUpTo) inputs[other].set(f, +p[k]);
            }
            advance();
        };
        dc.onmessage = (e) => {
            const p = e.data.split(",");
            if (p[0] === "i") onInputs(p);
            else if (p[0] === "p") sendG(`q,${p[1]}`);
            else if (p[0] === "q") rtts.push(performance.now() - +p[1]);
        };
        dc.onclose = cc.onclose = () => { closed = true; hud.textContent = "peer disconnected"; };

        const sendPacket = () => {                              // resend everything the peer hasn't acked
            const start = Math.max(theirAck + 1, D);
            const a = ["i", recvUpTo, myHash[0], myHash[1], start];
            for (let f = start; f < nextLocal && a.length < 45; f++) a.push(inputs[port].get(f) ?? 0);
            sendG(a.join(","));
        };

        const step = () => {
            if (closed) return false;
            while (nextLocal <= frame + D) { inputs[port].set(nextLocal, sample()); nextLocal++; }
            const now = performance.now();
            if (now - lastSend >= 8) { sendPacket(); lastSend = now; }   // also runs while stalled
            const m0 = frame < D ? 0 : inputs[0].get(frame);
            const m1 = frame < D ? 0 : inputs[1].get(frame);
            if (m0 === undefined || m1 === undefined) { stalls++; return false; }
            const limL = Math.min(theirAck, frame - 2);
            while (cleanLocal <= limL) inputs[port].delete(cleanLocal++);
            while (cleanRemote <= frame - 2) inputs[other].delete(cleanRemote++);
            M._gd_set_pad(0, m0); M._gd_set_pad(1, m1);
            M._gd_run(); pushAudio();
            if (frame % 60 === 0) {
                const h = ramHash(); myHash = [frame, h]; mine.set(frame, h); compare(frame);
                if (mine.size > 10) mine.delete(mine.keys().next().value);
                if (theirs.size > 10) theirs.delete(theirs.keys().next().value);
            }
            if (frame % 30 === 0)
                hud.textContent = desync >= 0 ? `DESYNC at frame ${desync}`
                    : `P${port + 1} | frame ${frame} | stalls ${stalls} | delay ${D}f | ping ${pingMs}ms`;
            frame++;
            return true;
        };

        const begin = (d) => {
            if (started) return;
            started = true;
            D = d; nextLocal = D; recvUpTo = D - 1;
            pingMs = Math.round(stats().med);
            advance();
            run(step);
        };
        cc.onmessage = (e) => { const [t, v] = e.data.split(","); if (t === "d" && port === 1) begin(+v); };

        // ---- measure the connection, host picks the input delay and tells the guest
        setStatus("Measuring connection...");
        for (let i = 0; i < 30; i++) { sendG(`p,${performance.now()}`); await new Promise((r) => setTimeout(r, 40)); }
        await new Promise((r) => setTimeout(r, 300));
        if (port === 0) {
            const d = Math.max(3, Math.min(12, Math.ceil(stats().p90 / 2 / 16.67) + 2));
            sendC(`d,${d}`);
            begin(d);
        } else if (!started) setStatus("Waiting for host...");
    } catch (e) {
        console.error(e); setStatus("Error: " + e.message); $("start").disabled = $("online").disabled = false;
    }
};

async function refreshSetup() {
    const b = await getFile("bios"), d = await getFile("disc");
    $("biosState").textContent = b ? `BIOS: ${b.name}` : "BIOS: not added";
    $("discState").textContent = d ? `Disc: ${d.name} (${Math.round(d.size / 1048576)} MB)` : "Disc: not added";
    $("start").disabled = $("online").disabled = !(b && d);
}
$("biosFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size !== 524288) return setStatus("That doesn't look like a PS1 BIOS (should be 512 KB)");
    await putFile("bios", f); setStatus(""); refreshSetup();
};
$("discFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!/\.chd$/i.test(f.name)) return setStatus("Disc must be a .chd file (convert with chdman)");
    await putFile("disc", f); setStatus(""); refreshSetup();
};
refreshSetup();