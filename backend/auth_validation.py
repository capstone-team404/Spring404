import re


EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
NICKNAME_PATTERN = re.compile(r"^[0-9A-Za-z가-힣_]+$")


def validate_email(email):
    normalized = str(email or "").strip().lower()
    if not EMAIL_PATTERN.fullmatch(normalized):
        raise ValueError("올바른 이메일 형식을 입력해 주세요.")
    return normalized


def validate_password(password):
    value = str(password or "")
    if len(value) < 8:
        raise ValueError("비밀번호는 8자 이상이어야 합니다.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("비밀번호에는 영문과 숫자를 모두 포함해 주세요.")
    return value


def validate_nickname(nickname):
    value = str(nickname or "").strip()
    if len(value) < 2 or len(value) > 20:
        raise ValueError("닉네임은 2자 이상 20자 이하로 입력해 주세요.")
    if not NICKNAME_PATTERN.fullmatch(value):
        raise ValueError("닉네임에는 한글, 영문, 숫자, 밑줄만 사용할 수 있습니다.")
    return value


def validate_signup(email, password, password_confirm, nickname, terms_agreed, privacy_agreed):
    normalized_email = validate_email(email)
    valid_password = validate_password(password)
    valid_nickname = validate_nickname(nickname)
    if valid_password != str(password_confirm or ""):
        raise ValueError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
    if not terms_agreed or not privacy_agreed:
        raise ValueError("필수 약관에 모두 동의해 주세요.")
    return normalized_email, valid_password, valid_nickname
