"""Cross-platform local launcher. Run --setup once; no shell evaluation of .env."""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import venv

ROOT = Path(__file__).resolve().parents[1]
PYTHON = ROOT / '.venv' / ('Scripts/python.exe' if os.name == 'nt' else 'bin/python')
NPM = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')


def local_environment():
    env = dict(os.environ)
    file = ROOT / '.env'
    if file.exists():
        for line in file.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            key, value = line.split('=', 1)
            key = key.strip()
            if key in {'DATABASE_URL', 'APP_ORIGIN', 'COOKIE_SECURE', 'TWELVE_DATA_API_KEY', 'API_URL'}:
                env[key] = value.strip().strip('\"').strip("'")
    env.setdefault('APP_ORIGIN', 'http://localhost:3000')
    env.setdefault('API_URL', 'http://127.0.0.1:8000')
    env['NEXT_TELEMETRY_DISABLED'] = '1'
    return env


def main():
    parser = argparse.ArgumentParser(description='EA Inversión · desarrollo local')
    parser.add_argument('--setup', action='store_true', help='Instala las dependencias fijadas y termina.')
    args = parser.parse_args()
    if not NPM:
        raise SystemExit('Instala Node.js 22.17 o posterior y vuelve a ejecutar este comando.')
    if args.setup:
        if not PYTHON.exists():
            venv.EnvBuilder(with_pip=True).create(ROOT / '.venv')
        subprocess.run([str(PYTHON), '-m', 'pip', 'install', '-r', 'backend/requirements.txt'], cwd=ROOT, check=True)
        subprocess.run([NPM, 'ci', '--prefix', 'frontend'], cwd=ROOT, check=True)
        print('Listo. Ejecuta: python scripts/dev.py')
        return
    if not PYTHON.exists() or not (ROOT / 'frontend/node_modules/next').exists():
        raise SystemExit('Primero ejecuta: python scripts/dev.py --setup')
    env = local_environment()
    web_env = {k: v for k, v in env.items() if k not in {'DATABASE_URL', 'TWELVE_DATA_API_KEY'}}
    processes = []
    try:
        processes.append(subprocess.Popen([str(PYTHON), '-m', 'uvicorn', 'app.main:app', '--app-dir', 'backend', '--host', '127.0.0.1', '--port', '8000'], cwd=ROOT, env=env))
        processes.append(subprocess.Popen([NPM, '--prefix', 'frontend', 'run', 'dev'], cwd=ROOT, env=web_env))
        print('Abre http://localhost:3000 · Ctrl+C para detener ambos servidores.', flush=True)
        while all(p.poll() is None for p in processes):
            time.sleep(.5)
    except KeyboardInterrupt:
        pass
    finally:
        for process in reversed(processes):
            if process.poll() is None:
                process.terminate()
        for process in processes:
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()


if __name__ == '__main__':
    main()
