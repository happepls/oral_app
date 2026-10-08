"""Live, synthetic-only speech evidence acceptance (no database or real histories)."""
import argparse
import asyncio
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'services/ai-omni-service/app'))
from dotenv import load_dotenv
from audio_evidence import hear
from dashscope_config import resolve_dashscope_config

CASES = {
    'correct': '私は五人のチームを管理するました。',
    'clarify': '予算は五十、いや五百くらいで、人数は十五か五十でした。',
    'advance': '私は五人のチームを率いて、予約システムを開発しました。',
}


async def run(args):
    load_dotenv(args.env_file)
    config = resolve_dashscope_config(os.environ)
    results = []
    with tempfile.TemporaryDirectory(prefix='scene-synthetic-audio-') as folder:
        for branch, text in CASES.items():
            aiff, pcm = Path(folder) / 'sample.aiff', Path(folder) / 'sample.pcm'
            subprocess.run(['say', '-v', 'Kyoko', '-o', str(aiff), text], check=True)
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(aiff), '-ar', '16000',
                            '-ac', '1', '-f', 's16le', str(pcm)], check=True)
            data = pcm.read_bytes()
            for repeat in range(1, 4):
                started = time.monotonic()
                row = {'branch': branch, 'repeat': repeat, 'synthetic_input': text}
                try:
                    row['result'] = await hear(data, config)
                    result = row['result']
                    heard = result['heard_text']
                    if branch == 'correct':
                        passed = result['status'] == 'clear' and '管理するました' in heard
                    elif branch == 'clarify':
                        passed = result['status'] == 'uncertain' and not any(x in heard for x in ('万円', 'ドル'))
                    else:
                        passed = result['status'] == 'clear' and '予約システム' in heard and '開発しました' in heard
                    if result['status'] == 'clear':
                        passed = passed and isinstance(result.get('speech_scores'), dict)
                    row['pass'] = passed
                except Exception as exc:
                    row.update(error_type=type(exc).__name__, **{'pass': False})
                row['elapsed_seconds'] = round(time.monotonic() - started, 3)
                results.append(row)
                print(json.dumps(row, ensure_ascii=False), flush=True)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'model': 'qwen3.8-omni-flash-realtime',
        'source': 'synthetic macOS Kyoko PCM16 16kHz', 'results': results}, ensure_ascii=False, indent=2))
    return 0 if all(row['pass'] for row in results) else 1


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True)
    parser.add_argument('--env-file', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    raise SystemExit(asyncio.run(run(parser.parse_args())))
