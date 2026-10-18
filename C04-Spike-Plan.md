# C04 Spike Plan: Vanilla Conquer Native, WebAssembly and Headless Execution

## Objective

Prove that the selected Vanilla Conquer preservation fork can run:
1. Natively (baseline)
2. In WebAssembly in the browser
3. Headless under Node.js

## Read

- COMRADE01 engine matrix (S04 Vanilla Conquer)
- COMRADE02 port sequence/ABI
- COMRADE08 verification requirements

## Candidate

TheAssemblyArmada/Vanilla-Conquer preservation fork:
- URL: https://github.com/TheAssemblyArmada/Vanilla-Conquer
- Licence: vanilla/License.txt
- Note: Browser/headless compatibility NOT proved yet

## Spike Tasks

### Phase 1: Native Build (Baseline)

1. Clone Vanilla Conquer repository to `engines/vendor/vanilla-conquer`
2. Pin specific commit (to be determined)
3. Understand build system (likely CMake or custom make)
4. Set up native build environment
5. Build TD and RA executables
6. Inventory dependencies:
   - OS-specific calls
   - Video/graphics (DirectDraw, SDL, etc.)
   - Audio (DirectSound, etc.)
   - Filesystem I/O
   - Timing (clocks, timers)
   - Socket/network calls
   - Undefined behaviour/platform assumptions
7. Document all dependencies in `engines/adapters/td-ra/dependencies.md`

### Phase 2: Emscripten Setup

1. Install Emscripten SDK
2. Configure emcc
3. Test basic WASM compilation
4. Document Emscripten version and configuration

### Phase 3: Platform Shims

1. Implement minimal browser platform shims:
   - Filesystem (EMFS)
   - Audio (Web Audio API bridge)
   - Input (keyboard/mouse to WASM)
   - Graphics (canvas or OffscreenCanvas)
   - Timing (browser clock vs. native clock)
2. Replace network calls at boundary:
   - Original socket calls → WSS bridge
   - Keep original game logic unchanged
3. Implement bounded simulation stepping:
   - Tick-based simulation loop
   - Stop after N ticks for testing
4. Implement worker host:
   - Web Worker hosting WASM module
   - Message passing for commands
5. Record every changed file and why in `engines/adapters/td-ra/changes.md`

### Phase 4: WASM Build

1. Compile Vanilla Conquer with Emscripten
2. Link platform shims
3. Generate .wasm and .js loader
4. Measure:
   - WASM binary size
   - Memory allocation
   - Asset loading time
5. Document build commands in `engines/adapters/td-ra/build-wasm.md`

### Phase 5: Headless Build

1. Compile Vanilla Conquer for Node.js WASM runtime
2. Remove graphics/audio dependencies (or use null stubs)
3. Preserve simulation logic
4. Test with fixture scenarios
5. Document build commands in `engines/adapters/td-ra/build-headless.md`

### Phase 6: Testing

Acceptance criteria from THU-1335:
- A real scenario in each title (TD, RA1) loads
- Accepts move/build/attack orders
- Reaches a valid end in browser and headless runner
- Main page remains responsive
- No native app, DOS emulator, stream or original socket proxy required
- Engine runs without rendering/audio on the server
- WASM compilation, memory allocation and asset loading are measured
- Native/reference smoke fixtures expose any changed outcomes

## Evidence Required

- Commit/toolchain hashes
- Reproducible commands
- Browser recording (screenshot/video)
- Headless logs
- Binary sizes
- Dependency/licence audit
- ADR pass/fail decision

## Blockers

If port viability or required API separation fails:
- Document concrete obstacles/options
- Keep dependent tasks blocked
- Do not implement generic JS RTS when spike is difficult

## Next Steps

Start with Phase 1: Clone and build Vanilla Conquer natively to understand the codebase and dependencies.
