"""Make the four-state engineering contact sheet from the original Blender renders."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import sys
src,dest=map(Path,sys.argv[1:])
font=lambda s,b=False:ImageFont.truetype('DejaVuSans-Bold.ttf' if b else 'DejaVuSans.ttf',s)
board=Image.new('RGB',(1280,930),'#152522');d=ImageDraw.Draw(board)
d.text((30,17),'River crossing',fill='#e6eddf',font=font(32,True))
d.text((30,65),'Three spans and a repair hut    /    Four authored centre-span states, one fixed camera',fill='#c6d1c5',font=font(17))
rows=[('intact','Intact','The deck and both edge rails continue across the channel.'),('damaged','Damaged','Dark seams and deformed rails mark a continuous deck.'),('breach','Breached','The centre span is absent and the two approach spans remain.'),('repairing','Rebuilding','Scaffolding frames a visible gap between the approaches.')]
for j,(key,title,note) in enumerate(rows):
    x=30+(j%2)*625;y=104+(j//2)*409
    im=Image.open(src/(key+'.png')).convert('RGB').resize((600,349),Image.Resampling.LANCZOS)
    board.paste(im,(x,y));d.text((x,y+357),title,fill='#f0d99a',font=font(17,True));d.text((x,y+383),note,fill='#cbd8cb',font=font(13))
board.save(dest,quality=91,optimize=True)
