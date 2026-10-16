<!doctype html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>G-Darius Online</title>
    <link rel="icon" href="./icon.ico" sizes="any">
    <style>
        :root {
            --fg: #9fd3ff;
            --accent: #2b8cff;
            --ok: #6dffb0;
            --bg: #000;
        }

        * {
            box-sizing: border-box;
        }

        html,
        body {
            margin: 0;
            height: 100%;
            background: var(--bg);
            color: var(--fg);
            font-family: "Segoe UI", system-ui, sans-serif;
            overflow: hidden;
        }

        #title {
            position: fixed;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 8px;
            background: radial-gradient(ellipse at 50% 65%, #0b2540 0%, #000 70%);
            overflow-y: auto;
        }

        #bg {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        #title> :not(#bg) {
            position: relative;
            z-index: 1;
        }

        #logo {
            width: clamp(350px, 80vw, 900px);
            height: auto;
            max-height: 44vh;
            object-fit: contain;
            filter: drop-shadow(0 0 22px #2b8cff88);
            user-select: none;
            -webkit-user-drag: none;
        }

        .sub {
            margin-top: -12px;
            font-size: 10px;
            letter-spacing: .4em;
            margin-right: -.4em;
            opacity: .65;
            text-transform: uppercase;
        }

        button,
        .filebtn {
            font: inherit;
            font-size: 14px;
            letter-spacing: .25em;
            padding: 8px 20px;
            color: var(--fg);
            background: #2b8cff14;
            border: 1px solid var(--accent);
            cursor: pointer;
            text-transform: uppercase;
            transition: background .15s, box-shadow .15s;
        }


        button:hover:not(:disabled),
        .filebtn:hover {
            background: #2b8cff40;
            box-shadow: 0 0 16px #2b8cff66;
        }

        button:disabled {
            opacity: .35;
            cursor: default;
        }

        button:focus-visible,
        .filebtn:focus-within,
        #room:focus-visible {
            outline: 2px solid var(--fg);
            outline-offset: 3px;
        }

        #setup {
            display: grid;
            grid-template-columns: auto auto;
            gap: 4px 12px;
            align-items: center;
            font-size: 12px;
            padding: 6px 12px;
            border: 1px solid #2b8cff44;
            background: #00000066;
        }

        .state {
            text-align: right;
            opacity: .7;
        }

        .state.ok {
            color: var(--ok);
            opacity: 1;
        }

        .filebtn {
            font-size: 12px;
            padding: 7px 16px;
            letter-spacing: .15em;
            text-align: center;
        }

        .filebtn input {
            position: absolute;
            width: 1px;
            height: 1px;
            opacity: 0;
            overflow: hidden;
        }

        .note {
            grid-column: 1 / -1;
            text-align: center;
            opacity: .55;
            font-size: 12px;
        }

        .row {
            display: flex;
            gap: 10px;
            align-items: stretch;
            flex-wrap: wrap;
            justify-content: center;
        }

        #room {
            font: inherit;
            font-size: 16px;
            padding: 10px 12px;
            background: #000;
            color: var(--fg);
            border: 1px solid var(--accent);
            width: 150px;
            text-align: center;
            letter-spacing: .1em;
        }

        #status {
            min-height: 1.4em;
            font-size: 14px;
            opacity: .85;
            text-align: center;
            max-width: 90vw;
        }

        .controls,
        #footer {
            font-size: 10px;
            line-height: 1.4;
        }

        kbd {
            border: 1px solid #2b8cff66;
            border-radius: 3px;
            padding: 0 5px;
            font: 11px monospace;
        }

        #footer {
            position: absolute;
            left: 0;
            right: 0;
            bottom: 3px;
            padding: 0 12px;
            text-align: center;
            font-size: 11px;
            opacity: .55;
            line-height: 1.6;
        }

        #footer a {
            color: var(--fg);
        }

        #screen {
            display: none;
            position: fixed;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            image-rendering: pixelated;
            width: min(100vw, 133.333vh);
            height: min(75vw, 100vh);
            background: #000;
        }

        #hud {
            position: fixed;
            left: 8px;
            top: 6px;
            font: 12px monospace;
            color: var(--fg);
            opacity: .8;
            pointer-events: none;
        }

        [hidden] {
            display: none !important;
        }

        #room {
            text-transform: uppercase;
        }

        #lobby {
            display: flex;
            flex-direction: column;
            align-items: center;
        }

        .lobpane {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
            padding: 10px 22px;
            min-width: min(92vw, 360px);
            border: 1px solid #2b8cff44;
            background: #00000066;
            text-align: center;
        }

        .lobor {
            font-size: 11px;
            opacity: .6;
            letter-spacing: .15em;
            text-transform: uppercase;
        }

        #lobCode {
            font-size: 30px;
            letter-spacing: .35em;
            margin-right: -.35em;
            color: var(--ok);
        }

        #lobLink {
            font: 11px monospace;
            opacity: .6;
            user-select: all;
            word-break: break-all;
        }

        #lobInfo {
            font-size: 13px;
            min-height: 1.4em;
        }

        #lobMsg {
            font-size: 13px;
            color: #ff9b9b;
            min-height: 1.2em;
        }

        #gone {
            position: fixed;
            inset: 0;
            z-index: 5;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            background: #000000d9;
            text-align: center;
        }

        #gone .big {
            font-size: 18px;
            letter-spacing: .2em;
            text-transform: uppercase;
        }
    </style>
</head>

<body>
    <div id="title">
        <canvas id="bg"></canvas>
        <img id="logo" src="./logo.png" alt="G-Darius" draggable="false">
        <div class="sub">Online Co-op</div>

        <div id="setup">
            <div id="biosState" class="state">BIOS: not added</div>
            <label class="filebtn">Add BIOS <input type="file" id="biosFile" accept=".bin"></label>
            <div id="discState" class="state">Disc: not added</div>
            <label class="filebtn">Add disc <input type="file" id="discFile" accept=".chd"></label>
            <div class="note">Files stay in this browser. Never uploaded.</div>
        </div>

        <button id="start">Start (solo)</button>

        <div class="row" id="menuRow">
            <button id="online">Co-op Online</button>
        </div>

        <div id="lobby" hidden>
            <div id="lobHome" class="lobpane" hidden>
                <button id="lobCreate">Create game</button>
                <div class="lobor">or join with a code</div>
                <div class="row">
                    <input id="room" placeholder="code" maxlength="24" autocomplete="off" spellcheck="false">
                    <button id="lobJoin">Join</button>
                </div>
                <div id="lobMsg"></div>
                <button id="lobBack">Back</button>
            </div>
            <div id="lobWait" class="lobpane" hidden>
                <div id="lobCode"></div>
                <div id="lobLink"></div>
                <button id="lobCopy">Copy invite link</button>
                <div id="lobInfo"></div>
                <div class="row">
                    <button id="lobReady" hidden>Ready</button>
                    <button id="lobCancel">Cancel</button>
                </div>
            </div>
        </div>

        <div id="status"></div>

        <div class="controls">
            <kbd>Arrows</kbd> move &nbsp; <kbd>Z</kbd> <kbd>X</kbd> <kbd>A</kbd> <kbd>S</kbd> buttons &nbsp;
            <kbd>Enter</kbd> start &nbsp; <kbd>F</kbd> fullscreen &nbsp; Gamepad supported
        </div>

        <div id="footer">
            G-Darius is a work of Taito Corporation. This is an unofficial fan project, not affiliated with or endorsed
            by Taito.<br>Bring your own BIOS and disc. No game files are included or hosted here.<br>
            Built on PCSX-ReARMed (GPL-2.0).
            <a href="https://github.com/Duuustyyy/g-darius-online" target="_blank" rel="noopener">Source code
                (GPL-2.0)</a>
        </div>
    </div>

    <canvas id="screen" width="320" height="240"></canvas>
    <div id="hud"></div>
    <div id="gone" hidden>
        <div class="big">The other player disconnected</div>
        <button id="goneBtn">Back to lobby</button>
    </div>

    <script>
        // Green status when a file is added (works with whatever text main.js writes)
        for (const id of ["biosState", "discState"]) {
            const el = document.getElementById(id);
            const sync = () => el.classList.toggle("ok", !/not added/i.test(el.textContent));
            new MutationObserver(sync).observe(el, { childList: true, characterData: true, subtree: true });
            sync();
        }

        // Starfield: the view turns about the vertical axis inside a sphere of stars (stars drift right).
        // Pinhole perspective, so stars move a bit faster near the screen edges.
        // Each star has a distance: far = tiny, dim, slow (most stars); near = bigger, brighter, faster (few).
        (() => {
            const c = document.getElementById("bg");
            const title = document.getElementById("title");
            const ctx = c.getContext("2d");
            const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

            const YAW = 0.05;        // rad/s for the NEAREST stars (the video measured 0.068); lower = slower
            const FAR_SPEED = 0.45;  // speed of the farthest stars relative to the nearest
            const FOCAL = 0.74;      // focal length as a multiple of screen width (about 68 deg FOV)
            const N = 1300;          // stars on the whole sphere
            const BRIGHT = 1.0;      // overall brightness multiplier
            const DISTANCE = 1.0;    // global distance: 1 = as now, 2 = twice as far (smaller, dimmer, slower), 0.5 = closer
            const FAR_BIAS = 0.35;   // lower = more stars pushed into the distance (0.35 = most are far)
            const FAR_SIZE = 0.4;    // size of the farthest stars relative to the nearest
            const FAR_DIM = 2.5;     // brightness of the farthest stars relative to the nearest

            // measured mix: ~45% yellow-green, ~40% grey-white, rest purple-grey
            const COLORS = [[225, 255, 70], [255, 255, 255], [205, 195, 255]];
            const pick = () => { const r = Math.random(); return r < 0.45 ? 0 : r < 0.88 ? 1 : 2; };

            const stars = Array.from({ length: N }, () => {
                const Y = Math.random() * 2 - 1;
                const a = Math.random() * Math.PI * 2;
                const r = Math.sqrt(1 - Y * Y);
                const dist = Math.pow(Math.random(), FAR_BIAS);   // 0 = near, 1 = far
                const near = 1 - dist;
                return {
                    a0: a, Y, r,
                    col: COLORS[pick()],
                    al: (0.2 + Math.random() * 0.25) * (FAR_DIM + (1 - FAR_DIM) * near),
                    mul: FAR_SPEED + (1 - FAR_SPEED) * near,
                    sz: FAR_SIZE + (1 - FAR_SIZE) * near
                };
            });

            let w = 0, h = 0, F = 0, base = 3, t = 0, last = 0;

            function resize() {
                const dpr = Math.min(devicePixelRatio || 1, 2);
                w = c.clientWidth; h = c.clientHeight;
                c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                F = FOCAL * Math.max(w, h * 4 / 3);
                base = Math.min(4, Math.max(2, Math.round(w / 400)));
            }

            function draw() {
                ctx.clearRect(0, 0, w, h);
                for (const s of stars) {
                    const ang = s.a0 + (YAW / DISTANCE) * s.mul * t;
                    const X = s.r * Math.sin(ang);     // increasing angle moves stars to the right
                    const Z = s.r * Math.cos(ang);
                    if (Z < 0.05) continue;            // behind the viewer
                    const k = F / Z;
                    const size = Math.max(1, Math.round(base * s.sz / DISTANCE));
                    const sx = Math.round(w / 2 + X * k);
                    const sy = Math.round(h / 2 + s.Y * k);
                    if (sx < -size || sx > w || sy < -size || sy > h) continue;
                    ctx.fillStyle = `rgba(${s.col[0]},${s.col[1]},${s.col[2]},${Math.min(1, s.al * BRIGHT / DISTANCE)})`;
                    ctx.fillRect(sx, sy, size, size);
                }
            }

            function frame(now) {
                if (!still) requestAnimationFrame(frame);
                const dt = Math.min(0.1, (now - last) / 1000 || 0);
                last = now;
                if (document.hidden || getComputedStyle(title).display === "none") return;
                t += dt;
                draw();
            }

            addEventListener("resize", () => { resize(); draw(); });
            resize();
            draw();
            if (!still) requestAnimationFrame(frame);
        })();
    </script>
    <script type="module" src="./main.js"></script>
</body>

</html>