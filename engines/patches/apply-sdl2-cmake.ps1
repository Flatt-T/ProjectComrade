# Apply Emscripten SDL2 CMake fix
# This script modifies CMakeLists.txt to handle Emscripten's built-in SDL2

$cmakePath = "engines\vendor\Vanilla-Conquer\CMakeLists.txt"
$content = Get-Content $cmakePath -Raw

# Find and replace the SDL2 section
$oldSdl2 = @'
if(SDL2)
    message("Find path is ${CMAKE_FIND_ROOT_PATH}")
    find_package(SDL2 REQUIRED)
    list(APPEND VANILLA_LIBS ${SDL2_LIBRARY})
    include_directories(${SDL2_INCLUDE_DIR})

    # winuser.h defines VK_ macros but it can be prevented
    if(WIN32)
        add_definitions(-DNOVIRTUALKEYCODES)
    endif()
    set(DDRAW OFF)
endif()
'@

$newSdl2 = @'
if(SDL2)
    message("Find path is ${CMAKE_FIND_ROOT_PATH}")
    
    # Emscripten provides SDL2 in its sysroot
    if(EMSCRIPTEN)
        message("Using Emscripten's built-in SDL2")
        # Emscripten requires -sUSE_SDL=2 during compilation and linking
        add_compile_options("-sUSE_SDL=2")
        add_link_options("-sUSE_SDL=2")
    else()
        find_package(SDL2 REQUIRED)
        list(APPEND VANILLA_LIBS ${SDL2_LIBRARY})
        include_directories(${SDL2_INCLUDE_DIR})
    endif()

    # winuser.h defines VK_ macros but it can be prevented
    if(WIN32)
        add_definitions(-DNOVIRTUALKEYCODES)
    endif()
    set(DDRAW OFF)
endif()
'@

if ($content -match [regex]::Escape($oldSdl2)) {
    $content = $content -replace [regex]::Escape($oldSdl2), $newSdl2
    Set-Content $cmakePath $content -NoNewline
    Write-Host "Applied Emscripten SDL2 CMake fix to $cmakePath"
} else {
    Write-Host "SDL2 section not found in expected format or already applied"
}
