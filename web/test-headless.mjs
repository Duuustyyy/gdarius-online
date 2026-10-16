import createCore from "./wasm/core.mjs";
import fs from "node:fs";
import zlib from "node:zlib";

const ASSETS = "C:/Users/prueb/Downloads/gdarius-web/assets";
const OUT = "C:/Users/prueb/Downloads/gdarius-web/scratch";

const M = await createCore({
    print: (s) => console.log(s),
    printErr: (s) => console.error("[core]", s),
});
const FS = M.FS;
FS.mkdir("/system"); FS.mkdir("/system/bios"); FS.mkdir("/saves"); FS.mkdir("/assets");
FS.mount(FS.filesystems.NODEFS, { root: ASSETS }, "/assets");   // disc read straight from disk
const bios = fs.readFileSync(`${ASSETS}/scph5501.bin`);
FS.writeFile("/system/scph5501.bin", bios);
FS.writeFile("/system/bios/scph5501.bin", bios);               // cover both lookup locations

function cstr(s) {
    const b = new TextEncoder().encode(s + "\0");
    const p = M._malloc(b.length); M.HEAPU8.set(b, p); return p;
}
const step = (pad = 0) => { M._gd_set_pad(0, pad); M._gd_run(); };
const fbHash = () => M._gd_hash(M._gd_fb(), M._gd_fb_w() * M._gd_fb_h() * 4);
const audioHash = () => M._gd_hash(M._gd_audio(), M._gd_audio_frames() * 4);

function savePng(file) {
    const w = M._gd_fb_w(), h = M._gd_fb_h(), ptr = M._gd_fb();
    if (!w || !h) { console.log("no frame yet, skipping", file); return; }
    const px = Buffer.from(M.HEAPU8.buffer, ptr, w * h * 4);
    const raw = Buffer.alloc((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) px.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const td = Buffer.concat([Buffer.from(type), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
        return Buffer.concat([len, td, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
    fs.writeFileSync(file, Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0)),
    ]));
    console.log(`saved ${file} (${w}x${h})`);
}

M._gd_init(cstr("/system"), cstr("/saves"));
if (!M._gd_load(cstr("/assets/gdarius.chd"))) throw new Error("retro_load_game failed");
console.log("fps", M._gd_fps(), "sample rate", M._gd_sample_rate());

// ---- Part 1: boot and look at it ----
const t0 = Date.now();
for (let f = 0; f < 1800; f++) {
    step(0);
    if (f === 600 || f === 1200 || f === 1799) savePng(`${OUT}/frame_${f}.png`);
}
const secs = (Date.now() - t0) / 1000;
console.log(`1800 frames in ${secs.toFixed(1)}s = ${(1800 / secs).toFixed(0)} fps (need ~60)`);

// ---- Part 2: determinism (save, run, load, run, compare) ----
const size = M._gd_state_size();
console.log("savestate bytes:", size);
const buf = M._malloc(size);
const START = 1 << 3;                                   // libretro START bit
const inputAt = (i) => (i % 90 < 5 ? START : 0);
const run = (n) => { const hs = []; for (let i = 0; i < n; i++) { step(inputAt(i)); hs.push(`${fbHash()}:${audioHash()}`); } return hs; };

if (!M._gd_serialize(buf, size)) throw new Error("serialize failed");
const a = run(300);
if (!M._gd_unserialize(buf, size)) throw new Error("unserialize failed");
const b = run(300);
const bad = a.findIndex((v, i) => v !== b[i]);
console.log(bad === -1 ? "DETERMINISTIC: 300/300 frames identical (video+audio)" : `DESYNC at frame ${bad} after load`);