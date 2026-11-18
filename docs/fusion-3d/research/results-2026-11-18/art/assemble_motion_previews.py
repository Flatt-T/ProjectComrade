"""Assemble original Blender stills and 12 fps cadence review. Usage: python assemble_motion_previews.py render_dir output_dir"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys
src,out=map(Path,sys.argv[1:])
def font(size,bold=False):
    return ImageFont.truetype('DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf',size)
im=Image.new('RGB',(1320,455),'#172522');d=ImageDraw.Draw(im)
d.text((30,18),'Field service tractor',font=font(29,True),fill='#ecede4')
d.text((30,60),'Original rigid-node motion study    /    Camera, lighting and scale held constant',font=font(16),fill='#c6d1c5')
for j,(key,title,sub) in enumerate([('travel','Travel','0.00 s    •    Shoes stowed'),('braced','Braced','0.60 s    •    Shoes seated'),('working','Working','1.70 s    •    Tool raised')]):
    x=30+j*425;r=Image.open(src/(key+'.png')).convert('RGB').resize((407,317),Image.Resampling.LANCZOS)
    im.paste(r,(x,93));d.text((x,418),title,font=font(18,True),fill='#f5e9b3')
    d.text((x+92,421),sub,font=font(13),fill='#d9e3d6')
im.save(out/'motion-contact-sheet.jpg',quality=89,optimize=True)
paths=sorted((src/'sequence').glob('*.png'));assert len(paths)==66
frames=[Image.open(p).convert('RGB').resize((320,242),Image.Resampling.LANCZOS) for p in paths]
frames[0].save(out/'service-cycle.webp',save_all=True,append_images=frames[1:],duration=[84 if i%3==0 else 83 for i in range(len(frames))],loop=0,quality=64,method=4)
with Image.open(out/'service-cycle.webp') as check:
    assert check.is_animated and check.n_frames >= 60
    duration_ms=0
    for index in range(check.n_frames):
        check.seek(index);check.load();duration_ms+=check.info['duration']
    assert duration_ms==5500
