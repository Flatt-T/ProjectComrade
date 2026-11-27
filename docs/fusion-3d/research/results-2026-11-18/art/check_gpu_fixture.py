"""Three.js GLTFLoader + AnimationMixer and raycast, rendered offscreen by OpenGL/EGL.
Usage: python check_gpu_fixture.py /path/to/node_modules/three report.json
Requires Node, three@0.180.0, moderngl==5.12.0 and an EGL driver.
"""
import array
import json
from pathlib import Path
import subprocess
import sys
import moderngl

root=Path(__file__).resolve().parent
data=json.loads(subprocess.check_output(['node',str(root/'fixture-poses.mjs'),sys.argv[1]]))
ctx=moderngl.create_standalone_context(backend='egl')
w,h=data['width'],data['height'];target=ctx.simple_framebuffer((w,h));target.use();ctx.enable(moderngl.DEPTH_TEST)
program=ctx.program(vertex_shader="""#version 330
in vec3 position;
in vec3 color;
out vec3 shade;
void main(){gl_Position=vec4(position,1);shade=color;}
""",fragment_shader="""#version 330
in vec3 shade;
out vec4 pixel;
void main(){pixel=vec4(shade,1);}
""")
def sample(vertices):
    target.clear(.10,.14,.15,1,depth=1)
    if vertices:
        buf=ctx.buffer(array.array('f',vertices).tobytes())
        vao=ctx.vertex_array(program,[(buf,'3f 3f','position','color')]);vao.render(moderngl.TRIANGLES);vao.release();buf.release()
    return target.read(components=3)
def different(a,b):return sum(a[i:i+3]!=b[i:i+3] for i in range(0,len(a),3))
empty=sample([]);frames={key:sample(value) for key,value in data['poses'].items()}
measured={'visible_pixels':different(empty,frames['travel']),'travel_to_braced':different(frames['travel'],frames['braced']),'braced_to_working':different(frames['braced'],frames['working']),'working_to_scan':different(frames['working'],frames['scan']),'travel_to_return':different(frames['travel'],frames['return'])}
assert measured['visible_pixels']>500 and min(measured[key] for key in ['travel_to_braced','braced_to_working','working_to_scan'])>8 and measured['travel_to_return']<=2
result={'scope':'True Three.js glTF import, pose interpolation and ray-casting under Node; its projected geometry was rasterized by a standalone EGL/OpenGL context. OpenGL API and software driver are identified below. No mobile frame timing, browser event dispatch or application integration measured.','three_revision':data['threeRevision'],'opengl':ctx.info['GL_VERSION'],'renderer':ctx.info['GL_RENDERER'],'size':[w,h],'first_picked_mesh':data['firstMesh'],'distinct_picked_meshes':data['distinctMeshes'],'clips':data['clips'],'pixel_differences':measured}
Path(sys.argv[2]).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
