// Emit projected triangle data and ray hits from Three's actual glTF and mixer.
// node fixture-poses.mjs /path/to/node_modules/three [outputs to stdout]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const vendor=path.resolve(process.argv[2]);
const packageInfo=JSON.parse(fs.readFileSync(path.join(vendor,'package.json'),'utf8'));
if(packageInfo.version!=='0.180.0')throw Error('Use three@0.180.0');
const THREE=await import(pathToFileURL(path.join(vendor,'build/three.module.js')));
const {GLTFLoader}=await import(pathToFileURL(path.join(vendor,'examples/jsm/loaders/GLTFLoader.js')));
globalThis.ProgressEvent ??= class ProgressEvent {constructor(type,init){this.type=type;Object.assign(this,init);}};
const source=fs.readFileSync(new URL('./field-service-tractor.gltf',import.meta.url),'utf8');
const {scene,animations}=await new GLTFLoader().parseAsync(source,'');
const mixer=new THREE.AnimationMixer(scene);
const width=224,height=160;
const camera=new THREE.OrthographicCamera(-3*width/height,3*width/height,3,-3,.1,50);
camera.position.set(5,4.5,6);camera.lookAt(0,1,0);camera.updateMatrixWorld(true);
const scenarios=[['travel','service.deploy',0],['braced','service.deploy',.6],['working','service.deploy',1.7],['scan','service.scan',.5],['return','service.retract',1.7]];
const poses={};
for(const [label,clip,time] of scenarios){
    mixer.stopAllAction();const act=mixer.clipAction(THREE.AnimationClip.findByName(animations,clip));act.reset();act.setLoop(THREE.LoopOnce,1);act.clampWhenFinished=true;act.play();mixer.setTime(time);scene.updateMatrixWorld(true);
    const vertices=[],light=new THREE.Vector3(3,6,5).normalize();
    scene.traverse(obj=>{
        if(!obj.isMesh)return;
        const geom=obj.geometry,meshColor=obj.material.color;
        const normalMatrix=new THREE.Matrix3().getNormalMatrix(obj.matrixWorld);
        for(const index of geom.index.array){
            const world=new THREE.Vector3().fromBufferAttribute(geom.attributes.position,index).applyMatrix4(obj.matrixWorld);
            const p=world.project(camera),n=new THREE.Vector3().fromBufferAttribute(geom.attributes.normal,index).applyMatrix3(normalMatrix).normalize();
            const intensity=.35+.65*Math.max(0,n.dot(light));
            vertices.push(p.x,p.y,p.z,meshColor.r*intensity,meshColor.g*intensity,meshColor.b*intensity);
        }
    });
    poses[label]=vertices;
}
const ray=new THREE.Raycaster(),candidate=new THREE.Vector3(0,.78,0).project(camera);
ray.setFromCamera(new THREE.Vector2(candidate.x,candidate.y),camera);
const hits=ray.intersectObjects(scene.children,true).filter(h=>h.object.isMesh);
if(hits.length===0)throw Error('Unable to pick fixture');
console.log(JSON.stringify({width,height,threeRevision:THREE.REVISION,poses,firstMesh:hits[0].object.name,distinctMeshes:new Set(hits.map(h=>h.object.name)).size,clips:animations.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length}))}));
