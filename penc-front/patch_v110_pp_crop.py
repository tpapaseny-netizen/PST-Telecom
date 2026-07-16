# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v110 (B4 : recadrage circulaire de la photo de profil)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v110 — recadrage photo de profil (B4)")

# 1) uploadPP -> ouvre l'outil de recadrage (le reste devient inerte)
OLD="async function uploadPP(e){\n  const f=e.target.files[0]; if(!f) return; e.target.value='';"
NEW="async function uploadPP(e){\n  const f=e.target.files[0]; if(!f) return; e.target.value=''; openCropTool(f); return;"
s=R(s,OLD,NEW,"uploadPP -> openCropTool")

# 2) Fonctions de recadrage (apres closeOffStatus_KEEP)
ANCHOR="function closeOffStatus_KEEP(){}"
FUNCS=ANCHOR+"""
var _crop=null;
function openCropTool(file){
  var reader=new FileReader();
  reader.onload=function(ev){ var img=new Image(); img.onload=function(){ _crop={img:img,scale:1,base:1,ox:0,oy:0,FS:300}; _renderCropModal(); }; img.onerror=function(){ showNotif('\u274C','Image','Fichier illisible','red',null); }; img.src=ev.target.result; };
  reader.readAsDataURL(file);
}
function _renderCropModal(){
  var ov=document.getElementById('cropOv');
  if(!ov){ ov=document.createElement('div'); ov.id='cropOv'; ov.className='overlay'; document.body.appendChild(ov); }
  var FS=_crop.FS;
  ov.innerHTML='<div class="sheet"><div class="sheet-handle"></div><div class="sheet-title">Recadrer la photo</div>'
    +'<div style="color:var(--muted);font-size:12.5px;text-align:center;margin-bottom:12px;">Glisse pour positionner, zoome avec le curseur.</div>'
    +'<div style="display:flex;justify-content:center;margin-bottom:16px;">'
    +'<div id="cropFrame" style="width:'+FS+'px;height:'+FS+'px;border-radius:50%;overflow:hidden;position:relative;background:#000;touch-action:none;cursor:grab;box-shadow:0 0 0 3px var(--accent);">'
    +'<canvas id="cropImg" width="'+FS+'" height="'+FS+'" style="display:block;"></canvas>'
    +'</div></div>'
    +'<input type="range" id="cropZoom" min="1" max="3" step="0.01" value="1" oninput="_cropZoom(this.value)" style="width:100%;margin-bottom:16px;accent-color:var(--accent);"/>'
    +'<button onclick="_cropConfirm()" id="cropOk" style="width:100%;padding:13px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;font-size:15px;cursor:pointer;">Valider la photo</button>'
    +'<button onclick="_cropCancel()" style="width:100%;padding:11px;border:none;border-radius:11px;background:transparent;color:var(--muted);cursor:pointer;margin-top:6px;">Annuler</button></div>';
  ov.classList.add('show');
  var c=_crop;
  c.base=Math.max(FS/c.img.naturalWidth, FS/c.img.naturalHeight);
  c.scale=c.base; c.ox=(FS-c.img.naturalWidth*c.scale)/2; c.oy=(FS-c.img.naturalHeight*c.scale)/2;
  _cropDrawPreview(); _cropBindDrag();
}
function _cropClamp(){ var c=_crop; var dw=c.img.naturalWidth*c.scale, dh=c.img.naturalHeight*c.scale; if(c.ox>0)c.ox=0; if(c.oy>0)c.oy=0; if(c.ox<c.FS-dw)c.ox=c.FS-dw; if(c.oy<c.FS-dh)c.oy=c.FS-dh; }
function _cropDrawPreview(){ var c=_crop; var cv=document.getElementById('cropImg'); if(!cv)return; var ctx=cv.getContext('2d'); ctx.clearRect(0,0,c.FS,c.FS); ctx.save(); ctx.setTransform(c.scale,0,0,c.scale,c.ox,c.oy); ctx.drawImage(c.img,0,0); ctx.restore(); }
function _cropZoom(v){ var c=_crop; if(!c)return; var s0=c.scale, s1=c.base*parseFloat(v); var cx=(c.FS/2-c.ox)/s0, cy=(c.FS/2-c.oy)/s0; c.scale=s1; c.ox=c.FS/2-cx*s1; c.oy=c.FS/2-cy*s1; _cropClamp(); _cropDrawPreview(); }
function _cropBindDrag(){ var f=document.getElementById('cropFrame'); if(!f)return; var dragging=false,lx=0,ly=0; f.addEventListener('pointerdown',function(e){ dragging=true; lx=e.clientX; ly=e.clientY; try{f.setPointerCapture(e.pointerId);}catch(_){} f.style.cursor='grabbing'; }); f.addEventListener('pointermove',function(e){ if(!dragging)return; var c=_crop; c.ox+=(e.clientX-lx); c.oy+=(e.clientY-ly); lx=e.clientX; ly=e.clientY; _cropClamp(); _cropDrawPreview(); }); var end=function(){ dragging=false; f.style.cursor='grab'; }; f.addEventListener('pointerup',end); f.addEventListener('pointercancel',end); }
function _cropCancel(){ var o=document.getElementById('cropOv'); if(o) o.classList.remove('show'); _crop=null; }
function _cropConfirm(){ var c=_crop; if(!c)return; var OUT=512, k=OUT/c.FS; var cv=document.createElement('canvas'); cv.width=OUT; cv.height=OUT; var ctx=cv.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,OUT,OUT); ctx.setTransform(c.scale*k,0,0,c.scale*k,c.ox*k,c.oy*k); ctx.drawImage(c.img,0,0); ctx.setTransform(1,0,0,1,0,0); var btn=document.getElementById('cropOk'); if(btn){btn.disabled=true;btn.textContent='Envoi...';} cv.toBlob(function(blob){ _cropUpload(blob); },'image/jpeg',0.9); }
async function _cropUpload(blob){
  try{
    var fd=new FormData(); fd.append('file',blob,'avatar.jpg'); fd.append('upload_preset',CLD_PRESET); fd.append('folder','penc/avatars');
    var r=await fetch('https://api.cloudinary.com/v1_1/'+CLD_CLOUD+'/image/upload',{method:'POST',body:fd});
    var d=await r.json();
    if(!d.secure_url) throw new Error('upload');
    await api('/auth/profile','PUT',{avatar_url:d.secure_url});
    if(ME) ME.avatar_url=d.secure_url;
    try{ localStorage.setItem('penc_usr', JSON.stringify(ME)); }catch(_){}
    _cropCancel(); try{renderProfileView();}catch(e){} try{renderStories();}catch(e){}
    showNotif('\u2705','Photo de profil','Mise a jour','green',null);
  }catch(err){ showNotif('\u274C','Erreur','Upload echoue, reessaie','red',null); var b=document.getElementById('cropOk'); if(b){b.disabled=false;b.textContent='Valider la photo';} }
}"""
s=R(s,ANCHOR,FUNCS,"Fonctions recadrage")

# 3) Build bump
s=R(s,"console.log('PENC build v109 (B5: mise a jour auto sans reinstaller)');",
      "console.log('PENC build v110 (B4: recadrage circulaire photo de profil)');","Build -> v110")

assert s.count('function openCropTool')==1 and s.count('function _cropConfirm')==1, "absent!"
data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v110.")
