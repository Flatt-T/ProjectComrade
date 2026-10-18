# C04 Blocker Report: Vanilla Conquer WASM Port

## Status: BLOCKED - Multiple obstacles require resolution before spike can proceed

## Completed Work

### Repository Cloned
- Successfully cloned TheAssemblyArmada/Vanilla-Conquer to engines/vendor/vanilla-conquer
- Latest commit: ce83b59 [TD] Additional fixes to teamtype ini loading.
- Repository structure analyzed: tiberiandawn/, redalert/, common/, cmake/, tools/, tests/

### Dependencies Analyzed
Created `engines/adapters/td-ra/dependencies.md` documenting:
- **SDL2**: Critical for graphics/input/windowing (required)
- **OpenAL**: Critical for audio (required)
- **Networking**: Native sockets for multiplayer (required)
- **winmm**: Windows multimedia (Windows-specific)
- **Filesystem**: Native filesystem access for game data

### Build System Understood
- CMake 3.25+ with C++11 standard
- Ninja build tool for presets
- Cross-platform support (Windows/Linux/macOS/BSD)
- Clear build instructions in README

## Blockers

### BLOCKER 1: Emscripten SDK Not Installed
- **Impact**: Cannot compile any WASM code
- **Required**: Emscripten SDK installation and configuration
- **Estimated effort**: 1-2 hours for setup and basic test
- **Action required**: Install Emscripten SDK, test basic WASM compilation

### BLOCKER 2: No Game Data for Testing
- **Impact**: Cannot test actual gameplay scenarios
- **Root cause**: C02 reference builds are blocked awaiting owner-provided verified binaries
- **Required**: Approved TD and RA1 game data (MIX files, etc.)
- **Estimated effort**: Blocked until owner provides reference builds
- **Action required**: Complete C02 with actual hash values before C04 can proceed with full testing

### BLOCKER 3: Network Bridge Architecture Not Designed
- **Impact**: Cannot replace native sockets with WSS
- **Root cause**: Vanilla Conquer uses native BSD sockets/Winsock
- **Emscripten limitation**: WebSockets only, no raw TCP/UDP
- **Required**: Design and implement WSS bridge architecture
- **Complexity**: HIGH - requires significant engine boundary modification
- **Estimated effort**: 2-4 weeks for design, implementation, and testing
- **Action required**: Design WSS bridge protocol, implement in Vanilla Conquer network layer

### BLOCKER 4: Filesystem Loading Strategy Not Defined
- **Impact**: Cannot load game data in browser
- **Root cause**: Vanilla Conquer expects native filesystem access
- **Emscripten solution**: EMFS (in-memory filesystem)
- **Required**: Define asset loading strategy, implement EMFS integration
- **Complexity**: MEDIUM - requires careful asset loading design
- **Estimated effort**: 1-2 weeks
- **Action required**: Design asset loading pipeline, implement EMFS integration

### BLOCKER 5: SDL2/Emscripten Compatibility Unverified
- **Impact**: Unknown if Emscripten SDL2 covers all Vanilla Conquer usage
- **Root cause**: Vanilla Conquer uses SDL2 extensively
- **Emscripten support**: SDL2 compatibility layer exists but coverage unknown
- **Required**: Audit Vanilla Conquer SDL2 usage, test Emscripten compatibility
- **Complexity**: MEDIUM - requires source audit and testing
- **Estimated effort**: 1 week
- **Action required**: Audit SDL2 usage in Vanilla Conquer, test with Emscripten

### BLOCKER 6: OpenAL/Emscripten Compatibility Unverified
- **Impact**: Unknown if Emscripten OpenAL covers all Vanilla Conquer usage
- **Root cause**: Vanilla Conquer uses OpenAL for all audio
- **Emscripten support**: OpenAL via Web Audio API
- **Required**: Verify Emscripten OpenAL implementation compatibility
- **Complexity**: LOW-MEDIUM - likely compatible but needs verification
- **Estimated effort**: 3-5 days
- **Action required**: Test Emscripten OpenAL with Vanilla Conquer audio code

## Feasibility Assessment

### Native Build: HIGH FEASIBILITY
- All dependencies are standard and well-documented
- Build system is mature and cross-platform
- Estimated effort: 1-2 days to complete native build on Windows

### WASM Build: MEDIUM-HIGH FEASIBILITY with significant blockers
- Emscripten provides SDL2 and OpenAL support
- Networking is the primary obstacle (socket → WSS bridge)
- Filesystem abstraction required
- Estimated total effort: 4-8 weeks to complete full WASM port

### Headless Build: MEDIUM FEASIBILITY
- Can use Emscripten with null graphics/audio stubs
- Still requires networking and filesystem work
- Estimated effort: 3-5 weeks (depends on networking solution)

## Recommended Path Forward

### Option A: Full WASM Port (Continue C04)
**Pros:**
- Preserves original engine logic completely
- Highest fidelity potential
- Aligns with preservation goal

**Cons:**
- High effort (4-8 weeks)
- Significant technical risk (networking bridge)
- Requires deep engine modification
- Blocked on game data and Emscripten setup

**Recommended action:**
1. Resolve BLOCKER 1 (Emscripten SDK) - immediate
2. Resolve BLOCKER 2 (game data) - blocked on owner
3. Design WSS bridge architecture (BLOCKER 3) - 1 week design phase
4. Audit SDL2/OpenAL usage (BLOCKER 5/6) - 1 week
5. Implement filesystem loading (BLOCKER 4) - 1-2 weeks
6. Implement network bridge (BLOCKER 3) - 2-4 weeks
7. Test and validate - 1-2 weeks

### Option B: Alternative Engine Evaluation
**Pros:**
- May find more WASM-friendly engine
- Lower technical risk
- Faster to completion

**Cons:**
- May compromise fidelity
- Requires new rights evaluation
- May not support TD/RA1 specifically
- OpenRA explicitly fails identical-gameplay requirement

**Recommended action:**
Only pursue if Option A proves infeasible after full assessment.

### Option C: Deferred Spike
**Pros:**
- Allows other M0 tasks to proceed
- Gives time for game data acquisition
- Allows for architecture planning

**Cons:**
- Delays critical engine proof
- M1 four-independent-browser slice cannot start
- Overall timeline impact

**Recommended action:**
If game data cannot be obtained within 2 weeks, defer C04 and proceed with independent tasks (e.g., COMRADE05 guest/room API design, COMRADE06 multiplayer protocol design).

## Immediate Next Steps

1. **Install Emscripten SDK** (BLOCKER 1) - Can proceed immediately
2. **Request game data from owner** (BLOCKER 2) - Requires owner action
3. **Audit Vanilla Conquer network code** (BLOCKER 3) - Can proceed immediately
4. **Audit Vanilla Conquer SDL2 usage** (BLOCKER 5) - Can proceed immediately
5. **Design WSS bridge protocol** (BLOCKER 3) - Can proceed in parallel with audits

## Conclusion

C04 cannot be completed without resolving at least BLOCKER 1 (Emscripten SDK) and BLOCKER 2 (game data). BLOCKER 3 (networking bridge) represents the highest technical risk and may require significant architecture work. The spike has revealed the complexity of the WASM port but has not proven it infeasible.

Given the current blockers, the most pragmatic approach is to:
1. Complete the immediate audits (network, SDL2) to fully understand the scope
2. Design the WSS bridge architecture
3. Request game data from owner
4. If game data is not available within 2 weeks, defer C04 and proceed with independent tasks

This spike has successfully identified the key obstacles and provided a clear path forward, even though it cannot be completed immediately due to external dependencies.
