"""Build original four-scene bridge study and comparison stills. Blender -b -t 3 -P build_bridge_study.py -- output-dir"""
from pathlib import Path
import base64,bpy,copy,json,math,random,struct,sys
from mathutils import Vector
from collections import defaultdict
out=Path(sys.argv[sys.argv.index('--')+1]);out.mkdir(parents=True,exist_ok=True)
rng=random.Random(511)
materials={'grass':(.22,.34,.17),'meadow':(.32,.43,.21),'shade':(.18,.29,.17),'rock':(.29,.31,.26),'slate':(.21,.25,.23),'dirt':(.42,.33,.20),'cut':(.34,.25,.15),'water':(.09,.32,.39),'ripple':(.33,.53,.49),'road':(.30,.30,.25),'line':(.90,.72,.32),'steel':(.19,.28,.29),'edging':(.43,.50,.44),'deck':(.51,.52,.43),'damaged':(.27,.28,.26),'crack':(.115,.13,.13),'ochre':(.72,.47,.12),'plaster':(.64,.63,.47),'roof':(.31,.40,.41),'dark':(.14,.22,.22),'wood':(.41,.31,.19),'pine1':(.15,.29,.20),'pine2':(.22,.37,.24),'pine3':(.31,.43,.26),'marker':(.82,.87,.71)}
bpy.ops.wm.read_factory_settings(use_empty=True);scene=bpy.context.scene
slots={};groups=defaultdict(lambda:[[],[]]);roots={}
for key,c in materials.items():
    mat=bpy.data.materials.new(key);mat.diffuse_color=(*c,1);mat.use_nodes=True;b=mat.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1);b.inputs['Roughness'].default_value=.86;slots[key]=mat
states=['site','intact','damaged','breach','repairing'];state='site'
for k in states:
    root=bpy.data.objects.new('bridge.'+k,None);scene.collection.objects.link(root);roots[k]=root
def shape(key,verts,faces,name='combined'):
    v,f=groups[(state,name,key)];first=len(v);v.extend(verts);f.extend([tuple(i+first for i in face) for face in faces])
def box(key,center,size,name='combined'):
    x,y,z=center;a,b,c=[v/2 for v in size]
    shape(key,[(x+i*a,y+j*b,z+k*c) for i,j,k in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]],[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],name)
def girder(key,a,b,r,name='combined'):
    a,b=Vector(a),Vector(b);v=(b-a).normalized();side=v.cross(Vector((0,0,1)))
    if side.length<.001:side=Vector((1,0,0))
    side.normalize();up=v.cross(side).normalized();rim=[-side-up,side-up,side+up,-side+up]
    shape(key,[tuple(p+d*r) for p in (a,b) for d in rim],[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],name)
def cone(key,foot,r,h,n,angle=0,top=.07,name='combined'):
    x,y,z=foot;v=[(x+rad*math.cos(angle+2*math.pi*j/n),y+rad*math.sin(angle+2*math.pi*j/n),z+zz) for rad,zz in [(r,0),(r*top,h)] for j in range(n)]
    shape(key,v,[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],name)
def panel(key,quad):shape(key,quad,[(0,1,2,3)])
# A continuous through-channel. Slightly irregular banks have a flush approach at each abutment.
box('slate',(0,0,-1.05),(32,19,1.4),'block.base');box('water',(0,0,-.29),(31.86,18.86,.16),'river')
for side in [-1,1]:
    ys=[-9.42,-6.6,-4.1,-2.9,0,2.9,4.5,7.1,9.42];edge=[9.0,8.4,8.1,9.0,9.2,9.0,8.5,7.2,6.85] if side==-1 else [7.1,7.8,8.8,9.0,9.2,9.0,8.3,8.0,9.2]
    for i in range(len(ys)-1):
        y0,y1=ys[i:i+2];lo,hi=edge[i:i+2];outer=15.95
        for a,b,z0,z1,mat in [(0,.65,-.18,.28,'rock'),(.65,1.35,.28,1.42,'cut'),(1.35,2.4,1.42,2.68,'rock'),(2.4,2.8,2.68,2.84,'meadow')]:
            panel(mat,[(side*(lo+a),y0,z0),(side*(hi+a),y1,z0),(side*(hi+b),y1,z1),(side*(lo+b),y0,z1)])
        panel('grass',[(side*(lo+2.8),y0,2.84),(side*(hi+2.8),y1,2.84),(side*outer,y1,2.84),(side*outer,y0,2.84)])
        panel('dirt',[(side*outer,y0,-.35),(side*outer,y1,-.35),(side*outer,y1,2.84),(side*outer,y0,2.84)])
        if i in (0,len(ys)-2):
            yx=y0 if i==0 else y1;at=lo if i==0 else hi
            panel('cut',[(side*at,yx,-.35),(side*outer,yx,-.35),(side*outer,yx,2.84),(side*(at+2.8),yx,2.84)])
    box('road',(side*13.6,0,2.89),(4.7,4.4,.10),'approach')
    for x in [12,14,15.6]:box('line',(side*x,0,2.952),(.7,.09,.017))
    # approach masonry
    box('rock',(side*10.7,0,1.49),(2.55,5.15,2.96),'abutment')
    box('deck',(side*10.7,0,2.96),(2.75,5.45,.25),'abutment')
    for y in [-2.48,2.48]:box('edging',(side*10.72,y,3.24),(2.7,.25,.43))
for _ in range(44):
    x=rng.uniform(-7,7);y=rng.uniform(-8.8,8.8)
    if abs(y)<2.7:continue
    box('ripple',(x,y,-.201),(rng.uniform(.04,.09),rng.uniform(.25,.9),.008))
def tree(x,y,h):
    cone('wood',(x,y,2.82),h*.08,h*.45,6,top=.7)
    for j,k in enumerate(['pine1','pine2','pine3']):cone(k,(x,y,2.82+h*(.22+.18*j)),h*(.28-.054*j),h*(.48-.045*j),7,angle=rng.random(),top=.02)
for x,y,s in [(-14.6,7.2,2.1),(-13.6,8.2,2.55),(-12.3,7.1,2.15),(-11.7,8.7,1.85),(-13.4,6.4,1.55),(-15.1,-7.0,2),(-14.0,-8,1.7),(13.5,-7.0,2.25),(14.7,-5.8,2.55),(12.3,-7.4,1.65),(11.9,7.8,1.6),(13.2,8.1,2.0)]:tree(x,y,s)
# Neutral hut next to approach, with original contrasting roof, service gate and tank.
box('dirt',(-13.6,-4.5,2.90),(4.1,3.9,.12))
box('plaster',(-13.6,-4.8,3.71),(2.8,1.82,1.55),'repair.hut')
box('roof',(-13.6,-4.8,4.56),(3.15,2.05,.23),'repair.hut')
box('dark',(-13.3,-5.72,3.51),(.68,.06,1.08),'repair.hut')
for xx in [-14.5,-13.95]:box('dark',(xx,-5.74,3.98),(.35,.06,.34))
box('ochre',(-13.6,-5.76,4.29),(2.8,.06,.12))
cone('slate',(-12.0,-4.1,2.97),.36,.96,9,top=1)
for side in [-1,1]:
    for y in [-2.27,2.27]:
        box('steel',(side*3.0,y,1.14),(.54,.62,2.68),'pier')
    box('edging',(side*3.0,0,2.48),(.8,5.06,.4),'pier')
def span(cx,condition='whole'):
    half=3.04;top=3.09;key='damaged' if condition=='damaged' else 'deck';name='deck.middle' if cx==0 else 'deck.outer'
    box(key,(cx,0,2.88),(half*2,4.75,.42),name)
    for x in [-2.35,-.6,1.2]:box('line',(cx+x,0,top+.014),(1.00,.09,.025))
    for side in [-1,1]:
        y=side*2.36;box('steel',(cx,y,2.69),(6.1,.23,.43),'rail')
        step=1.52
        for i in range(5):
            x=cx-half+i*step;z=3.9 if condition!='damaged' or (i+side)%3 else 3.49
            girder('steel',(x,y,3.0),(x,y,z),.075)
            if i<4:
                z2=3.9 if condition!='damaged' or (i+1+side)%3 else 3.49
                girder('edging',(x,y,z),(x+step,y,z2),.095)
                girder('steel',(x,y,3.03 if i%2==0 else z),(x+step,y,z2 if i%2==0 else 3.03),.055)
    if condition=='damaged':
        for off in [-1.3,-.35,.75]:
            girder('crack',(off-.33,-1.3,top+.023),(off+.36,.88,top+.023),.055)
            girder('crack',(off+.1,-.2,top+.023),(off+.69,.13,top+.023),.040)
for cx in [-6.08,6.08]:span(cx)
def breakends():
    for side in [-1,1]:
        for k,y in enumerate([-1.8,-1.05,.3,1.85]):
            x=side*3.10; reach=[.65,.29,.46,.25][k]
            girder('damaged',(x,y,2.76),(x-side*reach,y+.09,2.48),.115)
        for y in [-2.31,2.31]:box('ochre',(side*3.32,y,3.45),(.24,.27,.84),'warning.post')
for st in states[1:]:
    state=st
    if st in ['intact','damaged']:span(0,st)
    else:
        breakends()
        if st=='repairing':
            for y in [-2.65,2.65]:
                for x in [-2.55,0,2.55]:girder('ochre',(x,y,-.10),(x,y,3.42),.095)
                for x in [-2.55,0]:
                    girder('ochre',(x,y,.70),(x+2.55,y,2.62),.072)
                    girder('ochre',(x,y,2.62),(x+2.55,y,.70),.072)
                for h in [.72,2.68]:girder('steel',(-2.65,y,h),(2.65,y,h),.085)
                # Peripheral work board is narrow and leaves the road closed.
                box('wood',(0,y,2.68),(5.45,.42,.13),'scaffold.walkboard')
for (st,name,mat),(verts,faces) in groups.items():
    mesh=bpy.data.meshes.new(st+'.'+name+'.'+mat);mesh.from_pydata(verts,[],faces);mesh.materials.append(slots[mat]);mesh.update()
    ob=bpy.data.objects.new(mesh.name,mesh);scene.collection.objects.link(ob);ob.parent=roots[st]
# Export every visual version once and expose one legal stage per glTF scene.
bpy.ops.object.select_all(action='SELECT');raw=out/'bridge-study.glb'
bpy.ops.export_scene.gltf(filepath=str(raw),export_format='GLB',use_selection=True,export_animations=False,export_yup=True,export_extras=False)
b=raw.read_bytes();slen=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+slen]);offset=20+slen;blen=struct.unpack_from('<I',b,offset)[0];binary=b[offset+8:offset+8+blen]
g['buffers'][0]['uri']='data:application/octet-stream;base64,'+base64.b64encode(binary).decode()
lookup={v['name']:i for i,v in enumerate(g['nodes'])}
def clone_shared_site(index,suffix):
    node=copy.deepcopy(g['nodes'][index]);node['name']=node['name']+'.'+suffix
    if 'children' in node:node['children']=[clone_shared_site(child,suffix) for child in node['children']]
    g['nodes'].append(node);return len(g['nodes'])-1
g['scenes']=[]
for st in states[1:]:
    site=lookup['bridge.site'] if st=='intact' else clone_shared_site(lookup['bridge.site'],st)
    g['scenes'].append({'name':'bridge.'+st,'nodes':[site,lookup['bridge.'+st]]})
g['scene']=0;g['asset']['generator']='Original Fusion bridge study / Blender glTF exporter'
(out/'bridge-study.gltf').write_text(json.dumps(g,separators=(',',':'))+'\n');raw.unlink()
if '--geometry-only' in sys.argv:sys.exit(0)
# Reference lighting and perspective share the same setup for every state.
def look(obj,point):obj.rotation_euler=(Vector(point)-obj.location).to_track_quat('-Z','Y').to_euler()
for name,loc,p,e,color in [('key',(-8,-8,28),7800,15,(1,.88,.67)),('fill',(10,12,16),5000,19,(.72,.84,1))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=p;data.shape='DISK';data.size=e;data.color=color;obj=bpy.data.objects.new(name,data);scene.collection.objects.link(obj);obj.location=loc;look(obj,(0,0,1))
camdata=bpy.data.cameras.new('study_camera');cam=bpy.data.objects.new('study_camera',camdata);scene.collection.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.ortho_scale=37.5;cam.location=(15,-28,19);look(cam,(0,0,1))
world=bpy.data.worlds.new('world');world.use_nodes=True;world.node_tree.nodes['Background'].inputs[0].default_value=(.21,.30,.29,1);world.node_tree.nodes['Background'].inputs[1].default_value=.62;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=20;scene.cycles.use_denoising=False;scene.render.resolution_x=740;scene.render.resolution_y=430;scene.render.resolution_percentage=100;scene.view_settings.view_transform='AgX';scene.render.image_settings.file_format='PNG'
for st in states[1:]:
    for k,rt in roots.items():
        for child in rt.children:child.hide_render=k not in ('site',st)
    scene.render.filepath=str(out/(st+'.png'));bpy.ops.render.render(write_still=True)
print('BRIDGE',len(g['meshes']),len(g['nodes']),len(g['scenes']))
