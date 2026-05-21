with open("server-at.js", "r", encoding="utf-8") as f:
    lines = f.readlines()

# Ligne 3155 = index 3154 (0-based)
# Supprimer la declaration dupliquee et remplacer par une reference a la variable existante
target_line = 3154  # index 0-based

if "const INFOBIP_API_KEY" in lines[target_line]:
    print("Ligne trouvee:", lines[target_line].strip())
    # Remplacer par une variable locale qui reutilise la cle existante
    lines[target_line] = "const INFOBIP_API_KEY_SEN = INFOBIP_API_KEY;\n"
    print("Remplace par: const INFOBIP_API_KEY_SEN = INFOBIP_API_KEY;")
    
    # Mettre a jour les utilisations dans le bloc Sen-SMS
    # Chercher et remplacer INFOBIP_API_KEY_SEN dans le fichier
    content = "".join(lines)
    # La route Sen-SMS utilise INFOBIP_API_KEY — remplacer par INFOBIP_API_KEY_SEN
    # dans le bloc apres la ligne 3155
    idx = content.find("const INFOBIP_API_KEY_SEN = INFOBIP_API_KEY;")
    bloc_sensms = content[idx:]
    bloc_sensms = bloc_sensms.replace(
        "'App ' + INFOBIP_API_KEY,",
        "'App ' + INFOBIP_API_KEY_SEN,"
    )
    content = content[:idx] + bloc_sensms
    
    with open("server-at.js", "w", encoding="utf-8") as f:
        f.write(content)
    print("OK: fichier sauvegarde")
else:
    print("ERREUR: ligne", target_line+1, "ne contient pas INFOBIP_API_KEY")
    print("Contenu:", lines[target_line].strip())
