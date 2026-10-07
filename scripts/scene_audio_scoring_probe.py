"""Synthetic scoring checks against local workflow code and real models; no DB writes."""
import argparse
import json
from pathlib import Path
import subprocess
import time

CASES = {
    'clear': ['私はソフトウェアエンジニアです。', '五人のチームを率いて予約システムを開発しました。',
              '要件定義と進捗管理を担当しました。'],
    'grammar_error': ['私はチームを管理するました。', '昨日システムを開発するました。', '会議で説明するました。'],
    'off_topic': ['今日は晴れですね。', '私は猫が好きです。', '昼ご飯はラーメンでした。'],
}

CODE = '''
import asyncio, json, sys
sys.path.insert(0, '/app/src')
from workflows.batch_evaluation import BatchEvaluationWorkflow
from workflows.scenario_review import ScenarioReviewWorkflow
from unittest.mock import AsyncMock
async def main():
    value=json.load(sys.stdin)
    task={'task_description':'自分の職業と担当したプロジェクトでの役割を説明してください。',
          'scenario_title':'自我介绍与职业背景说明'}
    if value['kind']=='window':
        turns=[{'user_content':text,'ai_response':'よくできました。'} for text in value['texts']]
        return await BatchEvaluationWorkflow()._call_llm(turns,task,'Chinese','Japanese')
    workflow=ScenarioReviewWorkflow()
    workflow._save_review_to_db=AsyncMock(return_value=True)
    workflow._generate_ai_feedback=AsyncMock(return_value=None)
    history=[{'id':str(i),'role':'user','content':'synthetic corrupted ASR', 'input_source':'audio',
        'audio_evidence':evidence} for i,evidence in enumerate(value['evidence'])]
    report=await workflow.generate_scenario_review('synthetic',0,task['scenario_title'],[task],history,None,'Chinese')
    return report['analysis']
print(json.dumps(asyncio.run(main()),ensure_ascii=False))
'''


def call(value):
    result = subprocess.run(['docker', 'exec', '-i', 'oral_app_workflow_service', 'python', '-c', CODE],
                            input=json.dumps(value), text=True, capture_output=True, timeout=60)
    if result.returncode:
        raise RuntimeError('local_model_probe_failed')
    return json.loads(result.stdout)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--live', action='store_true', required=True)
    parser.add_argument('--audio-results', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    rows = []
    for name, texts in CASES.items():
        for repeat in range(3):
            row = {'case': name, 'repeat': repeat + 1}
            started = time.monotonic()
            try:
                result = call({'kind': 'window', 'texts': texts})
                expected = {'clear': {'strong', 'mastered'}, 'grammar_error': {'needs_work', 'incorrect'},
                            'off_topic': {'off_topic'}}[name]
                row.update(result=result, passed=result['quality'] in expected)
            except Exception as exc:
                row.update(error=type(exc).__name__, passed=False)
            row['seconds'] = round(time.monotonic() - started, 3)
            rows.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)
    evidence = [row['result'] for row in json.loads(args.audio_results.read_text())['results'] if row['branch'] == 'advance']
    report = call({'kind': 'report', 'evidence': evidence})
    acoustic = {key: round(sum(e[key] for e in [r['speech_scores'] for r in evidence]) / len(evidence))
                for key in ('pronunciation', 'fluency', 'intonation')}
    report_pass = report['evaluation_status'] == 'completed' and all(report['detail_scores'][key] == value for key, value in acoustic.items())
    report_pass = report_pass and report['overall_score'] == round(sum(report['detail_scores'].values()) / 4)
    payload = {'source': 'synthetic only; real local-container model requests; no database writes',
               'windows': rows, 'report': report, 'report_passed': report_pass}
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    print(json.dumps({'report': report, 'passed': report_pass}, ensure_ascii=False))
    return 0 if report_pass and all(row['passed'] for row in rows) else 1


if __name__ == '__main__':
    raise SystemExit(main())
