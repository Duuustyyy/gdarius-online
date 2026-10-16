// controls.js - controller setup for ONE player (keyboard + gamepad). Title screen only.
// Live maps used by main.js: KEYMAP (key code -> libretro pad bit), PADMAP (gamepad button -> bit).

const STORE = "silverhawk.controls.v1";

// bit = libretro joypad id; pad: null means the gamepad side is fixed (d-pad / stick)
const ACTIONS = [
    { id: "up", label: "Up", bit: 4, key: "ArrowUp", pad: null },
    { id: "down", label: "Down", bit: 5, key: "ArrowDown", pad: null },
    { id: "left", label: "Left", bit: 6, key: "ArrowLeft", pad: null },
    { id: "right", label: "Right", bit: 7, key: "ArrowRight", pad: null },
    { id: "shot", label: "Shot", sym: "○", bit: 8, key: "KeyX", pad: 1 },
    { id: "capture", label: "Capture Ball", sym: "✕", bit: 0, key: "KeyZ", pad: 0 },
    { id: "rapid", label: "Rapid Fire", sym: "□", bit: 1, key: "KeyA", pad: 2 },
    { id: "cancel", label: "Cancel", sym: "△", bit: 9, key: "KeyS", pad: 3 },
    { id: "start", label: "Start", bit: 3, key: "Enter", pad: 9 },
    { id: "select", label: "Select", bit: 2, key: "ShiftRight", pad: 8 },
    { id: "l1", label: "L1", bit: 10, key: "KeyQ", pad: 4 },
    { id: "r1", label: "R1", bit: 11, key: "KeyW", pad: 5 },
];
const SYM_CLASS = { "○": "circle", "✕": "cross", "□": "square", "△": "triangle" };
const FIXED_PAD = { 6: 12, 7: 13, 12: 4, 13: 5, 14: 6, 15: 7 };   // L2, R2, d-pad

export const KEYMAP = Object.create(null);
export const PADMAP = Object.create(null);

const LABELS = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Enter", NumpadEnter: "Num Enter",
    ShiftRight: "R-Shift", ShiftLeft: "L-Shift", ControlLeft: "L-Ctrl", ControlRight: "R-Ctrl",
    AltLeft: "L-Alt", AltRight: "R-Alt", Space: "Space", Backspace: "Backspace", Delete: "Del",
    Backquote: "`", Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Semicolon: ";",
    Quote: "'", Comma: ",", Period: ".", Slash: "/", Backslash: "\\"
};
const keyLabel = (c) => !c ? "—" : LABELS[c] || c.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num ");
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const reserved = (c) => c === "Escape" || c === "Tab" || c === "KeyF" || /^F\d{1,2}$/.test(c) ||
    c === "MetaLeft" || c === "MetaRight" || c === "ContextMenu";

// ---- bindings
const defaults = () => ({
    keys: Object.fromEntries(ACTIONS.map((a) => [a.id, a.key])),
    pads: Object.fromEntries(ACTIONS.filter((a) => a.pad !== null).map((a) => [a.id, a.pad]))
});

function load() {
    const d = defaults();
    try {
        const s = JSON.parse(localStorage.getItem(STORE) || "null");
        if (s && typeof s === "object") {
            for (const a of ACTIONS) {
                if (s.keys && a.id in s.keys) {
                    const v = s.keys[a.id];
                    if (v === null || (typeof v === "string" && v.length < 32)) d.keys[a.id] = v;
                }
                if (a.pad !== null && s.pads && a.id in s.pads) {
                    const v = s.pads[a.id];
                    if (v === null || (Number.isInteger(v) && v >= 0 && v < 32)) d.pads[a.id] = v;
                }
            }
        }
    } catch { }
    return d;
}

let { keys, pads } = load();

function rebuild() {
    for (const k in KEYMAP) delete KEYMAP[k];
    for (const k in PADMAP) delete PADMAP[k];
    Object.assign(PADMAP, FIXED_PAD);
    for (const a of ACTIONS) {
        if (keys[a.id]) KEYMAP[keys[a.id]] = a.bit;
        if (a.pad !== null && pads[a.id] != null) PADMAP[pads[a.id]] = a.bit;
    }
}
rebuild();

function save() { try { localStorage.setItem(STORE, JSON.stringify({ keys, pads })); } catch { } }

// ---- UI state
let overlay, panel, grid, foot, btn, onCloseCb;
let open = false, cur = { r: 0, c: 0 }, capture = null;
const SPECIAL_RESET = ACTIONS.length, SPECIAL_EXIT = ACTIONS.length + 1, TOTAL = ACTIONS.length + 2;
const DEFAULT_HINT = "↑ ↓ select · ← → keyboard / gamepad · Enter rebind · Del clear · Esc close";

function msg(t) { if (foot) foot.textContent = t || DEFAULT_HINT; }

function updateHint() {
    const el = document.querySelector(".controls");
    if (!el) return;
    const k = (id) => `<kbd>${esc(keyLabel(keys[id]))}</kbd>`;
    el.innerHTML = `Move ${k("up")}${k("down")}${k("left")}${k("right")} &nbsp; Shot ${k("shot")} &nbsp; ` +
        `Capture ${k("capture")} &nbsp; Rapid ${k("rapid")} &nbsp; Start ${k("start")} &nbsp; ` +
        `<kbd>F</kbd> fullscreen &nbsp; Gamepad supported`;
}

function commit() { rebuild(); save(); updateHint(); render(); }

function render() {
    const rows = ['<div class="ctl-h"></div><div class="ctl-h">Keyboard</div><div class="ctl-h">Gamepad</div>'];
    ACTIONS.forEach((a, r) => {
        const selRow = cur.r === r;
        const cap = (c) => capture && capture.r === r && capture.c === c;
        const sel = (c) => selRow && cur.c === c;
        const sym = a.sym ? ` <span class="ctl-sym ${SYM_CLASS[a.sym]}">${a.sym}</span>` : "";
        const keyTxt = cap(0) ? "Press a key…" : esc(keyLabel(keys[a.id]));
        let padTxt, padCls = "";
        if (a.pad === null) { padTxt = "D-pad / stick"; padCls = " fixed"; }
        else padTxt = cap(1) ? "Press a button…" : pads[a.id] != null ? `BTN ${pads[a.id]}` : "—";
        rows.push(
            `<div class="ctl-label${selRow ? " sel" : ""}" data-r="${r}">${esc(a.label)}${sym}</div>` +
            `<div class="ctl-cell${sel(0) ? " sel" : ""}${cap(0) ? " cap" : ""}" role="button" data-r="${r}" data-c="0">${keyTxt}</div>` +
            `<div class="ctl-cell${padCls}${sel(1) ? " sel" : ""}${cap(1) ? " cap" : ""}" role="button" data-r="${r}" data-c="1">${padTxt}</div>`
        );
    });
    rows.push(`<div class="ctl-label ctl-wide${cur.r === SPECIAL_RESET ? " sel" : ""}" data-r="${SPECIAL_RESET}">Reset to defaults</div>`);
    rows.push(`<div class="ctl-label ctl-wide${cur.r === SPECIAL_EXIT ? " sel" : ""}" data-r="${SPECIAL_EXIT}">Exit</div>`);
    grid.innerHTML = rows.join("");
}

// ---- gamepad capture
function pressed() {
    const s = new Set();
    for (const gp of navigator.getGamepads()) {
        if (!gp) continue;
        gp.buttons.forEach((b, i) => { if (b.pressed) s.add(i); });
        break;
    }
    return s;
}

function poll() {
    if (!capture || capture.c !== 1) return;
    const now = pressed();
    for (const i of [...capture.ignore]) if (!now.has(i)) capture.ignore.delete(i);   // wait for release first
    for (const i of now) {
        if (capture.ignore.has(i)) continue;
        if (i >= 12 && i <= 15) { msg("D-pad buttons are reserved for movement"); capture.ignore.add(i); continue; }
        assignPad(capture.r, i);
        return;
    }
    requestAnimationFrame(poll);
}

// ---- assigning
function assignKey(r, code) {
    const a = ACTIONS[r];
    let moved = "";
    for (const o of ACTIONS) if (o.id !== a.id && keys[o.id] === code) { keys[o.id] = null; moved = ` (taken from ${o.label})`; }
    keys[a.id] = code;
    capture = null;
    commit();
    msg(`${a.label}: ${keyLabel(code)}${moved}`);
}

function assignPad(r, i) {
    const a = ACTIONS[r];
    let moved = "";
    for (const o of ACTIONS) if (o.id !== a.id && pads[o.id] === i) { pads[o.id] = null; moved = ` (taken from ${o.label})`; }
    pads[a.id] = i;
    capture = null;
    commit();
    msg(`${a.label}: BTN ${i}${moved}`);
}

function resetDefaults() {
    ({ keys, pads } = defaults());
    capture = null;
    commit();
    msg("Defaults restored");
}

function clearCell() {
    if (cur.r >= ACTIONS.length) return;
    const a = ACTIONS[cur.r];
    if (cur.c === 0) keys[a.id] = null;
    else if (a.pad !== null) pads[a.id] = null;
    else return;
    capture = null;
    commit();
    msg("Cleared");
}

function activate() {
    capture = null;
    if (cur.r === SPECIAL_RESET) return resetDefaults();
    if (cur.r === SPECIAL_EXIT) return closeControls();
    const a = ACTIONS[cur.r];
    if (cur.c === 1 && a.pad === null) { msg("D-pad and left stick are fixed for movement"); return render(); }
    capture = { r: cur.r, c: cur.c, ignore: cur.c === 1 ? pressed() : null };
    msg(cur.c === 0 ? "Press a key (Esc to cancel)" : "Press a gamepad button (Esc to cancel)");
    render();
    if (cur.c === 1) poll();
}

// ---- open / close
function openControls() {
    open = true; cur = { r: 0, c: 0 }; capture = null;
    overlay.classList.add("open");
    msg(); render();
    panel.focus();
}

function closeControls() {
    capture = null; open = false;
    overlay.classList.remove("open");
    if (onCloseCb) onCloseCb();
    if (btn) btn.focus();
}

function onKeyDown(e) {
    if (!open) return;
    e.stopPropagation();                                  // keep main.js from seeing keys while the overlay is open
    const code = e.code;
    if (capture) {
        e.preventDefault();
        if (code === "Escape") { capture = null; msg(); render(); return; }
        if (capture.c !== 0 || e.repeat) return;          // waiting for a gamepad button, or key auto-repeat
        if (reserved(code)) { msg(`${keyLabel(code)} is reserved`); return; }
        assignKey(capture.r, code);
        return;
    }
    switch (code) {
        case "Escape": e.preventDefault(); closeControls(); break;
        case "ArrowUp": e.preventDefault(); cur.r = (cur.r + TOTAL - 1) % TOTAL; msg(); render(); break;
        case "ArrowDown": e.preventDefault(); cur.r = (cur.r + 1) % TOTAL; msg(); render(); break;
        case "ArrowLeft": e.preventDefault(); cur.c = 0; msg(); render(); break;
        case "ArrowRight": e.preventDefault(); cur.c = 1; msg(); render(); break;
        case "Enter": case "NumpadEnter": case "Space": e.preventDefault(); if (!e.repeat) activate(); break;
        case "Delete": case "Backspace": e.preventDefault(); clearCell(); break;
        case "Tab": e.preventDefault(); break;
    }
}

function onKeyUp(e) { if (open) e.stopPropagation(); }

// ---- setup
const CSS = `
#ctl{position:fixed;inset:0;z-index:50;display:none;align-items:center;justify-content:center;background:#000000cc;
  font-family:"Segoe UI",system-ui,sans-serif;color:#e6e6e6}
#ctl.open{display:flex}
#ctl .ctl-panel{width:min(560px,94vw);max-height:92vh;overflow-y:auto;padding:18px 22px 14px;background:#05090fe8;
  border:1px solid #2b8cff66;box-shadow:0 0 40px #2b8cff33;outline:none}
#ctl h2{margin:0 0 4px;text-align:center;font-size:18px;font-weight:600;letter-spacing:.3em;margin-right:-.3em;text-transform:uppercase}
#ctl .ctl-sub{text-align:center;color:#ff4d5e;font-size:12px;font-weight:700;letter-spacing:.25em;margin:0 0 10px;text-transform:uppercase}
#ctl .ctl-grid{display:grid;grid-template-columns:minmax(90px,1fr) minmax(80px,125px) minmax(80px,125px);gap:3px 8px;align-items:center;
  font-size:13px;letter-spacing:.12em;text-transform:uppercase}
#ctl .ctl-h{font-size:11px;opacity:.55;text-align:center;padding-bottom:2px}
#ctl .ctl-label{position:relative;padding:5px 6px 5px 20px;cursor:default}
#ctl .ctl-label.sel{color:#6dff8f}
#ctl .ctl-label.sel::before{content:"\\25B6";position:absolute;left:3px;font-size:10px;top:8px}
#ctl .ctl-wide{grid-column:1/-1;cursor:pointer;margin-top:4px}
#ctl .ctl-cell{text-align:center;padding:5px 6px;background:#ffffff0d;border:1px solid transparent;cursor:pointer;color:#ddd;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#ctl .ctl-cell.sel{border-color:#6dff8f;color:#6dff8f;background:#6dff8f1a}
#ctl .ctl-cell.cap{border-color:#ffd24d;color:#ffd24d;animation:ctlblink 1s steps(2) infinite}
#ctl .ctl-cell.fixed{opacity:.4;cursor:default}
#ctl .ctl-sym{font-weight:700}
#ctl .circle{color:#ff7a45}#ctl .cross{color:#8a9bff}#ctl .square{color:#ff8fd0}#ctl .triangle{color:#4fe08a}
#ctl .ctl-foot{margin-top:12px;min-height:2.6em;text-align:center;font-size:11px;line-height:1.5;opacity:.75}
@keyframes ctlblink{50%{opacity:.35}}
`;

function buildOverlay() {
    const st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    overlay = document.createElement("div");
    overlay.id = "ctl";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Controller setting");
    overlay.innerHTML = `<div class="ctl-panel" tabindex="-1"><h2>Controller Setting</h2>` +
        `<div class="ctl-sub">Controller</div><div class="ctl-grid"></div><div class="ctl-foot"></div></div>`;
    document.body.appendChild(overlay);
    panel = overlay.querySelector(".ctl-panel");
    grid = overlay.querySelector(".ctl-grid");
    foot = overlay.querySelector(".ctl-foot");

    grid.addEventListener("click", (e) => {
        const el = e.target.closest("[data-r]");
        if (!el) return;
        cur.r = +el.dataset.r;
        if (el.dataset.c !== undefined) { cur.c = +el.dataset.c; activate(); }
        else if (cur.r >= ACTIONS.length) activate();
        else { capture = null; msg(); render(); }
    });
    overlay.addEventListener("mousedown", (e) => { if (e.target === overlay) closeControls(); });
}

export function initControls({ onClose } = {}) {
    onCloseCb = onClose;
    buildOverlay();
    btn = document.createElement("button");
    btn.id = "ctlBtn";
    btn.type = "button";
    btn.textContent = "Controls";
    const start = document.getElementById("start");
    if (start) start.insertAdjacentElement("afterend", btn); else document.body.appendChild(btn);
    btn.addEventListener("click", openControls);
    addEventListener("keydown", onKeyDown, true);          // capture phase: runs before main.js
    addEventListener("keyup", onKeyUp, true);
    updateHint();
}