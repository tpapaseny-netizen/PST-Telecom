# -*- coding: utf-8 -*-
"""
PENC — Patch v73
Redesign premium de la page Connexion / Inscription (#screen-auth).
100% VISUEL : aucune logique d'auth, aucun ID, aucune route touchee.
Tous les changements sont scopes a #screen-auth (le reste de l'app intact).

Lancer depuis le dossier contenant messager.html :
    python patch_v73_login.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1). Aucune modif." % (label, n))
        sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v73 — Login premium")

# 1) Fond : gradient blanc -> gris tres clair
s = R(s,
  "#screen-auth{ background:#F8F9FA; color:#1a1a1a; justify-content:center; align-items:center; overflow-y:auto; padding:24px 18px; }",
  "#screen-auth{ background:linear-gradient(180deg,#FFFFFF 0%,#F5F5F5 100%); color:#1a1a1a; justify-content:center; align-items:center; overflow-y:auto; padding:24px 18px; }",
  "Fond gradient")

# 2) Logo P : lueur douce autour
s = R(s,
  "#screen-auth .auth-logo-p{ display:inline-flex; margin-bottom:12px; filter:drop-shadow(0 8px 18px rgba(0,200,150,.35)); }",
  "#screen-auth .auth-logo-p{ display:inline-flex; margin-bottom:12px; filter:drop-shadow(0 0 26px rgba(0,200,150,.45)) drop-shadow(0 10px 18px rgba(0,200,150,.22)); }",
  "Lueur logo")

# 3) Carte : radius 24, padding 36, ombre tres douce, sans bordure
s = R(s,
  "#screen-auth .auth-box{ background:#fff; max-width:420px; border:1px solid #EEE; box-shadow:0 4px 24px rgba(0,0,0,.08); border-radius:20px; padding:30px 26px; }",
  "#screen-auth .auth-box{ background:#fff; max-width:420px; border:none; box-shadow:0 12px 44px rgba(0,0,0,.07), 0 2px 8px rgba(0,0,0,.04); border-radius:24px; padding:36px 30px; }",
  "Carte premium")

# 4) Toggle : fond #EEEEEE, radius 14
s = R(s,
  "#screen-auth .auth-tabs{ display:flex; gap:6px; background:#F1F3F5; border-radius:13px; padding:4px; margin-bottom:20px; }",
  "#screen-auth .auth-tabs{ display:flex; gap:5px; background:#EEEEEE; border-radius:14px; padding:5px; margin-bottom:22px; }",
  "Toggle conteneur")

# 5) Onglet actif : blanc, texte teal, ombre legere
s = R(s,
  "#screen-auth .auth-tab.active{ background:#00C896; color:#fff; box-shadow:0 3px 10px rgba(0,200,150,.3); }",
  "#screen-auth .auth-tab.active{ background:#fff; color:#00C896; box-shadow:0 2px 8px rgba(0,0,0,.10); }",
  "Onglet actif")

# 6) Champs : fond #F7F7F7, sans bordure visible, radius 14, hauteur 56, texte 16/#1A1A1A
s = R(s,
  "#screen-auth .form-input{ width:100%; box-sizing:border-box; border:1.5px solid #E0E0E0; border-radius:12px; padding:14px 16px 14px 42px; font-size:15px; background:#fff; color:#1a1a1a; transition:border-color .25s, box-shadow .25s; }",
  "#screen-auth .form-input{ width:100%; box-sizing:border-box; height:56px; border:1.5px solid transparent; border-radius:14px; padding:0 16px 0 48px; font-size:16px; background:#F7F7F7; color:#1A1A1A; transition:border-color .2s, box-shadow .2s, background .2s; }",
  "Champs de saisie")

# 7) Focus : bordure teal 1.5px + lueur tres legere + fond blanc
s = R(s,
  "#screen-auth .form-input:focus{ outline:none; border-color:#00C896; box-shadow:0 0 0 3px rgba(0,200,150,.12); }",
  "#screen-auth .form-input:focus{ outline:none; border-color:#00C896; background:#fff; box-shadow:0 0 0 4px rgba(0,200,150,.10); }",
  "Focus champ")

# 8) Icone gauche : alignee a 18px + centrage vertical garanti (champs 56px)
s = R(s,
  "#screen-auth .af-ic{ position:absolute; left:14px; width:18px; height:18px; color:#9aa0a6; pointer-events:none; }",
  "#screen-auth .af-ic{ position:absolute; left:18px; top:50%; transform:translateY(-50%); width:18px; height:18px; color:#9aa0a6; pointer-events:none; }",
  "Icone gauche centree")

# 9) Oeil mot de passe : centrage vertical garanti
s = R(s,
  "#screen-auth .af-eye{ position:absolute; right:8px; background:none; border:none; padding:8px; color:#9aa0a6; cursor:pointer; display:flex; align-items:center; }",
  "#screen-auth .af-eye{ position:absolute; right:8px; top:50%; transform:translateY(-50%); background:none; border:none; padding:8px; color:#9aa0a6; cursor:pointer; display:flex; align-items:center; }",
  "Oeil centre")

# 10) Bouton : hauteur 56, radius 16, texte 17, ombre coloree 0 8px 20px
s = R(s,
  "#screen-auth .btn-primary{ display:block; width:100%; height:52px; background:#00C896; color:#fff; border:none; border-radius:14px; font-size:16px; font-weight:700; cursor:pointer; box-shadow:0 4px 16px rgba(0,200,150,.35); transition:transform .12s, box-shadow .25s, opacity .2s; margin-top:6px; }",
  "#screen-auth .btn-primary{ display:block; width:100%; height:56px; background:#00C896; color:#fff; border:none; border-radius:16px; font-size:17px; font-weight:700; cursor:pointer; box-shadow:0 8px 20px rgba(0,200,150,.30); transition:transform .12s, box-shadow .25s, opacity .2s; margin-top:8px; }",
  "Bouton Se connecter")

# 11) Lien mot de passe oublie : teal, sans soulignement, 14px
s = R(s,
  "#screen-auth .auth-link{ text-align:center; margin-top:15px; color:#00C896; font-size:13.5px; font-weight:600; text-decoration:underline; cursor:pointer; }",
  "#screen-auth .auth-link{ text-align:center; margin-top:18px; color:#00C896; font-size:14px; font-weight:600; text-decoration:none; cursor:pointer; }",
  "Lien mot de passe oublie")

# 12) Bump build
s = R(s,
  "console.log('PENC build v72 (newchat: bouton Message premium + fix emoji + demande ami prioritaire)');",
  "console.log('PENC build v73 (login premium redesign: gradient + champs 56px + toggle blanc + bouton teal)');",
  "Marqueur de build -> v73")

# Garde-fous : les IDs/logique d'auth doivent toujours etre la
for must in ["doLogin()", "doRegister()", "switchTab('login')", "_authTogglePw('l-pw'", "_checkUsername(", "_pwStrength("]:
    assert must in s, "REGRESSION : '%s' a disparu !" % must

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v73 (login premium).")
print("Verifie : node check.js")
