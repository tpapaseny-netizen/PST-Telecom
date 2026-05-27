with open('server-at.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Trouver le debut et la fin du bloc ancien SenSMS MongoDB
start_line = None
end_line = None

for i, l in enumerate(lines):
    # Chercher le debut du schema mongoose SenSMS
    if 'sensmsSchema' in l or '_sensmsSchema' in l or 'SensmsUser' in l:
        if start_line is None or i < start_line:
            # Remonter pour trouver le debut du commentaire
            j = i
            while j > 0 and ('SenSMS' in lines[j] or 'sensms' in lines[j].lower() or lines[j].strip() == '' or lines[j].strip().startswith('//')):
                j -= 1
            start_line = j + 1

print(f'Debut bloc ancien SenSMS: ligne {start_line+1}')

# Trouver la derniere route /api/sensms/
last_sensms_route = None
for i, l in enumerate(lines):
    if '/api/sensms/' in l:
        last_sensms_route = i

if last_sensms_route:
    # Trouver la fermeture de cette route
    j = last_sensms_route
    while j < len(lines):
        if lines[j].strip() == '});' and j > last_sensms_route:
            end_line = j
            break
        j += 1

print(f'Fin bloc ancien SenSMS: ligne {end_line+1 if end_line else "?"} ')
print()
print('=== Lignes du bloc a supprimer ===')
if start_line and end_line:
    for i in range(start_line, min(start_line+10, end_line+1)):
        print(f'{i+1}: {lines[i].rstrip()}')
    print('...')
    for i in range(max(start_line, end_line-5), end_line+1):
        print(f'{i+1}: {lines[i].rstrip()}')
