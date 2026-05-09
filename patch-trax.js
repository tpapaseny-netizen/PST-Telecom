const fs = require('fs');

let content = fs.readFileSync('server-at.js', 'utf8');

const newRoutes = `// ═══════════════════════════════════════════════
// PST-TRAX ROUTES v3.2
// ═══════════════════════════════════════════════
function normalizePhone(p) {
  let n = (p||'').replace(/\\s/g,'').replace(/[^\\d]/g,'');
  if(n.startsWith('221')) n=n.slice(3);
  return n;
}
app.post('/api/trax/register', async (req,res) => {
  try {
    const {name,phone,role,vid,vType,password}=req.body;
    if(!phone||!name) return res.status(400).json({error:'Donnees manquantes'});
    const np=normalizePhone(phone);
    if(db){
      const ex=await db.collection('trax_users').findOne({$or:[{phone:np},{phone:'+221'+np}]});
      if(ex) return res.status(409).json({exists:true,error:'Numero deja inscrit'});
      const user={id:'U-'+Date.now(),name,phone:np,role,password:password||'',vid:vid||null,typeLabel:vType&&vType.label||null,typeIcon:vType&&vType.icon||null,createdAt:new Date()};
      await db.collection('trax_users').insertOne(user);
      const safe={id:user.id,name:user.name,phone:user.phone,role:user.role,vid:user.vid,typeLabel:user.typeLabel,typeIcon:user.typeIcon};
      return res.json({success:true,user:safe});
    }
    return res.json({success:true,user:{id:'U-'+Date.now(),name,phone:np,role,vid}});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/trax/login', async (req,res) => {
  try {
    const {phone,password}=req.body;
    if(!phone) return res.status(400).json({error:'Telephone requis'});
    const np=normalizePhone(phone);
    if(db){
      const user=await db.collection('trax_users').findOne({$or:[{phone:np},{phone:'+221'+np}]});
      if(!user) return res.status(404).json({error:'Compte introuvable'});
      if(user.password && user.password!==password) return res.status(401).json({error:'wrong_password'});
      const safe={id:user.id,name:user.name,phone:np,role:user.role,vid:user.vid,typeLabel:user.typeLabel,typeIcon:user.typeIcon};
      return res.json({success:true,user:safe});
    }
    return res.status(503).json({error:'DB indisponible'});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/trax/reset-password', async (req,res) => {
  try {
    const {phone,newPassword}=req.body;
    if(!phone||!newPassword) return res.status(400).json({error:'Donnees manquantes'});
    const np=normalizePhone(phone);
    if(!db) return res.status(503).json({error:'DB indisponible'});
    const r=await db.collection('trax_users').updateOne({$or:[{phone:np},{phone:'+221'+np}]},{$set:{password:newPassword,updatedAt:new Date()}});
    if(r.matchedCount===0) return res.status(404).json({error:'Compte introuvable'});
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.get('/api/trax/vehicles', async (req,res) => {
  try {
    if(db){
      const v=await db.collection('trax_vehicles').find({}).toArray();
      return res.json(v.map(function(x){delete x._id;return x;}));
    }
    res.json([]);
  }catch(e){res.json([]);}
});
app.post('/api/trax/vehicles', async (req,res) => {
  try {
    const v=req.body;
    if(!Array.isArray(v)) return res.status(400).json({error:'Format invalide'});
    if(db){
      await db.collection('trax_vehicles').deleteMany({});
      if(v.length>0){
        const clean=v.map(function(x){delete x._id;return x;});
        await db.collection('trax_vehicles').insertMany(clean);
      }
    }
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/trax/position', async (req,res) => {
  try {
    const d=req.body;
    if(!d.id||!d.lat||!d.lng) return res.status(400).json({error:'GPS manquant'});
    if(db){
      await db.collection('trax_vehicles').updateOne(
        {id:d.id},
        {$set:{lat:d.lat,lng:d.lng,speed:d.speed||0,status:d.status||'online',lastSeen:d.lastSeen||Date.now(),driver:d.driver,phone:d.phone}},
        {upsert:true}
      );
    }
    res.json({success:true});
  }catch(e){res.status(500).json({error:e.message});}
});
`;

// Find old TRAX block and replace it
const startTag = '// PST-TRAX ROUTES';
const endTag = '// \u2500\u2500\u2500 D\u00c9MARRAGE';

const startIdx = content.indexOf(startTag);
const endIdx = content.indexOf(endTag);

if(startIdx === -1) {
  console.log('Bloc TRAX non trouve - ajout avant DEMARRAGE');
  if(endIdx !== -1) {
    // Find the line start of endTag
    const lineStart = content.lastIndexOf('\n', endIdx);
    content = content.slice(0, lineStart+1) + newRoutes + '\n' + content.slice(lineStart+1);
  } else {
    content = content + '\n' + newRoutes;
  }
} else {
  // Find the actual start of that block (go back to find ===)
  const blockStart = content.lastIndexOf('\n', startIdx - 2);
  if(endIdx !== -1) {
    const lineStart = content.lastIndexOf('\n', endIdx);
    content = content.slice(0, blockStart+1) + newRoutes + '\n' + content.slice(lineStart+1);
  } else {
    content = content.slice(0, blockStart+1) + newRoutes;
  }
}

fs.writeFileSync('server-at.js', content, 'utf8');
console.log('OK - server-at.js patche avec succes');
console.log('Lignes:', content.split('\n').length);
