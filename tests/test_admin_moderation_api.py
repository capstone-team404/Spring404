import importlib.util
import sys
from pathlib import Path
from fastapi.testclient import TestClient

BACKEND = Path(__file__).resolve().parents[1] / 'backend'
sys.path.insert(0, str(BACKEND))
spec = importlib.util.spec_from_file_location('moderation_backend', BACKEND/'main.py')
main = importlib.util.module_from_spec(spec)
spec.loader.exec_module(main)


def test_admin_requires_login_and_role(monkeypatch):
    client = TestClient(main.app)
    assert client.get('/admin/reports').status_code == 401
    main.app.dependency_overrides[main.require_user] = lambda: {'id':1,'gender_verified':True,'role':'user'}
    try:
        assert client.get('/admin/reports').status_code == 403
        assert client.patch('/admin/reviews/1/checked',json={'checked':True}).status_code == 403
        assert client.patch('/admin/reviews/1/restore').status_code == 403
    finally:
        main.app.dependency_overrides.clear()


def test_admin_actions_and_removed_endpoints(monkeypatch):
    calls=[]
    monkeypatch.setattr(main,'get_admin_reported_reviews',lambda: [])
    monkeypatch.setattr(main,'set_admin_checked',lambda *args: calls.append(args))
    monkeypatch.setattr(main,'restore_review_by_admin',lambda *args: calls.append(args))
    main.app.dependency_overrides[main.require_admin] = lambda: {'id':99}
    try:
        client=TestClient(main.app)
        assert client.get('/admin/reports').json() == {'reports':[]}
        assert client.patch('/admin/reviews/1/checked',json={'checked':True}).status_code == 200
        assert client.patch('/admin/reviews/1/restore').status_code == 200
        assert calls == [(1,True),(1,99)]
        assert client.request('DELETE','/admin/reviews/1',json={}).status_code == 404
    finally:
        main.app.dependency_overrides.clear()


def test_duplicate_report_returns_conflict(monkeypatch):
    def duplicate(*args): raise ValueError('이미 신고한 리뷰입니다.')
    monkeypatch.setattr(main,'report_review',duplicate)
    main.app.dependency_overrides[main.require_verified_user] = lambda: {'id':1}
    try:
        response=TestClient(main.app).post('/reviews/1/report',json={'reason':'기타'})
        assert response.status_code == 409
        assert response.json()['detail'] == '이미 신고한 리뷰입니다.'
    finally:
        main.app.dependency_overrides.clear()
