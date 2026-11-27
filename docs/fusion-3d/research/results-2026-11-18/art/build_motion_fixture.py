"""Build an original, self-contained glTF 2.0 articulated service tractor.

Python standard library only. Positions are metres. The scene root is stationary,
+Y up and +Z forward. Animation keys affect cosmetic articulation only.
"""
import base64, json, math, struct
from pathlib import Path

OUT=Path(__file__).resolve().parent
vertices=[]; views=[]; acc=[]; raw=bytearray(); meshes=[]; nodes=[]; parent={}
materials=[('slate',[.12,.19,.21,1]),('body',[.39,.54,.49,1]),('team_marker',[.93,.62,.10,1]),('mechanism',[.15,.18,.18,1]),('worn_edge',[.60,.65,.58,1]),('beacon',[.72,.92,.82,1])]
def buf(data,fmt,kind,dim,target=None):
    while len(raw)%4:raw.append(0)
    start=len(raw);flat=[v for row in data for v in row]
    raw.extend(struct.pack('<'+fmt*len(flat),*flat))
    view={'buffer':0,'byteOffset':start,'byteLength':len(raw)-start}
    if target:view['target']=target
    views.append(view)
    record={'bufferView':len(views)-1,'componentType':5126 if fmt=='f' else 5123,'count':len(data),'type':kind}
    if fmt=='f':record.update(min=[min(row[i] for row in data) for i in range(dim)],max=[max(row[i] for row in data) for i in range(dim)])
    acc.append(record);return len(acc)-1
def face_mesh(name,faces,mat):
    p=[];n=[];ind=[]
    for f in faces:
        a,b,c=f[:3]; ab=[j-i for i,j in zip(a,b)];ac=[j-i for i,j in zip(a,c)]
        v=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]]
        mag=math.sqrt(sum(x*x for x in v));normal=tuple(x/mag for x in v);s=len(p)
        p.extend(f);n.extend([normal]*len(f))
        for i in range(1,len(f)-1):ind.extend([(s,),(s+i,),(s+i+1,)])
    meshes.append({'name':name,'primitives':[{'attributes':{'POSITION':buf(p,'f','VEC3',3,34962),'NORMAL':buf(n,'f','VEC3',3,34962)},'indices':buf(ind,'H','SCALAR',1,34963),'material':mat}]})
    return len(meshes)-1
def loft(name,lower,upper,ylo,yhi,mat):
    # X/Z footprint runs counter-clockwise as seen from below (+x,+z).
    a=[(x,ylo,z) for x,z in lower];b=[(x,yhi,z) for x,z in upper]
    faces=[a,b[::-1]]+[ [a[i],b[i],b[(i+1)%len(a)],a[(i+1)%len(a)]] for i in range(len(a))]
    return face_mesh(name,faces,mat)
def octo(w,l,cut):return [(-w/2+cut,-l/2),(w/2-cut,-l/2),(w/2,-l/2+cut),(w/2,l/2-cut),(w/2-cut,l/2),(-w/2+cut,l/2),(-w/2,l/2-cut),(-w/2,-l/2+cut)]
def box(name,w,h,l,mat):
    foot=[(-w/2,-l/2),(w/2,-l/2),(w/2,l/2),(-w/2,l/2)]
    return loft(name,foot,foot,-h/2,h/2,mat)
def quat(axis,deg):
    ang=math.radians(deg)/2
    return [axis[0]*math.sin(ang),axis[1]*math.sin(ang),axis[2]*math.sin(ang),math.cos(ang)]
def node(name,pos=(0,0,0),mesh=None,p=None):
    d={'name':name,'translation':list(pos)}
    if mesh is not None:d['mesh']=mesh
    n=len(nodes);nodes.append(d)
    if p is not None:nodes[p].setdefault('children',[]).append(n);parent[n]=p
    return n
root=node('asset.root')
body=node('chassis',(0,.50,0),loft('chamfered hull',octo(2.25,3.4,.29),octo(1.91,3.1,.31),0,.49,1),root)
rail=loft('track band',octo(.46,3.35,.17),octo(.49,3.45,.14),-.29,.29,0)
lug=box('track pads',.49,.085,.13,3)
for sign,side in [(-1,'left'),(1,'right')]:
    carrier=node('track.'+side,(sign*1.14,.34,0),rail,root)
    for j in range(10):node('pad.'+side+'.'+str(j),(0,.278,-1.43+j*.314),lug,carrier)
    node('side_accent.'+side,(sign*1.20,.73,.53),box('accent '+side,.09,.16,.60,2),root)
cabin=node('cab',(0,1.02,.48),loft('inclined cabin',octo(1.31,1.18,.19),octo(1.04,.81,.13),0,.59,0),root)
node('roof_team',(0,.61,0),box('roof panel',.73,.065,.48,2),cabin)
node('visor',(0,.38,.46),box('glazed vision strip',.83,.12,.12,5),cabin)
mount=node('pedestal',(0,1.02,-.68),loft('rear pedestal',octo(.83,.91,.12),octo(.68,.70,.12),0,.23,4),root)
pivot=node('boom.yaw',(0,.24,0),None,mount)
shoulder=node('boom.shoulder',(0,.10,0),None,pivot)
node('service.boom',(0,0,-.70),box('taper reference boom',.23,.25,1.42,1),shoulder)
node('boom.warning',(0,.135,-.65),box('arm team band',.185,.04,.34,2),shoulder)
tip=node('repair.attach',(0,0,-1.43),None,shoulder)
node('beacon.indicator',(0,0,0),loft('service beacon',octo(.31,.30,.06),octo(.16,.16,.04),-.03,.22,5),tip)
braces=[];shoes=[]
for sign,side in [(-1,'left'),(1,'right')]:
    b=node('stabilizer.'+side,(sign*.95,.83,-.67),None,root);braces.append((sign,b))
    node('strut.'+side,(sign*.46,0,0),box('brace '+side,.94,.18,.27,4),b)
    shoe=node('foot.'+side,(sign*.87,-.04,0),box('shoe '+side,.30,.15,.40,0),b);shoes.append((sign,shoe))
node('fx.root',(0,.66,0),None,root);node('ui.label',(0,2.15,0),None,root);node('ui.health',(0,1.95,0),None,root)
node('engine.exhaust.0',(-.78,1.11,-1.29),box('exhaust block',.23,.17,.34,3),root)
def animation(name,times,channels):
    input_idx=buf([(v,) for v in times],'f','SCALAR',1);out={'name':name,'samplers':[],'channels':[]}
    for n,axis,angles in channels:
        outid=buf([quat(axis,x) for x in angles],'f','VEC4',4)
        i=len(out['samplers']);out['samplers'].append({'input':input_idx,'output':outid,'interpolation':'LINEAR'})
        out['channels'].append({'sampler':i,'target':{'node':n,'path':'rotation'}})
    return out
# Reference cycle in seconds, independent of simulation tick count or job duration.
deploy=[0,.20,.60,.85,1.20,1.70]
a=animation('service.deploy',deploy,[(shoulder,(1,0,0),[0,0,0,18,56,54]),(pivot,(0,1,0),[0,0,0,0,12,12])]+[(b,(0,0,1),[0,-sign*12,-sign*56,-sign*56,-sign*56,-sign*56]) for sign,b in braces]+[(n,(0,0,1),[0,s*12,s*56,s*56,s*56,s*56]) for s,n in shoes])
b=animation('service.retract',deploy,[(shoulder,(1,0,0),[54,54,18,0,0,0]),(pivot,(0,1,0),[12,12,6,0,0,0])]+[(n,(0,0,1),[-s*56,-s*56,-s*56,-s*56,-s*14,0]) for s,n in braces]+[(n,(0,0,1),[s*56,s*56,s*56,s*56,s*14,0]) for s,n in shoes])
sw=animation('service.scan',[0,.5,1,1.5,2],[(pivot,(0,1,0),[12,23,12,1,12]),(shoulder,(1,0,0),[54]*5)]+[(n,(0,0,1),[-s*56]*5) for s,n in braces]+[(n,(0,0,1),[s*56]*5) for s,n in shoes])
doc={'asset':{'version':'2.0','generator':'Project COMRADE original motion study builder','extras':{'scope':'Original geometric service-tractor study. Test-only role and timings. No source-game assets.'}},'scene':0,'scenes':[{'name':'field service tractor','nodes':[root]}],'nodes':nodes,'materials':[{'name':n,'pbrMetallicRoughness':{'baseColorFactor':c,'metallicFactor':.20,'roughnessFactor':.72}} for n,c in materials],'meshes':meshes,'animations':[a,b,sw],'buffers':[{'byteLength':len(raw),'uri':'data:application/octet-stream;base64,'+base64.b64encode(raw).decode()}],'bufferViews':views,'accessors':acc}
(OUT/'field-service-tractor.gltf').write_text(json.dumps(doc,separators=(',',':'))+'\n')
