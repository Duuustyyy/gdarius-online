$ErrorActionPreference = "Stop"
$root = "C:\Users\prueb\Downloads\gdarius-web"
$dist = "$root\cf\dist"
Remove-Item $dist -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory "$dist\wasm" | Out-Null
foreach ($f in @("index.html", "main.js", "net.js", "storage.js", "controls.js", "logo.png", "icon.ico")) {
  Copy-Item "$root\web\$f" $dist
}
Copy-Item "$root\web\wasm\core.mjs" "$dist\wasm"
Copy-Item "$root\web\wasm\core.wasm" "$dist\wasm"

Get-ChildItem $dist -Recurse -File | ForEach-Object {
  "{0}  {1:N2} MB" -f $_.FullName, ($_.Length / 1MB)
}
$bad = Get-ChildItem $dist -Recurse -File | Where-Object { $_.Extension -in ".chd", ".bin", ".cue", ".json" }
if ($bad) { throw "disc, BIOS or recording found in dist" }

Set-Location "$root\cf"
npx wrangler deploy