"""Run actual Three.js/Chromium WebGL2 animation + picking on the original glTF.
Usage: python check_webgl_fixture.py /path/to/node_modules/three out.json
Requires playwright, Chromium, and local npm three@0.180.0. No network calls are made.
"""
from pathlib import Path
from urllib.parse import urlsplit,unquote
from playwright.sync_api import sync_playwright
import argparse
import json
import mimetypes
import shutil

PAGE = """<meta charset=utf-8><script type=importmap>{"imports":{"three":"/vendor/build/three.module.js"}}</script>"""
TEST = """async () => {
const THREE=await import('/vendor/build/three.module.js');
const {GLTFLoader}=await import('/vendor/examples/jsm/loaders/GLTFLoader.js');
const gltf=await new GLTFLoader().loadAsync('/field-service-tractor.gltf');
const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false});
const w=224,h=160;
renderer.setSize(w,h);
const target=new THREE.WebGLRenderTarget(w,h);
renderer.setRenderTarget(target);
const gl=renderer.getContext(), extension=gl.getExtension('WEBGL_debug_renderer_info');
const scene=new THREE.Scene(); scene.background=new THREE.Color(0x182326);
scene.add(gltf.scene);
const camera=new THREE.OrthographicCamera(-3*w/h,3*w/h,3,-3,.1,50);
camera.position.set(5,4.5,6);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
scene.add(new THREE.HemisphereLight(0xfff4db,0xb6c9cb,1.6));
const lamp=new THREE.DirectionalLight(0xffffff,2);lamp.position.set(3,6,5);scene.add(lamp);
const mixer=new THREE.AnimationMixer(gltf.scene);
const pixels=()=>{renderer.render(scene,camera);const p=new Uint8Array(w*h*4);renderer.readRenderTargetPixels(target,0,0,w,h,p);return p;};
const difference=(a,b)=>{let d=0;for(let i=0;i<a.length;i+=4){if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])d++;}return d;};
const pose=(name,time)=>{
  mixer.stopAllAction();const clip=gltf.animations.find(c=>c.name===name);
  const action=mixer.clipAction(clip);action.reset();action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(time);
  gltf.scene.updateMatrixWorld(true);return pixels();
};
gltf.scene.visible=false;const empty=pixels();gltf.scene.visible=true;
const travel=pose('service.deploy',0);
const braced=pose('service.deploy',.60);
const working=pose('service.deploy',1.70);
const scanned=pose('service.scan',.50);
const back=pose('service.retract',1.70);
const origin=new THREE.Vector3(0,.78,0).project(camera);const ray=new THREE.Raycaster();
ray.setFromCamera(new THREE.Vector2(origin.x,origin.y),camera);
const hits=ray.intersectObjects(gltf.scene.children,true);
const meshNames=hits.filter(i=>i.object.isMesh).map(i=>i.object.name);
const fits = {visiblePixels:difference(empty,travel), travelToBraced:difference(travel,braced), bracedToWorking:difference(braced,working), workingToScan:difference(working,scanned), travelToReturned:difference(travel,back)};
if(fits.visiblePixels<500||Math.min(fits.travelToBraced,fits.bracedToWorking,fits.workingToScan)<8||fits.travelToReturned>2||!meshNames.length)throw new Error('Invalid pose or pick '+JSON.stringify({fits,meshNames}));
return {renderer:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),threeRevision:THREE.REVISION,size:[w,h],clips:gltf.animations.map(c=>({name:c.name,seconds:c.duration,tracks:c.tracks.length})),pixelCounts:fits,rayHitMesh:meshNames[0],rayDistinctMeshes:[...new Set(meshNames)].length};
}"""
BRIDGE_TEST = """async () => {
const T=await import('/vendor/build/three.module.js');
const {GLTFLoader}=await import('/vendor/examples/jsm/loaders/GLTFLoader.js');
const gltf=await new GLTFLoader().loadAsync('/bridge-study.gltf');
const r=new T.WebGLRenderer({antialias:false,alpha:false}),w=320,h=200;
const rt=new T.WebGLRenderTarget(w,h);r.setSize(w,h);r.setRenderTarget(rt);
const gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
const cam=new T.OrthographicCamera(-19,19,19*h/w,-19*h/w,.1,120);
cam.position.set(15,19,28);cam.lookAt(0,1,0);cam.updateMatrixWorld(true);
const frames=[],tests=[];
for(const subject of gltf.scenes){
 const display=new T.Scene();display.background=new T.Color(0x263d38);display.add(subject);
 display.add(new T.HemisphereLight(0xfff4df,0xbbcaca,2.0));
 const light=new T.DirectionalLight(0xffffff,2);light.position.set(-8,28,8);display.add(light);
 r.render(display,cam);const px=new Uint8Array(w*h*4);r.readRenderTargetPixels(rt,0,0,w,h,px);frames.push(px);
 const ray=new T.Raycaster(new T.Vector3(0,12,0),new T.Vector3(0,-1,0));
 const intersects=ray.intersectObject(subject,true).filter(h=>h.object.isMesh);
 const sample=intersects[0];if(!sample)throw Error('No centre ray hit for '+subject.name);
 tests.push({scene:subject.name,first_centre_mesh:sample.object.name,height_m:Math.round(sample.point.y*1000)/1000,mesh_nodes:(()=>{let n=0;subject.traverse(o=>{if(o.isMesh)n++});return n;})()});
}
const varying=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2])n++;return n;};
const changes=frames.slice(1).map(p=>varying(frames[0],p));
if(tests.length!==4||Math.min(...changes)<10||tests[0].height_m<2.8||tests[1].height_m<2.8||tests[2].height_m>0||tests[3].height_m>0)throw Error(JSON.stringify({tests,changes}));
return {scope:'Four original authored glTF scenes. Centre-downward rays inspect visual surfaces only; zero authority or gameplay state is implied.',renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),webgl:gl.getParameter(gl.VERSION),three_revision:T.REVISION,size:[w,h],scenes:tests,pixels_changed_from_intact:changes};
}"""
def run():
    p=argparse.ArgumentParser();p.add_argument('three',type=Path);p.add_argument('report',type=Path);p.add_argument('--bridge',action='store_true');p.add_argument('--chromium',default=shutil.which('chromium'));a=p.parse_args()
    vendor=a.three.resolve();source=Path(__file__).resolve().parent
    assert json.loads((vendor/'package.json').read_text())['version']=='0.180.0'
    def route(r):
        path=unquote(urlsplit(r.request.url).path)
        if path=='/': return r.fulfill(status=200,content_type='text/html',body=PAGE)
        if path.startswith('/vendor/'):
            file=(vendor/path[8:]).resolve()
            if not file.is_relative_to(vendor): return r.abort()
        elif path in ('/field-service-tractor.gltf','/bridge-study.gltf'): file=source/path[1:]
        else: return r.abort()
        return r.fulfill(status=200,content_type='text/javascript' if file.suffix=='.js' else 'application/json',body=file.read_bytes())
    with sync_playwright() as pw:
        with pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--use-angle=swiftshader','--enable-unsafe-swiftshader']) as browser:
            page=browser.new_page();page.route('http://fixture.local/**',route);page.goto('http://fixture.local/')
            result=page.evaluate(BRIDGE_TEST if a.bridge else TEST);result.update(browser=browser.version)
            if not a.bridge:result.update(scope='Single asset sampled at discrete clip times on a software-rendered WebGL2 framebuffer. Direct framebuffer differences and camera-ray hits. No production integration, pacing, touch or physical device measurements.')
    a.report.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
if __name__=='__main__':run()
