# Apply Emscripten SDL2 CMake fix
# This script modifies CMakeLists.txt to handle Emscripten's built-in SDL2

$cmakePath = "engines\vendor\Vanilla-Conquer\CMakeLists.txt"
$lines = Get-Content $cmakePath

$inSdl2 = $false
$sdl2Start = -1
$sdl2End = -1

for ($i = 0; $i -lt $lines.Count; $i++) {
    $line = $lines[$i]
    
    if ($line -match "^if\(SDL2\)" -and !$inSdl2) {
        $inSdl2 = $true
        $sdl2Start = $i
    }
    
    if ($inSdl2 -and $line -match "^endif\(\)") {
        $sdl2End = $i
        $inSdl2 = $false
        break
    }
}

if ($sdl2Start -ge 0 -and $sdl2End -ge 0) {
    $newLines = @()
    $newLines += $lines[0..($sdl2Start)]
    $newLines += "    message(`"Find path is `${CMAKE_FIND_ROOT_PATH}`")"
    $newLines += "    "
    $newLines += "    # Emscripten provides SDL2 in its sysroot"
    $newLines += "    if(EMSCRIPTEN)"
    $newLines += "        message(`"Using Emscripten's built-in SDL2`")"
    $newLines += "        # Emscripten requires -sUSE_SDL=2 during compilation and linking"
    $newLines += "        add_compile_options(`"-sUSE_SDL=2`")"
    $newLines += "        add_link_options(`"-sUSE_SDL=2`")"
    $newLines += "    else()"
    $newLines += "        find_package(SDL2 REQUIRED)"
    $newLines += "        list(APPEND VANILLA_LIBS `${SDL2_LIBRARY}`)"
    $newLines += "        include_directories(`${SDL2_INCLUDE_DIR}`)"
    $newLines += "    endif()"
    $newLines += $lines[($sdl2Start+1)..($sdl2End)]
    $newLines += $lines[($sdl2End+1)..($lines.Count-1)]
    
    $newLines | Out-File $cmakePath -Encoding UTF8
    Write-Host "Applied Emscripten SDL2 CMake fix to $cmakePath"
} else {
    Write-Host "Could not find SDL2 section"
}
