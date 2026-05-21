with open("server-at.js","r",encoding="utf-8") as f:
    c=f.read()
orig=len(c)
c=c.replace("const zamaOtpStore = {};","",1)
c=c.replace("app.use(express.static(path.join(__dirname)));\n","app.use(express.static(path.join(__dirname)));\nconst zamaOtpStore = {};\n",1)
c=c.replace("await envoyerSMSInfobip(ph, msg);smsSent = true;","await envoyerSMSInfobip(ph, msg);\n        smsSent = true;")
c=c.replace("   let smsSent = false; if (!emailSent) {","    let smsSent = false;\n    if (!emailSent) {")
with open("server-at.js","w",encoding="utf-8") as f:
    f.write(c)
print("OK taille:",len(c),"original:",orig)
