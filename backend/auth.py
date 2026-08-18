import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, Header, HTTPException

from db import get_connection

PBKDF2_ITERATIONS = 310_000
SESSION_HOURS = int(os.getenv('SESSION_HOURS', '168'))
GENDER_TEST_CODE = os.getenv('GENDER_TEST_CODE', 'HEREJI404')


def _admin_emails():
    return {
        email.strip().lower()
        for email in os.getenv('ADMIN_EMAILS', '').split(',')
        if email.strip()
    }


def _hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, PBKDF2_ITERATIONS)
    return f'pbkdf2_sha256${PBKDF2_ITERATIONS}${base64.b64encode(salt).decode()}${base64.b64encode(digest).decode()}'


def _verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations, salt, expected = encoded.split('$', 3)
        if algorithm != 'pbkdf2_sha256':
            return False
        actual = hashlib.pbkdf2_hmac('sha256', password.encode(), base64.b64decode(salt), int(iterations))
        return hmac.compare_digest(actual, base64.b64decode(expected))
    except (ValueError, TypeError):
        return False


def init_auth_tables(cursor):
    cursor.execute('''CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY, email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL, nickname VARCHAR(50) NOT NULL,
        gender_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
    cursor.execute('''CREATE TABLE IF NOT EXISTS auth_session (
        token_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL,
        expires_at DATETIME NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_session_user (user_id), FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE)''')
    user_columns = {
        'profile_image': 'LONGTEXT NULL',
        'deleted_at': 'DATETIME NULL',
        'role': "VARCHAR(20) NOT NULL DEFAULT 'user'",
        'status': "VARCHAR(20) NOT NULL DEFAULT 'active'",
        'verification_status': "VARCHAR(30) NOT NULL DEFAULT 'pending'",
        'verified_at': 'DATETIME NULL',
        'terms_agreed_at': 'DATETIME NULL',
        'privacy_agreed_at': 'DATETIME NULL',
    }
    for column_name, definition in user_columns.items():
        cursor.execute(
            """SELECT COUNT(*) AS column_count FROM information_schema.COLUMNS
               WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME=%s""",
            (column_name,),
        )
        if cursor.fetchone()['column_count'] == 0:
            cursor.execute(f'ALTER TABLE users ADD COLUMN {column_name} {definition}')
    cursor.execute(
        """UPDATE users
           SET verification_status='verified', verified_at=COALESCE(verified_at, created_at), status='active'
           WHERE gender_verified=TRUE AND verification_status<>'verified'"""
    )


def public_user(row):
    role = row.get('role') or 'user'
    if row['email'].lower().strip() in _admin_emails():
        role = 'admin'
    return {
        'id': row['id'],
        'email': row['email'],
        'nickname': row['nickname'],
        'profile_image': row.get('profile_image'),
        'role': role,
        'status': row.get('status') or 'active',
        'gender_verified': bool(row['gender_verified']),
        'verification_status': row.get('verification_status') or ('verified' if row['gender_verified'] else 'pending'),
        'verified_at': row.get('verified_at'),
    }


def signup_user(email, password, nickname):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT id FROM users WHERE email=%s AND deleted_at IS NULL', (email.lower().strip(),))
            if cursor.fetchone():
                raise HTTPException(409, detail='이미 가입된 이메일입니다.')
            cursor.execute('SELECT id FROM users WHERE nickname=%s AND deleted_at IS NULL', (nickname.strip(),))
            if cursor.fetchone():
                raise HTTPException(409, detail='이미 사용 중인 닉네임입니다.')
            cursor.execute(
                '''INSERT INTO users (
                       email,password_hash,nickname,status,verification_status,
                       terms_agreed_at,privacy_agreed_at
                   ) VALUES (%s,%s,%s,'pending_verification','pending',UTC_TIMESTAMP(),UTC_TIMESTAMP())''',
                (email.lower().strip(), _hash_password(password), nickname.strip()),
            )
            user_id = cursor.lastrowid
            cursor.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            return public_user(cursor.fetchone())


def login_user(email, password):
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('SELECT * FROM users WHERE email=%s AND deleted_at IS NULL', (email.lower().strip(),))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(404, detail='가입되지 않은 이메일입니다.')
            if not _verify_password(password, row['password_hash']):
                raise HTTPException(401, detail='비밀번호가 올바르지 않습니다.')
            token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(token.encode()).hexdigest()
            expires = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=SESSION_HOURS)
            cursor.execute('INSERT INTO auth_session (token_hash,user_id,expires_at) VALUES (%s,%s,%s)', (token_hash, row['id'], expires))
            return token, public_user(row)


def _token(authorization: str | None):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(401, detail='로그인이 필요합니다.')
    return authorization[7:]


def require_user(authorization: str | None = Header(default=None)):
    token = _token(authorization)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('''SELECT u.* FROM auth_session s JOIN users u ON u.id=s.user_id
                WHERE s.token_hash=%s AND s.expires_at>UTC_TIMESTAMP() AND u.deleted_at IS NULL''', (hashlib.sha256(token.encode()).hexdigest(),))
            row = cursor.fetchone()
            if not row:
                raise HTTPException(401, detail='세션이 만료되었습니다.')
            return public_user(row)


def require_verified_user(user=Depends(require_user)):
    if not user['gender_verified']:
        raise HTTPException(403, detail='인증을 완료해 주세요.')
    return user


def require_admin(user=Depends(require_verified_user)):
    if user.get('role') != 'admin':
        raise HTTPException(403, detail='관리자만 접근할 수 있습니다.')
    return user


def verify_gender(user_id, test_code):
    if not hmac.compare_digest(test_code.strip(), GENDER_TEST_CODE):
        raise HTTPException(400, detail='인증 코드가 올바르지 않습니다.')
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(
                '''UPDATE users
                   SET gender_verified=TRUE, verification_status='verified',
                       verified_at=UTC_TIMESTAMP(), status='active'
                   WHERE id=%s AND deleted_at IS NULL''',
                (user_id,),
            )
            if cursor.rowcount == 0:
                raise HTTPException(404, detail='인증할 회원을 찾을 수 없습니다.')
            cursor.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            return public_user(cursor.fetchone())


def update_user_profile(user_id, nickname=None, profile_image=None):
    fields, values = [], []
    if nickname is not None:
        fields.append('nickname=%s')
        values.append(nickname.strip())
    if profile_image is not None:
        if profile_image and not profile_image.startswith('data:image/'):
            raise HTTPException(400, detail='이미지 파일만 사용할 수 있습니다.')
        if profile_image and len(profile_image) > 2_000_000:
            raise HTTPException(400, detail='프로필 이미지는 1.5MB 이하로 줄여 주세요.')
        fields.append('profile_image=%s')
        values.append(profile_image or None)
    if not fields:
        raise HTTPException(400, detail='변경할 내용이 없습니다.')

    with get_connection() as conn:
        with conn.cursor() as cursor:
            values.append(user_id)
            cursor.execute(f"UPDATE users SET {','.join(fields)} WHERE id=%s AND deleted_at IS NULL", values)
            cursor.execute('SELECT * FROM users WHERE id=%s', (user_id,))
            return public_user(cursor.fetchone())


def delete_user_account(user_id):
    deleted_email = f'deleted_user_{user_id}_{secrets.token_hex(8)}@deleted.local'
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM auth_session WHERE user_id=%s', (user_id,))
            cursor.execute('DELETE FROM review_like WHERE user_id=%s', (user_id,))
            cursor.execute('DELETE FROM review_report WHERE user_id=%s', (user_id,))
            cursor.execute('UPDATE review SET user_id=NULL WHERE user_id=%s', (user_id,))
            cursor.execute(
                """UPDATE users
                   SET email=%s, password_hash='', nickname='탈퇴한 사용자',
                       profile_image=NULL, gender_verified=FALSE,
                       verification_status='withdrawn', status='withdrawn',
                       deleted_at=UTC_TIMESTAMP()
                   WHERE id=%s""",
                (deleted_email, user_id),
            )


def logout_token(authorization):
    token = _token(authorization)
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute('DELETE FROM auth_session WHERE token_hash=%s', (hashlib.sha256(token.encode()).hexdigest(),))
