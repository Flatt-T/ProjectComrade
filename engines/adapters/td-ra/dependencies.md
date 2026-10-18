# Vanilla Conquer Dependencies Analysis

## Cloned Repository

- Repository: TheAssemblyArmada/Vanilla-Conquer
- Location: engines/vendor/vanilla-conquer
- Latest commit: ce83b59 [TD] Additional fixes to teamtype ini loading.
- Date: 2026-10-18 (cloned)

## Build System

- CMake 3.25+
- C++11 standard
- Ninja build tool (for presets)

## Core Dependencies

### Required for Native Build

1. **SDL2 (Simple DirectMedia Layer)**
   - Purpose: Video backend (graphics, input, windowing)
   - Required: YES (SDL2 option ON by default)
   - Alternative: SDL1 (deprecated, OFF by default)
   - Impact for WASM: CRITICAL - SDL2 must be replaced with browser canvas/input APIs

2. **OpenAL**
   - Purpose: Audio backend
   - Required: YES (OPENAL option ON by default)
   - Impact for WASM: CRITICAL - OpenAL must be replaced with Web Audio API

3. **winmm (Windows Multimedia API)**
   - Purpose: Windows-specific multimedia (timers, audio)
   - Required: YES on Windows
   - Impact for WASM: Not applicable on non-Windows, but any Windows-specific code must be abstracted

### Optional/Conditional Dependencies

4. **DirectDraw (DDRAW)**
   - Purpose: Deprecated Windows video backend
   - Required: NO (deprecated, OFF by default)
   - Impact: Can be ignored

5. **DirectSound (DSOUND)**
   - Purpose: Deprecated Windows audio backend
   - Required: NO (deprecated, OFF by default)
   - Impact: Can be ignored

6. **Networking**
   - Purpose: Network play support
   - Required: YES (NETWORKING option ON by default)
   - Implementation: Likely BSD sockets or Windows Sockets (winsock)
   - Impact for WASM: CRITICAL - Native sockets must be replaced with WSS bridge

## Platform-Specific Code

### Windows (WIN32)
- DirectDraw/DSound backends (deprecated)
- winmm library
- Windows-specific defines

### macOS
- App bundle generation
- macdylibbundler for portable bundles

### Linux/BSD
- Standard POSIX APIs

## Architecture Implications for WASM

### Critical Obstacles

1. **SDL2 Dependency**
   - Vanilla Conquer uses SDL2 for all graphics, input, and windowing
   - Emscripten has SDL2 support, but it's a compatibility layer
   - Need to verify Emscripten SDL2 coverage for all Vanilla Conquer usage
   - Alternative: Direct browser canvas/input API integration (more work, better control)

2. **OpenAL Dependency**
   - Vanilla Conquer uses OpenAL for all audio
   - Emscripten has OpenAL support via Web Audio API
   - Need to verify Emscripten OpenAL implementation compatibility

3. **Networking**
   - Vanilla Conquer uses native sockets for multiplayer
   - Emscripten networking is WebSocket-only, not raw TCP/UDP
   - Must implement WSS bridge to replace native socket calls
   - This requires significant engine modification at the network boundary

4. **Filesystem**
   - Vanilla Conquer expects native filesystem access for game data
   - Emscripten provides EMFS (in-memory filesystem)
   - Game data (MIX files, etc.) must be loaded into EMFS before execution
   - This impacts asset loading and pack design

### Moderate Obstacles

5. **Timers and Clocks**
   - Vanilla Conquer uses native timing for simulation tick rate
   - Emscripten has its own timing model
   - Must ensure deterministic tick rate across browser and headless

6. **Thread Model**
   - Vanilla Conquer may use threading (not yet audited)
   - Emscripten pthreads require SharedArrayBuffer and special headers
   - Single-threaded model preferred for simpler deployment

### Minor Obstacles

7. **Window Management**
   - Vanilla Conquer manages its own window
   - Browser embedding requires canvas integration
   - Should be manageable with SDL2/Emscripten

## Current Assessment

### Native Build Feasibility: HIGH
- All required dependencies are standard
- CMake build system works on Windows/Linux/macOS
- Build instructions are clear and tested

### WASM Build Feasibility: MEDIUM-HIGH with significant work
- Emscripten has SDL2 and OpenAL support
- Networking is the biggest obstacle (socket → WSS bridge)
- Filesystem abstraction required (EMFS)
- Requires substantial engine boundary modifications

### Headless Build Feasibility: MEDIUM
- Can use Emscripten with null graphics/audio stubs
- Simulation logic should remain intact
- Still requires networking and filesystem work

## Next Steps for Spike

1. Attempt native build on Windows to verify build system works
2. Audit Vanilla Conquer source for specific SDL2/OpenAL usage patterns
3. Audit networking implementation (locate socket code)
4. Test Emscripten SDL2 compatibility with minimal test
5. Design WSS bridge architecture
6. Estimate effort for full WASM port

## Blockers

- No Emscripten SDK installed yet
- No actual game data for testing (blocked by C02 reference builds)
- Networking architecture not designed
- WSS bridge not implemented
- Filesystem loading strategy not defined
