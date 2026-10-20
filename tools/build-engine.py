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
source = ROOT / "build" / "engine-source"
if not source.exists():
    shutil.copytree(ROOT / "engines/vendor/Vanilla-Conquer", source,
                    ignore=shutil.ignore_patterns(".git", "build", "build-*", "obj"))

def replace(file, old, new):
    path = source / file
    text = path.read_text()
    if new not in text:
        if old not in text:
            raise RuntimeError(f"Upstream patch no longer applies: {file}")
        path.write_text(text.replace(old, new))

replace("common/wwstd.h", "inline static char* strupr(char* str)",
        "#if !defined(__EMSCRIPTEN__)\ninline static char* strupr(char* str)")
replace("common/wwstd.h", "inline static void strrev(char* str)",
        "#endif // __EMSCRIPTEN__\n\ninline static void strrev(char* str)")
replace("CMakeLists.txt", "if(SDL2)\n    message", "if(SDL2 AND NOT EMSCRIPTEN)\n    message")
replace("common/CMakeLists.txt", "list(APPEND COMMONV_SRC video_null.cpp)",
        "list(APPEND COMMONV_SRC video_null.cpp wwkeyboard_null.cpp)")
shutil.copyfile(ROOT / "engines/adapters/td-ra/wwkeyboard_null.cpp", source / "common/wwkeyboard_null.cpp")
replace("CMakeLists.txt", "add_subdirectory(common)", """if(EMSCRIPTEN)
    add_compile_options(-sUSE_SDL=2)
    add_link_options(-sUSE_SDL=2 -sMODULARIZE=1 -sEXPORT_ES6=1
        -sINVOKE_RUN=0 -sFORCE_FILESYSTEM=1 -sALLOW_MEMORY_GROWTH=1
        -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=131072
        \"-sEXPORTED_RUNTIME_METHODS=['FS','callMain']\")
endif()
add_subdirectory(common)""")

build = ROOT / "build" / f"engine-{args.mode}"
command = ["cmake", "-S", str(source), "-B", str(build),
           "-DNETWORKING=OFF", "-DOPENAL=OFF", "-DSDL1=OFF",
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
    (output / 'source.txt').write_text(f'Corresponding source: https://github.com/Flatt-T/ProjectComrade\nUpstream revision: {revision}\nBuild and modifications: tools/build-engine.py and engines/adapters/td-ra/wwkeyboard_null.cpp\nLicence: /engines/License.txt\n')
