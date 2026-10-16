import createCore from "./wasm/core.mjs";
import fs from "node:fs";

const ASSETS = "C:/Users/prueb/Downloads/gdarius-web/assets";
const LOG = JSON.parse(fs.readFileSync("C:/Users/prueb/Downloads/gdarius-web/scratch/inputs.json", "utf8"));
const inp = (f) => LOG[f] ?? 0;

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
    M.pre = M._malloc(M.size);
    M.step = (f) => { M._gd_set_pad(0, inp(f)); M._gd_run(); };
    return M;
}

const vh = (M) => M._gd_hash(M._gd_fb(), M._gd_fb_w() * M._gd_fb_h() * 4);
const ah = (M) => M._gd_hash(M._gd_audio(), M._gd_audio_frames() * 4);
const sh = (M) => { M._gd_serialize(M.buf, M.size); return M._gd_hash(M.buf, M.size); };

function diffRanges(M1, p1, M2, p2, n) {
    const a = M1.HEAPU8, b = M2.HEAPU8;
    const out = []; let total = 0, cur = null;
    for (let i = 0; i < n; i++) {
        if (a[p1 + i] !== b[p2 + i]) {
            total++;
            if (cur && i - cur.end < 64) cur.end = i + 1;
            else { cur = { start: i, end: i + 1 }; out.push(cur); }
        }
    }
    return { total, out };
}
const show = (d) => d.out.slice(0, 15)
    .map((r) => `0x${r.start.toString(16)}+${r.end - r.start}`).join("  ") + (d.out.length > 15 ? `  ...(${d.out.length} ranges)` : "");

const R = await boot();   // reference: never loads a state
const T = await boot();   // test: save+load round trip every 60 frames
console.log("state size", R.size, "bytes. Running up to", LOG.length, "frames (stops at first divergence)");

const INTERVAL = +process.argv[2] || 1e9;          // default: one round trip, at frame 30
const HDR = 32 + 4 + 1 + 0x9000;                   // approximate (assumes 1-byte boolean)
const MISC = HDR + 0x200000 + 0x80000 + 0xF000;    // misc_save_data inside psxH
const MASK_LEN = 0x100;
const region = (o) =>
    o < HDR ? "header" :
        o < HDR + 0x200000 ? `RAM+0x${(o - HDR).toString(16)}` :
            o < HDR + 0x280000 ? "BIOS" :
                o < HDR + 0x290000 ? `psxH+0x${(o - HDR - 0x280000).toString(16)}` :
                    `after-psxH+0x${(o - HDR - 0x290000).toString(16)}`;

const sh2 = (M) => {
    M._gd_serialize(M.buf, M.size);
    M.HEAPU8.fill(0, M.buf + MISC, M.buf + MISC + MASK_LEN);   // ignore misc counters
    return M._gd_hash(M.buf, M.size);
};

let outFrame = -1, stateFrame = -1;
for (let f = 0; f < LOG.length; f++) {
    if (f % INTERVAL === 30) {
        T._gd_serialize(T.pre, T.size);
        T._gd_unserialize(T.pre, T.size);
    }
    R.step(f); T.step(f);
    const dv = vh(R) !== vh(T), da = ah(R) !== ah(T);
    const ds = sh2(R) !== sh2(T);
    if (ds && stateFrame === -1) {
        stateFrame = f;
        const d = diffRanges(R, R.buf, T, T.buf, R.size);
        console.log(`\nFIRST REAL STATE DIFF at frame ${f}: ${d.total} bytes`);
        console.log(d.out.slice(0, 20).map((r) => `${region(r.start)}(+${r.end - r.start})`).join("  "));
    }
    if (dv || da) { outFrame = f; console.log(`VISIBLE divergence at frame ${f} (video:${dv} audio:${da})`); break; }
    if (f % 1800 === 0) console.log(`frame ${f}/${LOG.length}`);
}
if (stateFrame === -1) console.log("No real state difference in the whole recording (only misc counters differed).");
if (outFrame === -1) console.log("No visible divergence in the whole recording.");