const fs = require('fs');

const newRoutes = `
// ═══════════════════════════════════════════════
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
      return res.json({success:true,user:{id:user.id,name:user.name,phone:user.phone,role:user.role,vid:user.vid,typeLabel:user.typeLabel}});
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
      return res.json({success:true,user:{id:user.id,name:user.name,phone:np,role:user.role,vid:user.vid,typeLabel:user.typeLabel}});
    }
    return res.status(503).json({error:'DB indisponible'});
  }catch(e){res.status(500).json({error:e.message});}
});
app.post('/api/trax/reset-password', async (req,res) => {
  try {
    const {phone,newPassword}=req.body;
    const np=normalizePhone(phone||'');
    if(!np||!newPassword) return res.status(400).json({error:'Donnees manquantes'});
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
      return res.json(v.map(function(x){var r=Object.assign({},x);delete r._id;return r;}));
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
      if(v.length>0) await db.collection('trax_vehicles').insertMany(v.map(function(x){var r=Object.assign({},x);delete r._id;return r;}));
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

// Patch both server-at.js and server.js
['server-at.js', 'server.js'].forEach(function(filename) {
  if (!fs.existsSync(filename)) {
    console.log('Fichier non trouve:', filename);
    return;
  }
  
  let content = fs.readFileSync(filename, 'utf8');
  
  // Remove old TRAX routes if they exist
  const startMarkers = [
    '// PST-TRAX ROUTES',
    '//PST-TRAX ROUTES',
    '// ═══════════════════════════════════════════════\n// PST-TRAX'
  ];
  
  let startIdx = -1;
  for (let m of startMarkers) {
    startIdx = content.indexOf(m);
    if (startIdx !== -1) {
      // Go back to find the === line
      const lineStart = content.lastIndexOf('\n', startIdx - 2);
      startIdx = lineStart + 1;
      break;
    }
  }
  
  // Find end marker (connectDB or DEMARRAGE)
  const endMarkers = ['connectDB()', 'connectDB().then', '// ─── DÉMARRAGE', '//─── DÉMARRAGE'];
  let endIdx = -1;
  for (let m of endMarkers) {
    endIdx = content.indexOf(m);
    if (endIdx !== -1) {
      endIdx = content.lastIndexOf('\n', endIdx) + 1;
      break;
    }
  }
  
  if (endIdx === -1) {
    console.log('Marqueur de fin non trouve dans', filename);
    return;
  }
  
  if (startIdx !== -1 && startIdx < endIdx) {
    // Replace existing block
    content = content.slice(0, startIdx) + newRoutes + '\n' + content.slice(endIdx);
    console.log('Routes TRAX remplacees dans', filename);
  } else {
    // Insert before connectDB
    content = content.slice(0, endIdx) + newRoutes + '\n' + content.slice(endIdx);
    console.log('Routes TRAX ajoutees dans', filename);
  }
  
  fs.writeFileSync(filename, content, 'utf8');
  console.log('OK -', filename, 'patche -', content.split('\n').length, 'lignes');
});
