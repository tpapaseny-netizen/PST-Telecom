import re

s = open('server-at.js', 'r', encoding='utf-8').read()

# Compter les occurrences de GO2RTC_URL
count = s.count('GO2RTC_URL')
print(f'Avant: {count} occurrences GO2RTC_URL')

# Trouver et supprimer tous les blocs RTSP en gardant seulement le premier
# Le bloc commence par "const GO2RTC_URL" et se termine avant "// ─── DÉMARRAGE"
marker_start = '// ROUTES PST RTSP CONVERTER'
marker_end = '// ─── DÉMARRAGE'

# Compter combien de blocs RTSP il y a
blocks = s.count(marker_start)
print(f'Blocs RTSP trouvés: {blocks}')

if blocks > 1:
    # Garder tout jusqu'au premier bloc RTSP inclus
    first_idx = s.find(marker_start)
    # Trouver le début du deuxième bloc
    second_idx = s.find(marker_start, first_idx + 1)
    # Trouver la fin du dernier bloc (juste avant DÉMARRAGE)
    last_rtsp_end = s.rfind(marker_end)
    
    # Reconstruire: avant le deuxième bloc + DÉMARRAGE et tout ce qui suit
    s_clean = s[:second_idx] + s[last_rtsp_end:]
    
    open('server-at.js', 'w', encoding='utf-8').write(s_clean)
    print(f'Après: {s_clean.count("GO2RTC_URL")} occurrences GO2RTC_URL')
    print('OK - doublons supprimés')
else:
    print('Pas de doublons détectés - recherche alternative...')
    # Chercher const GO2RTC_URL
    const_count = s.count('const GO2RTC_URL')
    print(f'const GO2RTC_URL: {const_count} fois')

