import importlib.util
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import db


def ai_module():
    spec = importlib.util.spec_from_file_location('verified_ai', ROOT / 'ai/main.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_empty_legacy_data_gray_but_low_valid_review_has_data():
    assert db.score_information_status(None, {'public_safety_score': 0, 'cctv_count': 0}) == 'insufficient_data'
    assert db.score_information_status(0, {}) == 'available'
    assert db.score_information_status(None, {'cctv_count': 1}) == 'available'


def test_ai_secret_blocks_public_paid_calls(monkeypatch):
    module = ai_module()
    monkeypatch.setenv('AI_SERVICE_TOKEN', 'expected-secret')
    calls = []
    monkeypatch.setattr(module, 'analyze_review_with_ai', lambda text: calls.append(text))
    client = TestClient(module.app)
    assert client.post('/analyze', json={'review': 'test'}).status_code == 401
    assert calls == []


def test_ai_model_response_source_and_failure(monkeypatch):
    module = ai_module()
    monkeypatch.setenv('AI_SERVICE_TOKEN', 'test')
    monkeypatch.setattr(module, 'analyze_review_with_ai', lambda text: {'ai_score': 4, 'tags': [], 'summary': '밝은 길입니다.'})
    client = TestClient(module.app)
    headers = {'X-AI-Service-Token': 'test'}
    assert client.post('/analyze', json={'review': '조명이 밝은 골목입니다.'}, headers=headers).json()['analysis_source'] == 'openai'
    def fail(text): raise RuntimeError('do-not-leak')
    monkeypatch.setattr(module, 'analyze_review_with_ai', fail)
    result = client.post('/analyze', json={'review': '조명이 밝은 골목입니다.'}, headers=headers)
    assert result.json()['analysis_source'] == 'rule_fallback'
    assert 'do-not-leak' not in result.text
    assert client.post('/analyze', json={'review': 'x'*2001}, headers=headers).status_code == 422


def test_ai_output_contract_and_token_cap(monkeypatch):
    module = ai_module()
    calls = []
    def create(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"ai_score":4,"tags":[],"summary":"good"}'))])
    monkeypatch.setattr(module, 'client', SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create))))
    assert module.analyze_review_with_ai('test')['ai_score'] == 4
    assert calls[0]['max_completion_tokens'] == 400
    with pytest.raises(ValueError): module.validated_score({'ai_score': float('nan'), 'tags': [], 'summary': 'bad'})
    with pytest.raises(ValueError): module.validated_score({'tags': [], 'summary': 'missing score'})


def test_route_model_off_by_default(monkeypatch):
    module = ai_module()
    monkeypatch.delenv('AI_ROUTE_EXPLANATIONS_ENABLED', raising=False)
    monkeypatch.setattr(module, 'client', object())
    row = {'id': 'a', 'minSafetyScore': 3, 'averageSafetyScore': 4, 'coverageRatio': 1}
    assert module.generate_route_explanations([row])['a']['reason']


def test_bundled_ai_rules_match_backend():
    assert (ROOT/'ai/shared_review_rules.py').read_bytes() == (ROOT/'backend/review_analysis.py').read_bytes()


