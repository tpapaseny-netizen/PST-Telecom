with open('server-at.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Ajouter le schema SensmsUser avant connectDB().then(
schema = """// === SENSMS USER MODEL ===
var sensmsUserSchema = new (require('mongoose').Schema)({
  phone: String,
  email: String,
  name: String,
  password: String,
  pack: { type: String, default: 'Starter' },
  credits: { type: Number, default: 0 },
  sender_id: { type: String, default: 'SenSMS' },
  created_at: { type: Date, default: Date.now }
});
var SensmsUser = require('mongoose').models.SensmsUser || require('mongoose').model('SensmsUser', sensmsUserSchema);
// === FIN SENSMS USER MODEL ===

"""

if 'SensmsUser' not in content:
    content = content.replace('connectDB().then(() => {', schema + 'connectDB().then(() => {', 1)
    print("Schema SensmsUser ajoute")
else:
    print("Schema deja present")

# 2. Remplacer les db.collection('sensms_users') par SensmsUser
replacements = [
    (
        "await db.collection('sensms_users').findOne({ $or: [{ phone: identifier }, { email: identifier }] })",
        "await SensmsUser.findOne({ $or: [{ phone: identifier }, { email: identifier }] })"
    ),
    (
        "if (db) await db.collection('sensms_users').updateOne({ id: id }, { $set: { sender_id: sender_id.toUpperCase() } });",
        "await SensmsUser.updateOne({ _id: id }, { $set: { sender_id: sender_id.toUpperCase() } });"
    ),
    (
        "if (db) await db.collection('sensms_users').updateOne({ id: id }, { $set: { sender_id: sender_id.toUpperCase()\n) } });",
        "await SensmsUser.updateOne({ _id: id }, { $set: { sender_id: sender_id.toUpperCase() } });"
    ),
    (
        "var users = await db.collection('sensms_users').find({}).sort({ created_at: -1 }).toArray();",
        "var users = await SensmsUser.find({}).sort({ created_at: -1 }).lean();"
    ),
    (
        "var existing = await db.collection('sensms_users').findOne({ $or: [{ phone: phone }, { email: email && email.length > 0 ? email : null }] });",
        "var existing = await SensmsUser.findOne({ $or: [{ phone: phone }, { email: email && email.length > 0 ? email : null }] });"
    ),
    (
        "await db.collection('sensms_users').insertOne(newUser);",
        "var newSensmsDoc = new SensmsUser(newUser); await newSensmsDoc.save();"
    ),
    (
        "await db.collection('sensms_users').insertOne(user);",
        "var newSensmsDoc = new SensmsUser(user); await newSensmsDoc.save();"
    ),
]

for old, new in replacements:
    if old in content:
        content = content.replace(old, new)
        print("Remplace:", old[:60])

# Remplacement generique pour ce qui reste
import re
content = re.sub(
    r"await db\.collection\('sensms_users'\)\.findOne\(\{",
    "await SensmsUser.findOne({",
    content
)
content = re.sub(
    r"await db\.collection\('sensms_users'\)\.insertOne\((\w+)\);",
    r"var _sd = new SensmsUser(\1); await _sd.save();",
    content
)
content = re.sub(
    r"await db\.collection\('sensms_users'\)\.updateOne\(",
    "await SensmsUser.updateOne(",
    content
)
content = re.sub(
    r"await db\.collection\('sensms_users'\)\.find\(\{",
    "await SensmsUser.find({",
    content
)
# find({}).sort().toArray() -> find({}).sort().lean()
content = content.replace(".toArray();", ".lean();")

with open('server-at.js', 'w', encoding='utf-8') as f:
    f.write(content)

# Verification finale
import subprocess
result = subprocess.run(['findstr', '/n', 'sensms_users', 'server-at.js'], capture_output=True, text=True)
print("\ndb.collection sensms_users restants:")
print(result.stdout if result.stdout else "AUCUN - OK")
