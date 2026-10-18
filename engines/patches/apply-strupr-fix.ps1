# Apply strupr Emscripten compatibility fix
# This script adds #ifndef __EMSCRIPTEN__ guard around strupr function

$wwstdPath = "engines\vendor\Vanilla-Conquer\common\wwstd.h"
$content = Get-Content $wwstdPath -Raw

# Find the strupr function and wrap it
$content = $content -replace "(inline static char\* strupr\(char\* str\))([\s\S]*?return ret;`n})", "#ifndef __EMSCRIPTEN__`n`$1`$2`n#endif"

Set-Content $wwstdPath $content -NoNewline
Write-Host "Applied strupr Emscripten compatibility fix to $wwstdPath"
