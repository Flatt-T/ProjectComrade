"""Prepare a disposable patched upstream tree and build both COMRADE engines."""
import argparse
import os
import pathlib
import shutil
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("mode", choices=["wasm", "native"])
args = parser.parse_args()
source = ROOT / "build" / "engine-prepared"
shutil.copytree(ROOT / "engines/vendor/Vanilla-Conquer", source, dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(".git", "build", "build-*", "obj"))

def replace(file, old, new):
    path = source / file
    # Upstream headers contain legacy single-byte comment characters.
    # Latin-1 round-trips every byte consistently on Windows and Linux.
    text = path.read_text(encoding='latin-1')
    if new not in text:
        if old not in text:
            raise RuntimeError(f"Upstream patch no longer applies: {file}")
        path.write_text(text.replace(old, new), encoding='latin-1')

replace("common/wwstd.h", "inline static char* strupr(char* str)",
        "#if !defined(__EMSCRIPTEN__)\ninline static char* strupr(char* str)")
replace("common/wwstd.h", "inline static void strrev(char* str)",
        "#endif // __EMSCRIPTEN__\n\ninline static void strrev(char* str)")
replace("CMakeLists.txt", "if(SDL2)\n    message", "if(SDL2 AND NOT EMSCRIPTEN)\n    message")
replace("common/CMakeLists.txt", "list(APPEND COMMONV_SRC video_null.cpp)",
        "list(APPEND COMMONV_SRC video_null.cpp wwkeyboard_null.cpp)")
replace("common/wwmouse.cpp", "DWORD user, DWORD res2, DWORD res3",
        "DWORD_PTR user, DWORD_PTR res2, DWORD_PTR res3")
for game in ('tiberiandawn', 'redalert'):
    replace(f'{game}/winstub.cpp',
            'long FAR PASCAL Windows_Procedure(HWND hwnd, UINT message, UINT wParam, LONG lParam)',
            'LRESULT CALLBACK Windows_Procedure(HWND hwnd, UINT message, WPARAM wParam, LPARAM lParam)')
shutil.copyfile(ROOT / "engines/adapters/td-ra/wwkeyboard_null.cpp", source / "common/wwkeyboard_null.cpp")
shutil.copyfile(ROOT / "engines/adapters/td-ra/comrade_bridge.cpp", source / "tiberiandawn/comrade_bridge.cpp")
shutil.copyfile(ROOT / "engines/adapters/td-ra/comrade_bridge_ra.cpp", source / "redalert/comrade_bridge.cpp")
for path in (source / 'common').iterdir():
    if path.suffix in ('.cpp', '.h'):
        text = path.read_text(encoding='latin-1')
        updated = text.replace('<al.h>', '<AL/al.h>').replace('<alc.h>', '<AL/alc.h>')
        if updated != text:
            path.write_text(updated, encoding='latin-1')
replace('CMakeLists.txt', '    find_package(OpenAL REQUIRED)', '''    if(EMSCRIPTEN)
        add_library(OpenAL::OpenAL INTERFACE IMPORTED)
        set_property(TARGET OpenAL::OpenAL PROPERTY INTERFACE_LINK_LIBRARIES openal)
    else()
        find_package(OpenAL REQUIRED)
    endif()''')
replace('tiberiandawn/CMakeLists.txt', '    target_link_libraries(VanillaTD commonv ${VANILLA_LIBS} ${STATIC_LIBS})', '''    target_link_libraries(VanillaTD commonv ${VANILLA_LIBS} ${STATIC_LIBS})
    if(EMSCRIPTEN)
        target_sources(VanillaTD PRIVATE comrade_bridge.cpp)
    endif()''')
replace('redalert/CMakeLists.txt', '    target_link_libraries(VanillaRA commonv ${VANILLA_LIBS} ${STATIC_LIBS})', '''    target_link_libraries(VanillaRA commonv ${VANILLA_LIBS} ${STATIC_LIBS})
    if(EMSCRIPTEN)
        target_sources(VanillaRA PRIVATE comrade_bridge.cpp)
    endif()''')
replace('common/mssleep.h', '#include <time.h>', '#include <time.h>\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif')
replace('common/mssleep.h', '    nanosleep(&ts, NULL);', '''#ifdef __EMSCRIPTEN__
    emscripten_sleep((ts.tv_sec * 1000) + ((ts.tv_nsec + 999999) / 1000000));
#else
    nanosleep(&ts, NULL);
#endif''')
replace('tiberiandawn/init.cpp', '#include "function.h"', '#include "function.h"\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif')
replace('tiberiandawn/init.cpp', '        while (process) {', '''#ifdef __EMSCRIPTEN__
        if (CCFileClass("COMRADE.INI").Is_Available()) {
            process = false;
            selection = SEL_START_NEW_GAME;
            display = false;
            Scen.Scenario = 20;
            BuildLevel = 15;
            Whom = EM_ASM_INT({ return Module.comradeFaction === 'nod' ? 1 : 0; }) ? HOUSE_BAD : HOUSE_GOOD;
            ScenPlayer = Whom == HOUSE_GOOD ? SCEN_PLAYER_GDI : SCEN_PLAYER_NOD;
            GameToPlay = GAME_NORMAL;
        }
#endif
        while (process) {''')
replace('tiberiandawn/init.cpp', '        if (!Start_Scenario(Scen.ScenarioName)) {', '''#ifdef __EMSCRIPTEN__
        if (CCFileClass("COMRADE.INI").Is_Available()) strcpy(Scen.ScenarioName, "COMRADE");
#endif
        if (!Start_Scenario(Scen.ScenarioName, false)) {''')
# Red Alert boots the authored scenario the same way Tiberian Dawn does: if the browser
# mounted a COMRADE.INI, skip the menus and start it. RA keeps its terrain inside the
# scenario file, so there is no .BIN to look for, and its Start_Scenario takes one argument.
replace('redalert/init.cpp', '#include "function.h"', '#include "function.h"\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif')
replace('redalert/init.cpp', '        while (process) {', '''#ifdef __EMSCRIPTEN__
        if (CCFileClass("COMRADE.INI").Is_Available()) {
            process = false;
            selection = SEL_START_NEW_GAME;
            display = false;
            Scen.Scenario = 20;
            BuildLevel = 15;
            Whom = EM_ASM_INT({ return Module.comradeFaction === 'soviet' ? 1 : 0; }) ? HOUSE_BAD : HOUSE_GOOD;
            Session.Type = GAME_NORMAL;
        }
#endif
        while (process) {''')
replace('redalert/init.cpp', '        if (!Start_Scenario(Scen.ScenarioName)) {', '''#ifdef __EMSCRIPTEN__
        if (CCFileClass("COMRADE.INI").Is_Available()) Scen.Set_Scenario_Name("COMRADE.INI");
#endif
        if (!Start_Scenario(Scen.ScenarioName)) {''')

replace('tiberiandawn/scenario.cpp', '                Restate_Mission(Scen.ScenarioName, TXT_OK, TXT_NONE);', '''#ifndef __EMSCRIPTEN__
                Restate_Mission(Scen.ScenarioName, TXT_OK, TXT_NONE);
#endif''')
replace('tiberiandawn/conquer.cpp', '#include "function.h"', '#include "function.h"\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif')
replace('tiberiandawn/conquer.cpp', 'bool Main_Loop()\n{', '''bool Main_Loop()
{
#ifdef __EMSCRIPTEN__
    // Keep the authored operation's result available to the browser UI.
    if (PlayerWins || PlayerLoses) { emscripten_sleep(16); return false; }
#endif''')
replace('tiberiandawn/conquer.cpp', '    if (PlayerWins) {', '''#ifdef __EMSCRIPTEN__
    if (PlayerWins || PlayerLoses) { emscripten_sleep(16); return false; }
#endif
    if (PlayerWins) {''')
replace('common/video_sdl2.cpp', '#include <SDL.h>', '#include <SDL.h>\n#ifdef __EMSCRIPTEN__\n#include <emscripten.h>\n#endif')
replace('common/video_sdl2.cpp', '        SDL_GetMouseState(&x, &y);\n        x /= scale_x;', '''#ifdef __EMSCRIPTEN__
        // A pointer outside the canvas must not keep scrolling the battlefield.
        if (!EM_ASM_INT({ return Module.comradePointerInside ? 1 : 0; })) {
            x = hwcursor.GameW / 2; y = hwcursor.GameH / 2; return;
        }
#endif
        SDL_GetMouseState(&x, &y);
        x /= scale_x;''')
replace("CMakeLists.txt", "add_subdirectory(common)", """if(EMSCRIPTEN)
    add_compile_options(-sUSE_SDL=2 -fno-strict-aliasing)
    add_link_options(-sUSE_SDL=2 -sMODULARIZE=1 -sEXPORT_ES6=1
        -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1
        -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=131072
        # Emscripten has no exportable pauseMainLoop, so a module started with callMain owns
        # the main loop until the page goes: leaving a match reloads (see stopEngine).
        \"-sEXPORTED_RUNTIME_METHODS=['FS','callMain','UTF8ToString','ccall']\")
endif()
add_subdirectory(common)""")

def sync_file(src, dst):
    if not Path(dst).exists() or Path(src).read_bytes() != Path(dst).read_bytes():
        shutil.copy2(src, dst)
    return dst

Path = pathlib.Path
actual_source = ROOT / 'build/engine-source'
shutil.copytree(source, actual_source, dirs_exist_ok=True, copy_function=sync_file)
source = actual_source

build = ROOT / "build" / f"engine-{args.mode}"
command = ["cmake", "-S", str(source), "-B", str(build),
           "-DNETWORKING=OFF", f"-DOPENAL={'ON' if args.mode == 'wasm' else 'OFF'}", "-DSDL1=OFF",
           f"-DSDL2={'ON' if args.mode == 'wasm' else 'OFF'}", "-DCMAKE_BUILD_TYPE=Release"]
if args.mode == "wasm":
    command = ["emcmake", *command, "-G", "Ninja"]
elif os.name != 'nt' or shutil.which("cl"):
    command += ["-G", "Ninja"]
else:
    command += ["-G", "Visual Studio 17 2022", "-A", "x64"]
subprocess.run(command, check=True, shell=(os.name == 'nt' and args.mode == 'wasm'))
subprocess.run(["cmake", "--build", str(build), "--config", "Release", "--parallel", "4"], check=True)
if args.mode == "wasm":
    output = ROOT / "apps/web/public/engines"
    output.mkdir(parents=True, exist_ok=True)
    for game in ("vanillatd", "vanillara"):
        for suffix in ("js", "wasm"):
            shutil.copyfile(build / f"{game}.{suffix}", output / f"{game}.{suffix}")
    shutil.copyfile(source / "License.txt", output / "License.txt")
    revision = subprocess.check_output(['git', '-C', str(ROOT / 'engines/vendor/Vanilla-Conquer'), 'rev-parse', 'HEAD'], text=True).strip()
    project_revision = os.environ.get('GITHUB_SHA') or subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    (output / 'source.txt').write_text(f'Corresponding source: https://github.com/Flatt-T/ProjectComrade/tree/{project_revision}\nUpstream revision: {revision}\nBuild and modifications: tools/build-engine.py and engines/adapters/td-ra/ (comrade_bridge.cpp, comrade_bridge_ra.cpp, wwkeyboard_null.cpp)\nLicence: /engines/License.txt\n')
