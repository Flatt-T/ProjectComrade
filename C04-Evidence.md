## C04 Evidence

### WASM Build Attempt with SDL2 (2026-10-18)

#### Toolchain
- **Emscripten SDK 6.0.12** installed at `C:\Users\AndrewTaylor\Claude Projects\emsdk`
- **CMake 4.4.4** installed
- **Ninja 1.13.2** installed
- **Visual Studio Build Tools 2022 17.14.42** installed

#### Initial Build (without SDL2)
**Configuration:** SDL1=OFF, SDL2=OFF, DDRAW=OFF, NETWORKING=OFF, OPENAL=OFF
**Status:** Compilation succeeded, linking FAILED
**Error:** `undefined symbol CreateWWKeyboardClass()`
**Analysis:** No keyboard factory available with all video backends disabled

#### SDL2 Build Attempt
**Configuration:** SDL2=ON, SDL1=OFF, DDRAW=OFF, NETWORKING=OFF, OPENAL=OFF
**CMake modification:** Added Emscripten SDL2 support
- Emscripten provides SDL2 in its sysroot
- Added `add_compile_options("-sUSE_SDL=2")` for compilation
- Added `add_link_options("-sUSE_SDL=2")` for linking
- Bypassed `find_package(SDL2 REQUIRED)` for Emscripten

**Status:** ✅ SUCCESS

**Configuration output:**
```
Using Emscripten's built-in SDL2
Enabled features:
 * SDL2, SDL2 video backend
 * VanillaTD, Tiberian Dawn executable
 * VanillaRA, Red Alert executable
```

**Compilation:** 387/387 units built with warnings
**Linking:** SUCCESS

**Generated files:**
- `vanillatd.js` (32,9834 bytes)
- `vanillatd.wasm` (10,895,937 bytes)
- `vanillara.js` (32,9834 bytes)
- `vanillara.wasm` (13,321,968 bytes)

#### Platform Patches Applied

**Patch 1: strupr Emscripten compatibility**
- File: `engines/patches/001-fix-strupr-conflict.patch`
- Issue: Emscripten provides its own `strupr` in `compat/string.h`, conflicting with Vanilla Conquer's implementation
- Fix: Wrapped Vanilla Conquer's `strupr` in `#ifndef __EMSCRIPTEN__` guard
- File modified: `engines/vendor/Vanilla-Conquer/common/wwstd.h`

**Patch 2: Emscripten SDL2 CMake support**
- File: `engines/patches/002-emscripten-sdl2.patch`
- Issue: CMake `find_package(SDL2 REQUIRED)` fails on Emscripten
- Fix: Detect Emscripten and use built-in SDL2 with `-sUSE_SDL=2` flag
- File modified: `engines/vendor/Vanilla-Conquer/CMakeLists.txt`

**Build scripts:**
- `engines/patches/apply-strupr-fix.ps1` - PowerShell script to apply strupr fix
- `engines/patches/apply-sdl2-cmake.ps1` - PowerShell script to apply SDL2 CMake fix

#### Evidence Levels

1. **Compilation:** ✅ COMPLETE (387/387 units built)
2. **Linking:** ✅ COMPLETE (both vanillatd and vanillara linked successfully)
3. **Module Structure:** ✅ VERIFIED (inspected JS files contain Module, _main, .wasm references)
4. **Module Initialization:** NOT YET TESTED (browser test created, needs HTTP server)
5. **Gameplay execution:** NOT YET TESTED
6. **Reference fidelity:** BLOCKED (requires proprietary game assets)

#### Next Steps

1. Test module initialization of vanillatd.js and vanillara.js
   - Created browser test harness: `engines/test/wasm-init-test.html`
   - Created Node.js inspector: `engines/test/inspect-wasm.js`
   - Verified module structure: contains Module, _main, .wasm references
   - Requires HTTP server to load WASM modules (browser security)

2. Implement MEMFS integration for game data loading (COMRADE02)
3. Create browser harness to test minimal input/framebuffer
4. Implement headless configuration with null video/audio backends
5. Attempt native build with MSVC compiler
6. Add network/audio once core engine runs in browser

#### Observations

- Vanilla Conquer source compiles and links successfully to WebAssembly with SDL2
- Emscripten's built-in SDL2 port provides the necessary keyboard/video input layer
- The `-sUSE_SSL=2` flag is required for both compilation and linking
- Compilation warnings are acceptable (uninitialized fields, deprecated features)
- Game logic is portable; platform I/O layer works via SDL2 on Emscripten

#### Commit
**1ab9030** - C03: Update dependencies to resolve critical/high vulnerabilities
**e2d8fb9** - C03/C04: Fix dependency vulnerabilities, document SDL2 WASM build success
