with open('zama.html', 'r', encoding='utf-8') as f:
    content = f.read()

# Corriger la fonction cpShareAddr qui a des vrais \n dans la string JS
old = """function cpShareAddr(){if(!_cpAddr)return;var text='Paiement ZAMA '+_cpLabel+'
Montant: '+_cpAmt+' '+_cpLabel.split(' ')[0]+'
Adresse: '+_cpAddr;if(navigator.share)navigator.share({title:'Paiement ZAMA',text:text}).catch(function(){});else navigator.clipboard.writeText(text).then(function(){toast('Copie !','ok');});}"""

new = """function cpShareAddr(){if(!_cpAddr)return;var text='Paiement ZAMA '+_cpLabel+' | Montant: '+_cpAmt+' '+_cpLabel.split(' ')[0]+' | Adresse: '+_cpAddr;if(navigator.share)navigator.share({title:'Paiement ZAMA',text:text}).catch(function(){});else navigator.clipboard.writeText(text).then(function(){toast('Copie !','ok');});}"""

if old in content:
    content = content.replace(old, new)
    print("OK - cpShareAddr corrigee")
else:
    # Correction par regex
    import re
    pattern = r"function cpShareAddr\(\)\{[^}]*\n[^}]*\n[^}]*\}"
    match = re.search(pattern, content)
    if match:
        content = content.replace(match.group(0), new)
        print("OK - cpShareAddr corrigee via regex")
    else:
        # Correction manuelle ligne par ligne
        lines = content.split('\n')
        fixed = []
        i = 0
        while i < len(lines):
            line = lines[i]
            if 'cpShareAddr' in line and 'Paiement ZAMA' in line and i+1 < len(lines) and 'Montant:' in lines[i+1]:
                # Fusionner les lignes cassees
                merged = line.rstrip() + ' ' + lines[i+1].lstrip()
                if i+2 < len(lines) and 'Adresse:' in lines[i+2]:
                    merged = merged.rstrip() + ' ' + lines[i+2].lstrip()
                    i += 3
                else:
                    i += 2
                fixed.append(new)
                print(f"OK - cpShareAddr fusionnee a la ligne {i}")
            else:
                fixed.append(line)
                i += 1
        content = '\n'.join(fixed)

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(content)

# Verifier
lines = content.split('\n')
for i, line in enumerate(lines[2558:2572], start=2559):
    print(f"{i}: {repr(line[:100])}")

print("\nTermine!")
