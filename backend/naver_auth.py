"""Link a Naver profile to the current member; this is not identity verification."""
import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode, urlsplit

import pymysql
import requests
from fastapi import HTTPException

from db import get_connection


def verification_mode():
    return os.getenv('AUTH_VERIFICATION_MODE', 'naver').strip().lower()


def settings():
    values = [os.getenv(key, '').strip() for key in (
        'NAVER_CLIENT_ID', 'NAVER_CLIENT_SECRET', 'NAVER_REDIRECT_URI', 'FRONTEND_URL')]
    if not all(values):
        raise HTTPException(503, '네이버 연결을 준비 중입니다. 잠시 후 다시 시도해 주세요.')
    for value in values[2:]:
        parsed = urlsplit(value)
        local = parsed.hostname in {'localhost', '127.0.0.1'}
        if (parsed.scheme != 'https' and not (local and parsed.scheme == 'http')) or not parsed.netloc or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise HTTPException(503, '네이버 연결 주소 설정을 확인해 주세요.')
    if urlsplit(values[3]).path not in {'', '/'}:
        raise HTTPException(503, '서비스 주소는 기본 도메인으로 설정해 주세요.')
    return (*values[:3], values[3].rstrip('/'))


def init_naver_tables(cursor):
    cursor.execute('''CREATE TABLE IF NOT EXISTS naver_login_state (
        state_hash CHAR(64) PRIMARY KEY, verifier_hash CHAR(64) NOT NULL,
        expires_at DATETIME NOT NULL)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS naver_link_state (
        state_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL, expires_at DATETIME NOT NULL,
        INDEX idx_naver_state_user (user_id))''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS naver_account_link (
        provider_id_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL UNIQUE,
        verified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')


def begin_connection(user_id):
    client_id, _, redirect_uri, _ = settings()
    state = secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            # Serializes starts per member; only the most recent attempt may complete.
            cursor.execute('SELECT id FROM users WHERE id=%s AND deleted_at IS NULL FOR UPDATE', (user_id,))
            if not cursor.fetchone():
                raise HTTPException(401, '다시 로그인해 주세요.')
            cursor.execute('DELETE FROM naver_link_state WHERE user_id=%s OR expires_at<=UTC_TIMESTAMP()', (user_id,))
            cursor.execute('INSERT INTO naver_link_state (state_hash,user_id,expires_at) VALUES (%s,%s,%s)',
                           (hashlib.sha256(state.encode()).hexdigest(), user_id, expires))
    return 'https://nid.naver.com/oauth2.0/authorize?' + urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect_uri, 'state': state})


def consume_state(state, user_id):
    if not isinstance(state, str) or not 20 <= len(state) <= 128:
        raise HTTPException(400, '연결 요청이 유효하지 않습니다. 다시 시작해 주세요.')
    state_hash = hashlib.sha256(state.encode()).hexdigest()
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT user_id,expires_at FROM naver_link_state WHERE state_hash=%s FOR UPDATE', (state_hash,))
            row = cursor.fetchone()
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            if not row or row['user_id'] != user_id or row['expires_at'] <= now:
                raise HTTPException(400, '연결 요청이 만료되었거나 계정이 다릅니다. 다시 시작해 주세요.')
            cursor.execute('DELETE FROM naver_link_state WHERE state_hash=%s', (state_hash,))


def fetch_profile(code, state):
    client_id, client_secret, redirect_uri, _ = settings()
    try:
        response = requests.post('https://nid.naver.com/oauth2.0/token', data={
            'grant_type': 'authorization_code', 'client_id': client_id, 'client_secret': client_secret,
            'code': code, 'state': state, 'redirect_uri': redirect_uri}, timeout=12)
        response.raise_for_status()
        token = response.json().get('access_token')
        if not isinstance(token, str) or not token:
            raise ValueError('Missing access token')
        response = requests.get('https://openapi.naver.com/v1/nid/me',
                                headers={'Authorization': f'Bearer {token}'}, timeout=12)
        response.raise_for_status()
        body = response.json()
        if body.get('resultcode') != '00' or not isinstance(body.get('response'), dict):
            raise ValueError('Invalid profile')
        profile = body['response']
    except (requests.RequestException, ValueError, TypeError, AttributeError):
        # Never expose request URLs, client secrets, tokens, or profile data in errors.
        raise HTTPException(502, '네이버에서 정보를 확인하지 못했습니다. 연결을 다시 시작해 주세요.') from None
    identifier = profile.get('id')
    if not isinstance(identifier, str) or not identifier or len(identifier) > 255:
        raise HTTPException(502, '네이버 계정 정보를 확인하지 못했습니다.')
    return hashlib.sha256(identifier.encode()).hexdigest(), profile.get('gender') == 'F'


def fetch_female_profile(code, state):
    identifier, female = fetch_profile(code, state)
    if not female:
        raise HTTPException(403, '네이버에서 성별 정보를 제공받지 못했습니다. 계정 정보와 제공 동의를 확인해 주세요.')
    return identifier


def begin_login():
    client_id, _, redirect_uri, _ = settings()
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
    expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=10)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM naver_login_state WHERE expires_at<=UTC_TIMESTAMP()')
            cursor.execute('INSERT INTO naver_login_state (state_hash,verifier_hash,expires_at) VALUES (%s,%s,%s)',
                           (hashlib.sha256(state.encode()).hexdigest(), hashlib.sha256(verifier.encode()).hexdigest(), expires))
    return {'authorization_url': 'https://nid.naver.com/oauth2.0/authorize?' + urlencode({
        'response_type': 'code', 'client_id': client_id, 'redirect_uri': redirect_uri, 'state': state}),
        'browser_verifier': verifier, 'state': state}


def complete_login(code, state, verifier):
    # A callback copied from a different browser cannot log a visitor into the attacker's account.
    with get_connection() as conn:
        with conn.cursor() as cursor:
            state_hash = hashlib.sha256(state.encode()).hexdigest()
            cursor.execute('SELECT verifier_hash,expires_at FROM naver_login_state WHERE state_hash=%s FOR UPDATE', (state_hash,))
            row = cursor.fetchone()
            if (not row or row['expires_at'] <= datetime.now(timezone.utc).replace(tzinfo=None)
                    or not secrets.compare_digest(row['verifier_hash'], hashlib.sha256(verifier.encode()).hexdigest())):
                raise HTTPException(400, '로그인 요청이 만료되었습니다. 다시 시작해 주세요.')
            cursor.execute('DELETE FROM naver_login_state WHERE state_hash=%s', (state_hash,))
    identifier, female = fetch_profile(code, state)
    from auth import public_user, SESSION_HOURS
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT user_id FROM naver_account_link WHERE provider_id_hash=%s FOR UPDATE', (identifier,))
                linked = cursor.fetchone()
                if linked:
                    user_id = linked['user_id']
                else:
                    # Internal identifier, never shown as a real email; password login is disabled.
                    cursor.execute("""INSERT INTO users (email,password_hash,nickname,status,
                        verification_status,terms_agreed_at,privacy_agreed_at)
                        VALUES (%s,%s,%s,'active','pending',UTC_TIMESTAMP(),UTC_TIMESTAMP())""",
                        ('naver_' + identifier + '@social.hereji.invalid', 'social-login-only', '여행자' + secrets.token_hex(5)))
                    user_id = cursor.lastrowid
                    cursor.execute('INSERT INTO naver_account_link (provider_id_hash,user_id) VALUES (%s,%s)', (identifier, user_id))
                cursor.execute("""UPDATE users SET gender_verified=%s,verification_provider='naver',
                    verification_status=%s,verified_at=UTC_TIMESTAMP(),status='active'
                    WHERE id=%s AND deleted_at IS NULL""", (female, 'verified' if female else 'pending', user_id))
                cursor.execute('SELECT * FROM users WHERE id=%s AND deleted_at IS NULL', (user_id,))
                user = cursor.fetchone()
                if not user:
                    raise HTTPException(401, '사용할 수 없는 계정입니다.')
                token = secrets.token_urlsafe(32)
                expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=SESSION_HOURS)
                cursor.execute('INSERT INTO auth_session (token_hash,user_id,expires_at) VALUES (%s,%s,%s)',
                               (hashlib.sha256(token.encode()).hexdigest(), user_id, expires))
                return {'access_token': token, 'token_type': 'bearer', 'user': public_user(user)}
    except pymysql.IntegrityError:
        raise HTTPException(409, '동시에 진행 중인 로그인이 있습니다. 다시 시도해 주세요.') from None


def link_account(user_id, provider_id_hash):
    try:
        with get_connection() as conn:
            with conn.cursor() as cursor:
                cursor.execute('SELECT id FROM users WHERE id=%s AND deleted_at IS NULL FOR UPDATE', (user_id,))
                if not cursor.fetchone():
                    raise HTTPException(401, '다시 로그인해 주세요.')
                cursor.execute('SELECT user_id FROM naver_account_link WHERE provider_id_hash=%s', (provider_id_hash,))
                linked = cursor.fetchone()
                if linked and linked['user_id'] != user_id:
                    raise HTTPException(409, '이미 다른 여기지 계정에 연결된 네이버 계정입니다.')
                cursor.execute('SELECT provider_id_hash FROM naver_account_link WHERE user_id=%s', (user_id,))
                current = cursor.fetchone()
                if current and current['provider_id_hash'] != provider_id_hash:
                    raise HTTPException(409, '이미 연결된 네이버 계정이 있습니다.')
                if not linked:
                    cursor.execute('INSERT INTO naver_account_link (provider_id_hash,user_id) VALUES (%s,%s)', (provider_id_hash, user_id))
                cursor.execute("""UPDATE users SET gender_verified=TRUE, verification_provider='naver',
                    verification_status='verified',verified_at=UTC_TIMESTAMP(),status='active'
                    WHERE id=%s AND deleted_at IS NULL""", (user_id,))
    except pymysql.IntegrityError:
        raise HTTPException(409, '이미 연결된 계정입니다. 다시 로그인해 확인해 주세요.') from None
