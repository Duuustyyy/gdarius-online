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

const AT = +process.argv[2] || 330;                 // frame where T does save+load
const HDR = 32 + 4 + 1 + 0x9000;                    // approximate (assumes 1-byte boolean)
const MISC = HDR + 0x200000 + 0x80000 + 0xF000;     // misc_save_data (save counter)
const GPUBYTE = HDR + 0x290000 + 0x32b;             // the known harmless GPU byte

const region = (o) => {
    const h = (n) => "0x" + n.toString(16);
    if (o < HDR) return `header+${h(o)}`; o -= HDR;
    if (o < 0x200000) return `RAM+${h(o)}`; o -= 0x200000;
    if (o < 0x80000) return `BIOS+${h(o)}`; o -= 0x80000;
    if (o < 0x10000) return `psxH+${h(o)}`; o -= 0x10000;
    if (o < 0x318) return `psxRegs+${h(o)}`; o -= 0x318;
    if (o < 0x408) return `gpuHdr+${h(o)}`; o -= 0x408;
    if (o < 0x100000) return `VRAM+${h(o)}`; o -= 0x100000;
    return `SPU/rest+${h(o)}`;
};

const norm = (M) => {
    M._gd_serialize(M.buf, M.size);
    M.HEAPU8.fill(0, M.buf + MISC, M.buf + MISC + 0x100);
    M.HEAPU8[M.buf + GPUBYTE] = 0;
};

let shown = 0;
for (let f = 0; f < AT + 400; f++) {
    if (f === AT) { T._gd_serialize(T.pre, T.size); T._gd_unserialize(T.pre, T.size); }
    R.step(f); T.step(f);
    if (f < AT) continue;
    norm(R); norm(T);
    const d = diffRanges(R, R.buf, T, T.buf, R.size);
    const dv = vh(R) !== vh(T), da = ah(R) !== ah(T);
    if ((d.total || dv || da) && shown < 6) {
        shown++;
        console.log(`frame ${f} (+${f - AT}): state diff ${d.total} bytes, video:${dv} audio:${da}`);
        console.log("   " + d.out.slice(0, 12).map((r) => `${region(r.start)}(+${r.end - r.start})`).join("  "));
    }
}
if (!shown) console.log(`Load at frame ${AT}: no differences for 400 frames.`);