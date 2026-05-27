import subprocess
result = subprocess.run(['node', '--check', 'server-at.js'], capture_output=True, text=True)
print('STDOUT:', result.stdout)
print('STDERR:', result.stderr)
print('Code:', result.returncode)