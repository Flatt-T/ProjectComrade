"""Render three recorded poses using Blender's real glTF importer and CPU Cycles.

Run: blender -b -t 2 -P render_motion_fixture.py -- /path/to/output
"""
import bpy, sys, json, math
from mathutils import Vector
from pathlib import Path
root=Path(__file__).resolve().parent
out=Path(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else root/'.work'
out.mkdir(exist_ok=True,parents=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene
scene.render.fps=60
assert bpy.ops.import_scene.gltf(filepath=str(root/'field-service-tractor.gltf'))=={'FINISHED'}
asset_nodes=list(bpy.data.objects)
animated=[o for o in asset_nodes if o.animation_data]
assert len(animated)==6
def play(clip,seconds):
    for o in animated:
        o.animation_data.action=None
        for track in o.animation_data.nla_tracks:track.mute=track.name!=clip
    active=[t.strips[0].frame_start for o in animated for t in o.animation_data.nla_tracks if t.name==clip]
    assert len(set(active))==1
    frame=active[0]+seconds*scene.render.fps;scene.frame_set(int(frame),subframe=frame-int(frame))
    bpy.context.view_layer.update()
def floor(o):
    return min((o.matrix_world @ Vector(c)).z for c in o.bound_box)
def position(o):return [round(v,5) for v in o.matrix_world.translation]
def direction(at,obj):obj.rotation_euler=(Vector(at)-obj.location).to_track_quat('-Z','Y').to_euler()
def light(name,power,size,loc,tint):
    l=bpy.data.lights.new(name,'AREA');l.energy=power;l.shape='DISK';l.size=size;l.color=tint
    o=bpy.data.objects.new(name,l);scene.collection.objects.link(o);o.location=loc;direction((0,0,.7),o)
bpy.ops.mesh.primitive_plane_add(size=200);ground=bpy.context.object
mat=bpy.data.materials.new('matte green-gray ground');mat.diffuse_color=(.21,.27,.244,1);ground.data.materials.append(mat)
camdata=bpy.data.cameras.new('Tactical inspection');cam=bpy.data.objects.new('Tactical inspection',camdata);scene.collection.objects.link(cam);scene.camera=cam
camdata.type='ORTHO';camdata.ortho_scale=5.8;cam.location=(5.2,6.4,4.7);direction((0,0,.88),cam)
light('broad key',520,4.2,(-3.8,-4.2,7.6),(1,.93,.80));light('cool fill',260,5.6,(4,4,5),(.70,.85,1));light('rim',330,3,(0,5.6,6.2),(.96,1,.90))
world=bpy.data.worlds.new('overcast reference');scene.world=world;world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.38,.49,.58,1);world.node_tree.nodes['Background'].inputs[1].default_value=.32
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24;scene.cycles.use_denoising=False
scene.render.resolution_x=540;scene.render.resolution_y=420;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
results={}
for name,clip,time in [('travel','service.deploy',0),('braced','service.deploy',.60),('working','service.deploy',1.70),('scan','service.scan',.5),('return','service.retract',1.70)]:
    play(clip,time);o=bpy.data.objects['asset.root']
    results[name]={'clip':clip,'time_s':time,'root_position':position(o),'boom_world_position':position(bpy.data.objects['repair.attach']),'left_shoe_min_z_m':round(floor(bpy.data.objects['foot.left']),6),'right_shoe_min_z_m':round(floor(bpy.data.objects['foot.right']),6)}
    if name in ['travel','braced','working']:
        scene.render.filepath=str(out/(name+'.png'));bpy.ops.render.render(write_still=True)
assert all(x['root_position']==[0,0,0] for x in results.values())
assert all(0<=results['braced'][s]<.025 for s in ['left_shoe_min_z_m','right_shoe_min_z_m'])
assert results['working']['boom_world_position'][2]-results['travel']['boom_world_position'][2]>.8
assert results['return']['boom_world_position']==results['travel']['boom_world_position']
meshobjs=[o for o in asset_nodes if o.type=='MESH']
meshes={o.data for o in meshobjs}
def tris(m):m.calc_loop_triangles();return len(m.loop_triangles)
report={'scope':'Offline Blender glTF import and motion evaluation on an original research fixture. CPU offline stills, no browser/mobile validation.', 'blender_version':bpy.app.version_string,'node_count':len(asset_nodes),'mesh_nodes':len(meshobjs),'unique_meshes':len(meshes),'unique_mesh_triangles':sum(tris(m) for m in meshes),'instantiated_triangles':sum(tris(o.data) for o in meshobjs),'animation_bindings':{o.name:[t.name for t in o.animation_data.nla_tracks] for o in animated},'poses':results,'checks':['glTF import completed','all six articulated nodes have deploy/scan/retract tracks','root stationary at five samples','both bracing pads finish 0–25 mm above ground in this metre-authored reference','working tool tip rises >0.8 m','retract returns tip to initial position']}
(out/'fixture-verification.json').write_text(json.dumps(report,indent=2)+'\n')
print('VERIFIED',json.dumps(report))
if '--preview' in sys.argv:
    seq=out/'sequence';seq.mkdir(exist_ok=True)
    scene.cycles.samples=8
    scene.render.resolution_x=360;scene.render.resolution_y=272
    for i in range(66):
        t=i/12
        if t<1.7:clip,local='service.deploy',t
        elif t<3.7:clip,local='service.scan',t-1.7
        else:clip,local='service.retract',min(t-3.7,1.7)
        play(clip,local)
        scene.render.filepath=str(seq/f'{i:04}.png');bpy.ops.render.render(write_still=True)
