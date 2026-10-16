$ErrorActionPreference = "Stop"
$root = "C:\Users\prueb\Downloads\gdarius-web"
$core = "$root\core\pcsx_rearmed"
$env:EMSDK_QUIET = "1"
& C:\emsdk\emsdk_env.ps1

New-Item -ItemType Directory -Force "$root\web\wasm" | Out-Null
Copy-Item "$core\pcsx_rearmed_libretro_emscripten.bc" "$root\wrapper\libpcsx.a" -Force

emcc "$root\wrapper\wrapper.c" "$root\wrapper\libpcsx.a" `
  -I "$core\deps\libretro-common\include" `
  -O2 -msimd128 "-sUSE_ZLIB=1" `
  "-sALLOW_MEMORY_GROWTH=1" "-sINITIAL_MEMORY=64MB" "-sSTACK_SIZE=2MB" `
  "-sMODULARIZE=1" "-sEXPORT_ES6=1" "-sEXPORT_NAME=createCore" `
  "-sEXPORTED_FUNCTIONS=_malloc,_free" `
  "-sEXPORTED_RUNTIME_METHODS=FS,HEAPU8" `
  "-sENVIRONMENT=web,worker,node" `
  "-lnodefs.js" `
  -o "$root\web\wasm\core.mjs"

if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED" -ForegroundColor Red; exit 1 }
Write-Host "OK -> $root\web\wasm\core.mjs" -ForegroundColor Green
