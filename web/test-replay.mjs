import createCore from "./wasm/core.mjs";
import fs from "node:fs";

const ASSETS = "C:/Users/prueb/Downloads/gdarius-web/assets";
const LOG = JSON.parse(fs.readFileSync("C:/Users/prueb/Downloads/gdarius-web/scratch/inputs.json", "utf8"));
const inp = (f) => LOG[f] ?? 0;
console.log("input log:", LOG.length, "frames (", (LOG.length / 60).toFixed(0), "s )");

async function boot() {
    const M = await createCore({ print() { }, printErr() { } });
    const FS = M.FS;
    FS.mkdir("/system"); FS.mkdir("/system/bios"); FS.mkdir("/saves"); FS.mkdir("/assets");
    FS.mount(FS.filesystems.NODEFS, { root: ASSETS }, "/assets");
    const bios = fs.readFileSync(`${ASSETS}/scph5501.bin`);
    FS.writeFile("/system/scph5501.bin", bios);
    FS.writeFile("/system/bios/scph5501.bin", bios);
    const cstr = (s) => { const b = new TextEncoder().encode(s + "\0"); const p = M._malloc(b.length); M.HEAPU8.set(b, p); return p; };
    M._gd_init(cstr("/system"), cstr("/saves"));
    if (!M._gd_load(cstr("/assets/gdarius.chd"))) throw new Error("load failed");
    M.size = M._gd_state_size();
    M.buf = M._malloc(M.size);
    M.step = (f) => { M._gd_set_pad(0, inp(f)); M._gd_run(); };
    M.frameHash = () =>
        (M._gd_hash(M._gd_fb(), M._gd_fb_w() * M._gd_fb_h() * 4) * 31 +
            M._gd_hash(M._gd_audio(), M._gd_audio_frames() * 4)) >>> 0;
    M.stateHash = () => { M._gd_serialize(M.buf, M.size); return M._gd_hash(M.buf, M.size); };
    return M;
}

// ---------- Check A: save/load inside one core ----------
{
    const M = await boot();
    let f = 0, bad = 0, checks = 0;
    while (f + 120 < LOG.length) {
        for (let i = 0; i < 480; i++) M.step(f++);          // advance 8 s between checks
        M._gd_serialize(M.buf, M.size);
        const a = []; for (let i = 0; i < 120; i++) { M.step(f + i); a.push(M.frameHash()); }
        M._gd_unserialize(M.buf, M.size);
        const b = []; for (let i = 0; i < 120; i++) { M.step(f + i); b.push(M.frameHash()); }
        checks++;
        const d = a.findIndex((v, i) => v !== b[i]);
        if (d !== -1) { bad++; console.log(`A: DESYNC at game frame ${f + d} (save point ${f})`); }
        f += 120;
    }
    console.log(`Check A: ${checks - bad}/${checks} save/load windows identical`);
}

// ---------- Check B: two separate cores, same inputs ----------
{
    const A = await boot(), B = await boot();
    let first = -1;
    for (let f = 0; f < LOG.length; f++) {
        A.step(f); B.step(f);
        if (A.frameHash() !== B.frameHash()) { first = f; break; }
        if (f % 300 === 0 && A.stateHash() !== B.stateHash()) { first = f; console.log("B: state differs while video/audio still match"); break; }
    }
    console.log(first === -1 ? `Check B: two cores identical for all ${LOG.length} frames` : `Check B: DESYNC at frame ${first}`);
}

// ---------- Timing ----------
{
    const M = await boot();
    const warm = Math.min(LOG.length, 1500);
    for (let f = 0; f < warm; f++) M.step(f);
    const time = (n, fn) => { const t = performance.now(); for (let i = 0; i < n; i++) fn(i); return (performance.now() - t) / n; };
    const ser = time(50, () => M._gd_serialize(M.buf, M.size));
    const uns = time(50, () => M._gd_unserialize(M.buf, M.size));
    M._gd_unserialize(M.buf, M.size);
    const run = time(200, (i) => M.step(warm + i));
    console.log(`state ${(M.size / 1048576).toFixed(2)} MB | serialize ${ser.toFixed(2)} ms | unserialize ${uns.toFixed(2)} ms | frame ${run.toFixed(2)} ms`);
    console.log(`budget at 60 fps: 16.67 ms/frame`);
}