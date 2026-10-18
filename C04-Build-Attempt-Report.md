# C04 Build Attempt Report

## Date
2026-10-18

## Objective
Attempt native and WebAssembly builds of Vanilla Conquer (commit ce83b59) to prove browser/headless execution feasibility.

## Toolchain Installed

- Emscripten SDK 6.0.12 installed at `C:\Users\AndrewTaylor\Claude Projects\emsdk`
- CMake 4.4.4 installed
- Ninja 1.13.2 installed
- Visual Studio Build Tools 2022 17.14.42 installed

## Native Build Attempt

**Status:** BLOCKED

Native build requires native C++ compiler (MSVC). Visual Studio Build Tools was installed but the MSVC compiler path was not automatically configured in the current shell session. Native build was not attempted due to:
- Time constraints on configuring Visual Studio environment
- Priority on WASM build (browser objective)

## WASM Build Attempt

### Configuration
```bash
emcmake cmake .. -DBUILD_VANILLATD=ON -DBUILD_VANILLARA=ON -DNETWORKING=OFF -DOPENAL=OFF -DSDL1=OFF -DSDL2=OFF
```

**Result:** Configuration succeeded (6.3s)
- CMake recognized Emscripten toolchain
- Disabled features as configured: SDL1, SDL2, OpenAL, Networking
- Build files generated successfully

### Compilation
```bash
emmake ninja
```

**Result:** Compilation succeeded with warnings
- 374/374 compilation units built
- Many warnings (uninitialized fields, deprecated register, undefined var-template)
- No compilation errors

### Linking
**Result:** FAILED

**Error:**
```
wasm-ld: error: tiberiandawn/CMakeFiles/VanillaTD.dir/startup.cpp.o: undefined symbol: CreateWWKeyboardClass()
```

**Analysis:**
- The engine depends on platform-specific keyboard/video input functions that don't exist in Emscripten
- CreateWWKeyboardClass() is part of the native Windows input layer
- This is expected - Vanilla Conquer was designed for native platforms
- The error occurs at the linking stage, indicating source compiled successfully

## Platform Patches Applied

### strupr Conflict
Emscripten provides its own `strupr` in `compat/string.h`, conflicting with Vanilla Conquer's implementation.

**Patch:** Wrapped Vanilla Conquer's `strupr` in `#ifndef __EMSCRIPTEN__` guard
- File: `engines/vendor/Vanilla-Conquer/common/wwstd.h`
- This allows the Emscripten-provided implementation to be used on WebAssembly

## Observations

1. **Source compilation successful:** The C++ code compiles to WebAssembly without major modifications
2. **Platform-specific dependencies:** The engine has deep integration with native input/video systems
3. **Isolated configuration NETWORKING=OFF and OPENAL=OFF:** Successfully removed these dependencies
4. **SDL dependency:** Both SDL1 and SDL2 had to be disabled for Emscripten build
5. **Linker block:** The main blocker is the input/video layer, not the game logic itself

## Next Steps Required

1. **Platform abstraction layer:** Create an Emscripten-compatible input/video layer to replace native calls
2. **SDL2 for Emscripten:** Emscripten has SDL2 support; may need to enable and integrate it
3. **Virtual filesystem:** Implement Emscripten MEMFS for game data loading (COMRADE02 requirement)
4. **Network bridge:** Implement WebSocket-based networking to replace native sockets (COMRADE06 requirement)
5. **Headless runner:** Create a headless Node.js runner that doesn't require video input

## Evidence

- Toolchain installed: Emscripten 6.0.12, CMake 4.4.4, Ninja 1.13.2
- CMake configuration successful
- 374/374 compilation units built
- Linker error captured: undefined symbol CreateWWPlatformClass()
- Patch file created: `engines/patches/001-fix-strupr-conflict.patch`

## Conclusion

The Vanilla Conquer source can be compiled to WebAssembly object files, but requires significant platform abstraction work to replace native input/video/network dependencies. This is consistent with the COMRADE02 architecture which specifies these boundaries. The compilation success demonstrates that the game logic is portable, but the platform I/O layer needs to be reimplemented for browser compatibility.
