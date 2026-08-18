import importlib.util
from pathlib import Path


VALIDATION_FILE = Path(__file__).resolve().parents[1] / "backend" / "auth_validation.py"
SPEC = importlib.util.spec_from_file_location("hereji_auth_validation", VALIDATION_FILE)
validation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(validation)


def assert_invalid(**overrides):
    values = {
        "email": "tester@example.com",
        "password": "hereji404",
        "password_confirm": "hereji404",
        "nickname": "여행자404",
        "terms_agreed": True,
        "privacy_agreed": True,
    }
    values.update(overrides)
    try:
        validation.validate_signup(**values)
    except ValueError as error:
        return str(error)
    raise AssertionError("invalid signup was accepted")


def test_valid_signup_is_normalized():
    email, password, nickname = validation.validate_signup(
        "  Tester@Example.COM ", "hereji404", "hereji404", "여행자404", True, True
    )
    assert email == "tester@example.com"
    assert password == "hereji404"
    assert nickname == "여행자404"


def test_invalid_email_is_rejected():
    assert "이메일" in assert_invalid(email="not-an-email")


def test_password_requires_letters_and_numbers():
    assert "영문과 숫자" in assert_invalid(password="abcdefgh", password_confirm="abcdefgh")


def test_password_confirmation_must_match():
    assert "일치" in assert_invalid(password_confirm="different404")


def test_nickname_characters_are_limited():
    assert "닉네임" in assert_invalid(nickname="여행자!")


def test_required_agreements_are_enforced():
    assert "필수 약관" in assert_invalid(privacy_agreed=False)
