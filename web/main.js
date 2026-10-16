import createCore from "./wasm/core.mjs";
import { connect } from "./net.js";
import { putFile, getFile } from "./storage.js";
import { KEYMAP, PADMAP, initControls } from "./controls.js";

// Bump this string on EVERY deploy. Both online players must have the same value,
// otherwise they get a clear "refresh the page" error instead of a silent desync.
const BUILD = "2026-10-16a";

const $ = (id) => document.getElementById(id);
const canvas = $("screen"), ctx = canvas.getContext("2d");
const setStatus = (s) => ($("status").textContent = s);

// ---- input (bindings come from controls.js and are changed on the title screen)
let keyMask = 0;
const typing = (e) => e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement;   // don't steal keys from the room box or a focused button
addEventListener("keydown", (e) => {
    if (typing(e)) return;
    if (e.code in KEYMAP) { keyMask |= 1 << KEYMAP[e.code]; e.preventDefault(); }
    if (e.code === "KeyF") document.documentElement.requestFullscreen?.();
    if (e.code === "KeyM" && !(e.code in KEYMAP)) toggleMute();
});
addEventListener("keyup", (e) => {
    if (typing(e)) return;
    if (e.code in KEYMAP) { keyMask &= ~(1 << KEYMAP[e.code]); e.preventDefault(); }
});
function padMask() {
    let m = 0;
    for (const gp of navigator.getGamepads()) {
        if (!gp) continue;
        for (const [b, id] of Object.entries(PADMAP)) if (gp.buttons[b]?.pressed) m |= 1 << id;
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

let M, FS, actx, audioNode, gainNode, stateBuf, stateSize;

// ---- mute (M key or the small button shown during the game; remembered between visits)
let muted = false;
try { muted = localStorage.getItem("gdarius.muted") === "1"; } catch { }
let muteBtn = null;
function applyMute() {
    if (gainNode) gainNode.gain.value = muted ? 0 : 1;
    if (muteBtn) muteBtn.textContent = muted ? "Sound: off (M)" : "Sound: on (M)";
}
function toggleMute() {
    muted = !muted;
    try { localStorage.setItem("gdarius.muted", muted ? "1" : "0"); } catch { }
    applyMute();
}
function makeMuteButton() {
    if (muteBtn) return;
    muteBtn = document.createElement("button");
    muteBtn.type = "button";
    muteBtn.style.cssText = "position:fixed;top:8px;right:8px;z-index:20;padding:4px 10px;font:12px system-ui,sans-serif;" +
        "color:#cfe3ff;background:#0a1830b0;border:1px solid #2b8cff66;border-radius:6px;cursor:pointer;opacity:.75";
    muteBtn.onmouseenter = () => (muteBtn.style.opacity = "1");
    muteBtn.onmouseleave = () => (muteBtn.style.opacity = ".75");
    muteBtn.onclick = () => { toggleMute(); muteBtn.blur(); };
    document.body.appendChild(muteBtn);
    applyMute();
}

async function setupAudio() {
    actx = new AudioContext({ sampleRate: 44100 });
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await actx.audioWorklet.addModule(url);
    audioNode = new AudioWorkletNode(actx, "q", { outputChannelCount: [2] });
    gainNode = actx.createGain();
    audioNode.connect(gainNode);
    gainNode.connect(actx.destination);
    applyMute();
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

let booted = false;
async function ensureBoot() { if (booted) return; await boot(); booted = true; }

function run(stepFn) {
    document.activeElement?.blur?.();                     // don't leave the room-code box focused
    $("title").style.display = "none";
    canvas.style.display = "block";
    makeMuteButton();
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
// While loading, the pressed button keeps a lit look and the other buttons dim.
let loading = false;
function setBusy(btn, on) {
    loading = on;
    for (const id of ["start", "online", "ctlBtn"]) { const el = $(id); if (el && el !== btn) el.disabled = on; }
    btn.style.background = on ? "#2b8cff40" : "";
    btn.style.boxShadow = on ? "0 0 16px #2b8cff66" : "";
    btn.style.cursor = on ? "progress" : "";
}

$("start").onclick = async () => {
    if (loading) return;
    setBusy($("start"), true);
    try {
        await ensureBoot();
        run(() => { M._gd_set_pad(0, sample()); M._gd_run(); pushAudio(); return true; });
    } catch (e) { console.error(e); setStatus("Error: " + e.message); setBusy($("start"), false); refreshSetup(); }
};

// ---------------- lobby ----------------
const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };
const setInfo = (s) => { $("lobInfo").textContent = s; };
function lobbyView(v) {                                  // "off" | "home" | "wait"
    for (const id of ["start", "ctlBtn", "menuRow"]) show(id, v === "off");
    show("lobby", v !== "off"); show("lobHome", v === "home"); show("lobWait", v === "wait");
}
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";     // no 0/O/1/I
const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
const cleanCode = (s) => s.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24);
let abort = null, teardown = null, inviteUrl = "";

const qroom = new URLSearchParams(location.search).get("room");
if (qroom) { $("room").value = cleanCode(qroom); setStatus("You were invited to a game: press Co-op Online, then Join."); }

$("online").onclick = async () => {
    if (loading) return;
    setBusy($("online"), true);
    try { await ensureBoot(); setStatus(""); lobbyView("home"); }
    catch (e) { console.error(e); setStatus("Error: " + e.message); }
    setBusy($("online"), false);
    refreshSetup();
};
$("lobBack").onclick = () => lobbyView("off");
$("lobCreate").onclick = () => enter(newCode(), "create");
$("lobJoin").onclick = () => {
    const c = cleanCode($("room").value);
    if (!c) { $("lobMsg").textContent = "Type the game code first"; return; }
    enter(c, "join");
};
$("room").onkeydown = (e) => { if (e.key === "Enter") $("lobJoin").click(); };
$("lobCancel").onclick = () => { abort?.abort(); teardown?.(); };
$("lobCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); $("lobCopy").textContent = "Copied!"; }
    catch { $("lobCopy").textContent = "Select the link below"; }
    setTimeout(() => ($("lobCopy").textContent = "Copy invite link"), 1800);
};
function showGone() {
    $("hud").textContent = "";
    show("gone", true);
}
$("goneBtn").onclick = () => {                           // the game core can't be reused after a match: start clean
    const u = new URL(location.href); u.searchParams.delete("room"); location.href = u.toString();
};

async function enter(code, mode) {
    abort = new AbortController();
    inviteUrl = `${location.origin}/?room=${encodeURIComponent(code)}`;
    $("lobCode").textContent = code;
    $("lobLink").textContent = inviteUrl;
    show("lobCopy", mode === "create"); show("lobLink", mode === "create");
    show("lobReady", false);
    $("lobMsg").textContent = "";
    setInfo("Connecting to server...");
    lobbyView("wait");
    let conn = null;
    try {
        conn = await connect(code, setInfo, { mode, signal: abort.signal });
        await onlineSession(conn);                       // resolves when the game starts
    } catch (e) {
        console.error(e);
        try { conn?.dc.close(); conn?.cc.close(); } catch { }
        $("lobMsg").textContent = e.message === "Cancelled" ? "" : e.message;
        lobbyView("home");
    } finally { teardown = null; abort = null; }
}

// ---------------- online lockstep ----------------
async function onlineSession({ port, dc, cc }) {
    const other = 1 - port, hud = $("hud");
    let started = false, closed = false, idOk = false;
    let myReady = false, peerReady = false, going = false, peerId = null, peerBuild = null;
    let resolveId, resolveStart, rejectGone;
    const idP = new Promise((r) => (resolveId = r));
    const startedP = new Promise((r) => (resolveStart = r));
    const goneP = new Promise((_, rej) => (rejectGone = rej));
    goneP.catch(() => { });
    const until = (p) => Promise.race([p, goneP]);      // stop waiting if the peer leaves or we cancel
    teardown = () => { try { dc.close(); cc.close(); } catch { } rejectGone(new Error("Cancelled")); };

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
    let stalls = 0, desync = -1, lastRecv = performance.now();

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
        lastRecv = performance.now();
        const p = e.data.split(",");
        if (p[0] === "i") onInputs(p);
        else if (p[0] === "p") sendG(`q,${p[1]}`);
        else if (p[0] === "q") rtts.push(performance.now() - +p[1]);
    };
    dc.onclose = cc.onclose = () => {
        closed = true;
        if (started) showGone(); else rejectGone(new Error("The other player left"));
    };

    // tell the other side right away when this tab closes (the browser's own timeout takes 15-30 s)
    addEventListener("pagehide", () => { try { cc.send("bye"); } catch { } });

    const sendPacket = () => {                              // resend everything the peer hasn't acked
        const start = Math.max(theirAck + 1, D);
        const a = ["i", recvUpTo, myHash[0], myHash[1], start];
        for (let f = start; f < nextLocal && a.length < 45; f++) a.push(inputs[port].get(f) ?? 0);
        sendG(a.join(","));
    };

    const step = () => {
        if (closed) return false;
        if (performance.now() - lastRecv > 10000) { closed = true; showGone(); return false; }   // peer went silent
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
        started = true; resolveStart();
        lastRecv = performance.now();
        D = d; nextLocal = D; recvUpTo = D - 1;
        pingMs = Math.round(stats().med);
        advance();
        run(step);
    };

    // ---- ready handshake, then measure the connection; the host picks the input delay and tells the guest
    const readyInfo = () => setInfo(`Connected. You are Player ${port + 1}. ` +
        (myReady ? "Waiting for the other player..." : peerReady ? "The other player is ready. Press Ready when you are." : "Press Ready when you're set."));
    const go = async () => {
        if (!(myReady && peerReady) || going) return;
        going = true;
        setInfo("Measuring connection...");
        for (let i = 0; i < 30; i++) { sendG(`p,${performance.now()}`); await new Promise((r) => setTimeout(r, 40)); }
        await new Promise((r) => setTimeout(r, 300));
        if (started || closed) return;
        if (port === 0) {
            const d = Math.max(3, Math.min(12, Math.ceil(stats().p90 / 2 / 16.67) + 2));
            sendC(`d,${d}`);
            begin(d);
        } else setInfo("Waiting for the host...");
    };
    cc.onmessage = (e) => {
        const [t, v, w] = e.data.split(",");
        if (t === "id") { peerId = v; peerBuild = w; resolveId(); }
        else if (t === "r") { peerReady = true; if (idOk) { readyInfo(); go().catch(rejectGone); } }
        else if (t === "d" && port === 1) begin(+v);
        else if (t === "bye") { closed = true; if (started) showGone(); else rejectGone(new Error("The other player left")); }
    };
    $("lobReady").onclick = () => {
        myReady = true; $("lobReady").disabled = true; sendC("r"); readyInfo(); go().catch(rejectGone);
    };

    // both players must have the same BIOS and disc, or the game desyncs
    cc.send(`id,${ident},${BUILD}`);
    await until(idP);
    if (peerBuild !== BUILD) throw new Error("You and the other player are running different versions of the game. Both of you: refresh the page (Ctrl+F5) and try again.");
    if (peerId !== ident) throw new Error("Your BIOS or disc differs from the other player's");
    idOk = true;
    show("lobCopy", false); show("lobLink", false);
    $("lobReady").disabled = false; show("lobReady", true);
    readyInfo();
    if (peerReady) go().catch(rejectGone);
    await until(startedP);
}

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
initControls({ onClose: () => { keyMask = 0; } });
$("menuRow").after($("ctlBtn"));                       // Controls button goes under Co-op Online
refreshSetup();