@'
# Silver Hawk Online

A browser frontend with online 2-player co-op for a PlayStation 1 shoot-'em-up, built on the
PCSX-ReARMed libretro core compiled to WebAssembly. Lockstep netcode over WebRTC.

**This repository contains no game data and no BIOS.** You must supply your own BIOS file
and your own disc image (.chd) from a disc you own. They are stored only in your browser.
This project is not affiliated with any game publisher or console maker.

## Contents
- `wrapper/wrapper.c` - thin C wrapper around the libretro core
- `build.ps1` - links the wrapper and core into WebAssembly
- `web/` - frontend (video, audio, input, storage, netcode)
- `cf/` - Cloudflare Worker (static hosting, signaling Durable Object, TURN credentials)
- `server/` - local signaling server for development
- `serve.mjs` - local dev server (never deploy)

## Core
Built from PCSX-ReARMed (libretro fork), commit r26l-119-gc8816799,
https://github.com/libretro/pcsx_rearmed , licensed under the GPL.
Build command:

    make -f Makefile.libretro platform=emscripten DYNAREC=0 HAVE_CHD=1 CC=emcc CXX=em++ AR=emar

## License
Because this project links the GPL-licensed core, it is distributed under the same GPL
terms. See LICENSE.
'@ | Set-Content -Encoding utf8 README.md
## Building
1. Clone the core at the exact commit:

       git clone https://github.com/libretro/pcsx_rearmed core/pcsx_rearmed
       cd core/pcsx_rearmed
       git checkout c8816799b50388e61cfe237fe2cdbb7d8175f20a

2. Build it (command above) and copy `pcsx_rearmed_libretro_emscripten.bc` to `wrapper/libpcsx.a`.
3. Run `build.ps1` to produce `web/wasm/core.mjs` and `core.wasm`.
4. Serve `web/` locally with `node serve.mjs`.

The core is used unmodified. It is licensed under GPL version 2 (see LICENSE).

## Credits
- G-Darius is a work of Taito Corporation. This is an unofficial fan project and is not affiliated with or endorsed by Taito. No game data is included.
- Emulation core: PCSX-ReARMed (libretro fork), GPL.
- PlayStation is a trademark of Sony Interactive Entertainment.
