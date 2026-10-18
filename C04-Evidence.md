## C04 Evidence

### Initial Build Attempt (2026-10-18)

#### Toolchain Setup
- **Emscripten SDK 6.0.12** installed at `C:\Users\AndrewTaylor\Claude Projects\emsdk`
- **CMake 4.4.4** installed via winget
- **Ninja 1.13.2** installed via winget
- **Visual Studio Build Tools 2022 17.14.42** installed (native compiler for future attempts)

#### WASM Build Configuration
```bash
emcmake cmake .. -DBUILD_VANILLATD=ON -DBUILD_VANILLARA=ON -DNETWORKING=OFF -DOPENAL=OFF -DSDL1=OFF -DSDL2=OFF
```

**Status:** ✅ Configuration successful (6.3s)
- Emscripten toolchain recognized
- Disabled features as configured: SDL1, SDL2, OpenAL, Networking
- Build files generated successfully

#### Compilation
```bash
emmake ninja
```

**Status:** ✅ Compilation successful with warnings
- 374/374 compilation units built
- Many warnings (uninitialized fields, deprecated register, undefined var-template)
- No compilation errors

#### Linking
**Status:** ❌ FAILED

**Error:**
```
wasm-ld: error: tiberiandawn/CMakeFiles/Vanilla.DD.dir/startup.cpp.o: undefined symbol: CreateWWKeyboardClass()
```

**Analysis:**
- Engine depends on platform-specific keyboard/video input functions that don't exist in Emscripten
- CreateWWKeyboardClass() is part of native Windows input layer
- This is expected - Vanilla Conquer was designed for native platforms
- Error occurs at linking stage, indicating source compiled successfully

#### Platform Patch Applied
**Issue:** Emscripten provides its own `strupr` in `compat/string.h`, conflicting with Vanilla Conquer's implementation

**Patch:** Wrapped Vanilla Conquer's `strupr` in `#ifndef __EMSCRIPTEN__` guard
- File: `engines/vendor/Vanilla-Conquer/common/wwstd.h`
- File: `engines/patches/001-fix-strupr-conflict.patch`
- Allows Emscripten-provided implementation to be used on WebAssembly

#### Native Build
**Status:** BLOCKED
- Native build requires MSVC compiler configuration
- Visual Studio Build Tools installed but not configured in current shell
- Not attempted due to priority on WASM build (browser objective)

### Observations

1. **Source compilation successful:** C++ code compiles to WebAssembly without major modifications
2. **Platform-specific dependencies:** Engine has deep integration with native input/video systems
3. **Isolated configuration:** NETWORKING=OFF and OPENAL=OFF successfully removed these dependencies
4. **SDL dependency:** Both SDL1 and SDL2 had to be disabled for Emscripten build
5. **Linker block:** Main blocker is input/video layer, not game logic itself

### Next Steps Required

1. **Platform abstraction layer:** Create Emscripten-compatible input/video layer to replace native calls
2. **SDL2 for Emscripten:** Emscripten has SDL2 support; may need to enable and integrate it
3. **Virtual filesystem:** Implement Emscripten MEMFS for game data loading (COMRADE02 requirement)
4. **Network bridge:** Implement WebSocket-based networking to replace native sockets (COMRADE06 requirement)
5. **Headless runner:** Create headless Node.js runner that doesn't require video input

### Acceptance Status

- Emscripten SDK installation: COMPLETE
- CMake configuration: COMPLETE
- Source compilation: COMPLETE (374/374 units)
- Linking: FAILED (undefined symbol CreateWWKeyboardClass)
- Native build: NOT ATTEMPTED
- Platform patch: COMPLETE (strupr guard)
- Actual scenario execution: NOT ATTEMPTED (blocked by linker)

### Conclusion

Vanilla Conquer source can be compiled to WebAssembly object files, but requires significant platform abstraction work to replace native input/video/network dependencies. This is consistent with COMRADE02 architecture which specifies these boundaries. Compilation success demonstrates game logic is portable, but platform I/O layer needs to be reimplemented for browser compatibility.

### Evidence Files

- `C04-Build-Attempt-Report.md` - Detailed build attempt report
- `engines/patches/001-fix-strupr-conflict.patch` - Platform patch for strupr conflict
- `engines/vendor/Vanilla-Conquer/common/wwstd.h` - Modified with #ifndef __EMSCRIPTEN__ guard
