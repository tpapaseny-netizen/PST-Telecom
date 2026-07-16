# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v120 (selection multiple jusqu'a 10 photos pour statut)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v120 — selection multiple")

# 1) input #st-img : multiple
s=R(s,'<input type="file" id="st-img" accept="image/*" style="display:none" onchange="uploadStatus(event,\'image\')"/>',
      '<input type="file" id="st-img" accept="image/*" multiple style="display:none" onchange="uploadStatus(event,\'image\')"/>',
      "input multiple")

# 2) branche multi dans uploadStatus
s=R(s,
"async function uploadStatus(e,type){\n  var f=e.target.files[0];if(!f)return;e.target.value='';closeOl('ol-status');",
"async function uploadStatus(e,type){\n  if(type==='image' && e.target.files && e.target.files.length>1){ var _ff=e.target.files; closeOl('ol-status'); openMultiPhotoComposer(_ff); e.target.value=''; return; }\n  var f=e.target.files[0];if(!f)return;e.target.value='';closeOl('ol-status');",
"branche multi-photos")

# 3) CSS composer galerie
CSS=('<style id="mp-css">\n'
'.mp-wrap{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;width:100%;box-sizing:border-box;}\n'
'.mp-counter{color:#fff;font-weight:700;font-size:15px;margin-bottom:12px;text-align:center;}\n'
'.mp-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}\n'
'.mp-thumb{position:relative;aspect-ratio:1/1;border-radius:12px;overflow:hidden;background:#111;}\n'
'.mp-thumb img{width:100%;height:100%;object-fit:cover;display:block;}\n'
'.mp-rm{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;border:none;background:rgba(0,0,0,.62);color:#fff;font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}\n'
'</style>\n')
s=R(s,"\n</head>","\n"+CSS+"</head>","CSS composer multi")

# 4) Fonctions (avant publishStatus)
FUNCS=('function openMultiPhotoComposer(files){\n'
'  var arr=Array.prototype.slice.call(files).filter(function(f){return f && f.type && f.type.indexOf("image/")===0;}).slice(0,10);\n'
'  if(!arr.length) return;\n'
'  window._mpItems=arr.map(function(f){ return {file:f, url:URL.createObjectURL(f)}; });\n'
'  window._mpDuration=5;\n'
'  _renderMultiPhotoComposer();\n'
'}\n'
'function _renderMultiPhotoComposer(){\n'
'  var items=window._mpItems||[];\n'
'  var prev=document.getElementById("stCaptionPrev");\n'
'  if(!prev){ prev=document.createElement("div"); prev.id="stCaptionPrev"; prev.className="st-cap-prev"; document.body.appendChild(prev); }\n'
'  var durs=[["3s",3],["5s",5],["10s",10],["15s",15]];\n'
'  var durBtns=durs.map(function(d){ return \'<button class="st-dur-btn\'+(window._mpDuration===d[1]?" active":"")+\'" data-d="\'+d[1]+\'">\'+d[0]+\'</button>\'; }).join("");\n'
'  var grid=items.map(function(it,i){ return \'<div class="mp-thumb"><img src="\'+it.url+\'" alt=""/><button class="mp-rm" onclick="_mpRemove(\'+i+\')">&#xD7;</button></div>\'; }).join("");\n'
'  prev.innerHTML=\'<div class="mp-wrap"><div class="mp-counter">\'+items.length+\'/10 photos</div><div class="mp-grid">\'+grid+\'</div></div>\'\n'
'    +\'<div class="st-dur-row"><span class="st-dur-lbl">Duree / photo</span>\'+durBtns+\'</div>\'\n'
'    +\'<div class="st-cap-bar"><button class="st-cap-x" onclick="cancelMultiPhoto()">&#xD7;</button><input class="st-cap-input" id="stCapInput" placeholder="Sous-titre (optionnel)..." maxlength="100"/><button class="st-cap-btn" onclick="publishMultiPhoto()">Publier</button></div>\';\n'
'  prev.style.display="flex";\n'
'  prev.querySelectorAll(".st-dur-btn").forEach(function(b){ b.addEventListener("click",function(){ window._mpDuration=parseInt(b.dataset.d,10); prev.querySelectorAll(".st-dur-btn").forEach(function(x){x.classList.remove("active");}); b.classList.add("active"); }); });\n'
'}\n'
'function _mpRemove(i){\n'
'  var items=window._mpItems||[]; if(!items[i]) return;\n'
'  var capEl=document.getElementById("stCapInput"); var capVal=capEl?capEl.value:"";\n'
'  try{ URL.revokeObjectURL(items[i].url); }catch(e){}\n'
'  items.splice(i,1); window._mpItems=items;\n'
'  if(!items.length){ cancelMultiPhoto(); return; }\n'
'  _renderMultiPhotoComposer();\n'
'  var c2=document.getElementById("stCapInput"); if(c2) c2.value=capVal;\n'
'}\n'
'function cancelMultiPhoto(){\n'
'  var items=window._mpItems||[]; items.forEach(function(it){ try{URL.revokeObjectURL(it.url);}catch(e){} });\n'
'  window._mpItems=null;\n'
'  var prev=document.getElementById("stCaptionPrev"); if(prev) prev.style.display="none";\n'
'}\n'
'function _cldUploadOne(blob,onPct){\n'
'  return new Promise(function(resolve,reject){\n'
'    var fd=new FormData(); fd.append("file",blob); fd.append("upload_preset",CLD_PRESET);\n'
'    var xhr=new XMLHttpRequest();\n'
'    xhr.open("POST","https://api.cloudinary.com/v1_1/"+CLD_CLOUD+"/auto/upload");\n'
'    xhr.upload.onprogress=function(e){ if(e.lengthComputable && onPct) onPct(e.loaded/e.total); };\n'
'    xhr.onload=function(){ try{ var d=JSON.parse(xhr.responseText); if(d&&d.secure_url) resolve(d.secure_url); else reject(new Error((d&&d.error&&d.error.message)||"echec")); }catch(_){ reject(new Error("parse")); } };\n'
'    xhr.onerror=function(){ reject(new Error("reseau")); };\n'
'    xhr.send(fd);\n'
'  });\n'
'}\n'
'async function publishMultiPhoto(){\n'
'  var items=(window._mpItems||[]).slice();\n'
'  if(!items.length) return;\n'
'  var capEl=document.getElementById("stCapInput"); var caption=capEl?capEl.value.trim():"";\n'
'  var duration=window._mpDuration||5;\n'
'  cancelMultiPhoto();\n'
'  var ov=_stUploadOverlay();\n'
'  var urls=[];\n'
'  try{\n'
'    for(var i=0;i<items.length;i++){\n'
'      var base=i/items.length;\n'
'      var url=await _cldUploadOne(items[i].file, function(p){ _stSetPct((base + p/items.length)*97); });\n'
'      urls.push(url);\n'
'    }\n'
'  }catch(e){ _stHideOv(ov); showNotif("\\u274C","Statut","Erreur upload","red",null); return; }\n'
'  if(!urls.length){ _stHideOv(ov); return; }\n'
'  _stSetPct(100);\n'
'  try{ await api("/statuses","POST",{type:"image", media_urls:urls, caption:caption||null, duration:duration}); }catch(e){}\n'
'  _stHideOv(ov);\n'
'  loadStatuses(); showNotif("\\uD83D\\uDCF8", urls.length+" photos publiees","Visible 24h","green",null);\n'
'}\n')
s=R(s,"async function publishStatus(){",FUNCS+"async function publishStatus(){","Fonctions multi-photos")

# 5) Build bump
s=R(s,"console.log('PENC build v119 (barre de saisie propre: mic/envoi en flux)');",
      "console.log('PENC build v120 (statut multi-photos: selection jusqu a 10)');","Build -> v120")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v120.")
