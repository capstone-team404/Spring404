import hashlib
import importlib.util
import sqlite3
import sys
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import auth
import naver_auth as naver


@pytest.fixture
def config(monkeypatch):
    for key, value in {
        'AUTH_VERIFICATION_MODE': 'naver', 'NAVER_CLIENT_ID': 'test-id',
        'NAVER_CLIENT_SECRET': 'never-return-this-secret',
        'NAVER_REDIRECT_URI': 'https://api.example.com/auth/naver/callback',
        'FRONTEND_URL': 'https://app.example.com',
    }.items():
        monkeypatch.setenv(key, value)


class Response:
    def __init__(self, data): self.data = data
    def raise_for_status(self): pass
    def json(self): return self.data


@pytest.mark.parametrize('gender', [None, 'U', 'M', 'unexpected'])
def test_only_female_profile_can_complete(monkeypatch, config, gender):
    monkeypatch.setattr(naver.requests, 'post', lambda *a, **k: Response({'access_token': 'private-token'}))
    monkeypatch.setattr(naver.requests, 'get', lambda *a, **k: Response({'resultcode': '00', 'response': {'id': 'provider-id', 'gender': gender}}))
    with pytest.raises(HTTPException) as exc:
        naver.fetch_female_profile('code', 's'*32)
    assert exc.value.status_code == 403


def test_female_profile_server_exchange_minimal_persistence(monkeypatch, config):
    calls = []
    def exchange(url, **kwargs):
        calls.append((url, kwargs))
        return Response({'access_token': 'private-token', 'refresh_token': 'private-refresh'})
    def profile(url, **kwargs):
        assert kwargs['headers']['Authorization'] == 'Bearer private-token'
        return Response({'resultcode': '00', 'response': {'id': 'provider-id', 'gender': 'F', 'name': 'not-stored'}})
    monkeypatch.setattr(naver.requests, 'post', exchange)
    monkeypatch.setattr(naver.requests, 'get', profile)
    assert naver.fetch_female_profile('code', 's'*32) == hashlib.sha256(b'provider-id').hexdigest()
    assert calls[0][1]['data']['state'] == 's'*32
    assert calls[0][1]['data']['client_secret'] == 'never-return-this-secret'


def test_provider_failure_is_safe(monkeypatch, config):
    def fail(*args, **kwargs):
        raise naver.requests.ConnectionError('secret-token-and-URL')
    monkeypatch.setattr(naver.requests, 'post', fail)
    with pytest.raises(HTTPException) as exc:
        naver.fetch_female_profile('code', 's'*32)
    assert exc.value.status_code == 502
    assert 'secret' not in exc.value.detail


@pytest.mark.parametrize('url', ['http://example.com', 'https://user:password@example.com', 'https://example.com/?return=evil', 'https://example.com/#fragment', 'https://example.com/path'])
def test_unsafe_frontend_url_rejected(monkeypatch, config, url):
    monkeypatch.setenv('FRONTEND_URL', url)
    with pytest.raises(HTTPException): naver.settings()


def test_demo_flag_does_not_pass_naver_mode(monkeypatch, config):
    user = {'id': 1, 'email': 'user@example.com', 'nickname': '여행자', 'gender_verified': True}
    assert auth.public_user(user)['gender_verified'] is False
    user['verification_provider'] = 'demo'
    assert auth.public_user(user)['gender_verified'] is False
    user['verification_provider'] = 'naver'
    assert auth.public_user(user)['gender_verified'] is True
    with pytest.raises(HTTPException) as exc: auth.verify_gender(1, 'HEREJI404')
    assert exc.value.status_code == 403
    monkeypatch.setenv('AUTH_VERIFICATION_MODE', 'demo')
    user['verification_provider'] = 'demo'
    assert auth.public_user(user)['gender_verified'] is True


@pytest.fixture
def database(monkeypatch):
    conn = sqlite3.connect(':memory:', detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    conn.executescript('''
        CREATE TABLE users (id INTEGER PRIMARY KEY, deleted_at TEXT, gender_verified INTEGER,
            verification_provider TEXT, verification_status TEXT, verified_at timestamp, status TEXT);
        INSERT INTO users (id,gender_verified) VALUES (1,0),(2,0);
        CREATE TABLE naver_link_state (state_hash TEXT PRIMARY KEY, user_id INTEGER, expires_at timestamp);
        CREATE TABLE naver_account_link (provider_id_hash TEXT PRIMARY KEY, user_id INTEGER UNIQUE);
    ''')
    class Cursor:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def execute(self, sql, values=()):
            sql = sql.replace('%s', '?').replace(' FOR UPDATE', '').replace('UTC_TIMESTAMP()', 'CURRENT_TIMESTAMP')
            self.cursor = conn.execute(sql, values)
        def fetchone(self):
            row = self.cursor.fetchone()
            return dict(row) if row else None
    class Connection:
        def cursor(self): return Cursor()
    @contextmanager
    def connection():
        try:
            yield Connection()
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    monkeypatch.setattr(naver, 'get_connection', connection)
    yield conn
    conn.close()


def test_state_bound_to_member_single_use_and_new_attempt(database, config):
    url = naver.begin_connection(1)
    state = parse_qs(urlsplit(url).query)['state'][0]
    assert state not in str(database.execute('SELECT * FROM naver_link_state').fetchall())
    with pytest.raises(HTTPException): naver.consume_state(state, 2)
    naver.consume_state(state, 1)
    with pytest.raises(HTTPException): naver.consume_state(state, 1)
    old = parse_qs(urlsplit(naver.begin_connection(1)).query)['state'][0]
    new = parse_qs(urlsplit(naver.begin_connection(1)).query)['state'][0]
    with pytest.raises(HTTPException): naver.consume_state(old, 1)
    naver.consume_state(new, 1)


def test_expired_state_rejected(database):
    state = 's'*32
    database.execute('INSERT INTO naver_link_state VALUES (?,?,?)', (hashlib.sha256(state.encode()).hexdigest(), 1, datetime.utcnow() - timedelta(minutes=1)))
    database.commit()
    with pytest.raises(HTTPException): naver.consume_state(state, 1)


def test_duplicate_provider_and_switch_are_rejected(database):
    naver.link_account(1, 'a'*64)
    assert database.execute('SELECT verification_provider FROM users WHERE id=1').fetchone()[0] == 'naver'
    with pytest.raises(HTTPException) as exc: naver.link_account(2, 'a'*64)
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException): naver.link_account(1, 'b'*64)
    assert database.execute('SELECT gender_verified FROM users WHERE id=2').fetchone()[0] == 0


def test_callback_does_not_link_without_authenticated_completion(monkeypatch, config):
    spec = importlib.util.spec_from_file_location('naver_backend_test', ROOT / 'backend/main.py')
    main = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(main)
    client = TestClient(main.app)
    calls = []
    monkeypatch.setattr(main, 'link_account', lambda *args: calls.append(args))
    response = client.get('/auth/naver/callback', params={'code': 'test-code', 'state': 's'*32}, follow_redirects=False)
    assert response.status_code == 303
    assert response.headers['location'].startswith('https://app.example.com/#naver_code=')
    assert response.headers['referrer-policy'] == 'no-referrer'
    assert calls == []
    assert client.post('/auth/naver/complete', json={'code': 'test-code', 'state': 's'*32}).status_code == 401
    assert client.post('/auth/naver/start').status_code == 401
    assert 'never-return-this-secret' not in client.get('/auth/verification-config').text
    main.app.dependency_overrides[main.require_user] = lambda: {'id': 1}
    monkeypatch.setattr(main, 'consume_state', lambda state, uid: calls.append(('state', uid)))
    monkeypatch.setattr(main, 'fetch_female_profile', lambda *args: 'a'*64)
    try:
        assert client.post('/auth/naver/complete', json={'code': 'test-code', 'state': 's'*32}).status_code == 200
        assert calls == [('state', 1), (1, 'a'*64)]
        assert client.post('/auth/naver/complete', json={'code': '', 'state': 'short'}).status_code == 422
        assert client.post('/auth/naver/start', json={'consent': False}).status_code == 422
    finally:
        main.app.dependency_overrides.clear()
