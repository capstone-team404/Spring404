import React, { useEffect, useState } from 'react';
import SafetyMap from './SafetyMap';
import { clearToken, getMe, getToken, login, logout, saveToken, signup, verifyGender } from './authApi';
import './auth.css';

const initialSignup = {
  nickname: '',
  email: '',
  password: '',
  passwordConfirm: '',
  termsAgreed: false,
  privacyAgreed: false,
};

function AuthCard({ mode, setMode, onAuthenticated }) {
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState(initialSignup);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  const changeMode = () => {
    setError('');
    setMode(isSignup ? 'login' : 'signup');
  };

  const updateSignup = (key, value) => {
    setSignupForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (isSignup) {
        if (signupForm.password !== signupForm.passwordConfirm) {
          throw new Error('비밀번호와 비밀번호 확인이 일치하지 않습니다.');
        }
        if (!signupForm.termsAgreed || !signupForm.privacyAgreed) {
          throw new Error('필수 약관에 모두 동의해 주세요.');
        }
        const result = await signup({
          email: signupForm.email,
          password: signupForm.password,
          password_confirm: signupForm.passwordConfirm,
          nickname: signupForm.nickname,
          terms_agreed: signupForm.termsAgreed,
          privacy_agreed: signupForm.privacyAgreed,
        });
        saveToken(result.access_token);
        onAuthenticated(result.user);
      } else {
        const result = await login(loginForm);
        saveToken(result.access_token);
        onAuthenticated(result.user);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-brand">여기지!</div>
        <h1>{isSignup ? '회원가입' : '로그인'}</h1>
        <p>{isSignup ? '안전한 여행을 위한 기본 정보를 입력해 주세요.' : '안전한 이동을 다시 시작해 볼까요?'}</p>

        {isSignup && (
          <label className="auth-field">
            <span>닉네임</span>
            <input
              value={signupForm.nickname}
              onChange={(event) => updateSignup('nickname', event.target.value)}
              placeholder="2~20자, 한글·영문·숫자"
              minLength="2"
              maxLength="20"
              required
            />
          </label>
        )}

        <label className="auth-field">
          <span>이메일</span>
          <input
            type="email"
            value={isSignup ? signupForm.email : loginForm.email}
            onChange={(event) => isSignup
              ? updateSignup('email', event.target.value)
              : setLoginForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="name@example.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="auth-field">
          <span>비밀번호</span>
          <input
            type="password"
            minLength="8"
            value={isSignup ? signupForm.password : loginForm.password}
            onChange={(event) => isSignup
              ? updateSignup('password', event.target.value)
              : setLoginForm((current) => ({ ...current, password: event.target.value }))}
            placeholder={isSignup ? '영문과 숫자를 포함한 8자 이상' : '비밀번호'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
          />
        </label>

        {isSignup && (
          <>
            <label className="auth-field">
              <span>비밀번호 확인</span>
              <input
                type="password"
                minLength="8"
                value={signupForm.passwordConfirm}
                onChange={(event) => updateSignup('passwordConfirm', event.target.value)}
                placeholder="비밀번호를 다시 입력해 주세요"
                autoComplete="new-password"
                required
              />
            </label>
            <div className="auth-agreements">
              <label>
                <input
                  type="checkbox"
                  checked={signupForm.termsAgreed}
                  onChange={(event) => updateSignup('termsAgreed', event.target.checked)}
                />
                <span><strong>[필수]</strong> 서비스 이용약관 동의</span>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={signupForm.privacyAgreed}
                  onChange={(event) => updateSignup('privacyAgreed', event.target.checked)}
                />
                <span><strong>[필수]</strong> 개인정보 처리방침 동의</span>
              </label>
            </div>
          </>
        )}

        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-primary" disabled={busy}>
          {busy ? '처리 중…' : isSignup ? '다음: 여성 인증' : '로그인'}
        </button>
        <button type="button" className="auth-link" onClick={changeMode}>
          {isSignup ? '이미 계정이 있어요' : '처음이신가요? 회원가입'}
        </button>
      </form>
    </main>
  );
}

function Verify({ user, onDone, onLogout }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await verifyGender(code);
      onDone(result.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card auth-verify" onSubmit={submit}>
        <div className="auth-step">2 / 2</div>
        <div className="auth-shield" aria-hidden="true">✓</div>
        <h1>여성 인증</h1>
        <p>
          여기지는 여성 1인 여행자의 안전한 이동을 돕기 위한 서비스입니다.<br />
          서비스 이용을 위해 여성 인증이 필요합니다.
        </p>
        <div className="auth-mock-notice">
          MVP에서는 실제 신분증을 저장하지 않고 테스트 코드로만 인증합니다.
        </div>
        <label className="auth-field">
          <span>{user.nickname}님의 테스트 인증 코드</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="인증 코드 입력"
            autoComplete="one-time-code"
            required
          />
        </label>
        <button type="button" className="auth-demo-button" onClick={() => setCode('HEREJI404')}>
          데모 코드 자동 입력
        </button>
        {error && <div className="auth-error" role="alert">{error}</div>}
        <button className="auth-primary" disabled={busy}>
          {busy ? '인증 중…' : '여성 인증하기'}
        </button>
        <button type="button" className="auth-link" onClick={onLogout}>로그아웃</button>
      </form>
    </main>
  );
}

function SignupComplete({ user }) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-complete">
        <div className="auth-complete-icon">✓</div>
        <h1>여성 인증이 완료되었습니다</h1>
        <p>{user.nickname}님, 여기지! 가입이 완료됐어요.<br />안전 지도로 이동합니다.</p>
        <div className="auth-loading-bar"><span /></div>
      </section>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = useState('loading');
  const [user, setUser] = useState(null);
  const route = (next) => {
    setUser(next);
    setMode(next.gender_verified ? 'map' : 'verify');
  };
  const finishVerification = (next) => {
    setUser(next);
    setMode('complete');
  };
  const handleLogout = async () => {
    try { await logout(); } finally {
      clearToken();
      setUser(null);
      setMode('login');
    }
  };

  useEffect(() => {
    const expired = () => {
      clearToken();
      setUser(null);
      setMode('login');
    };
    window.addEventListener('hereji:session-expired', expired);
    if (getToken()) getMe().then(({ user: next }) => route(next)).catch(expired);
    else setMode('login');
    return () => window.removeEventListener('hereji:session-expired', expired);
  }, []);

  useEffect(() => {
    if (mode !== 'complete') return undefined;
    const timer = window.setTimeout(() => setMode('map'), 1400);
    return () => window.clearTimeout(timer);
  }, [mode]);

  if (mode === 'loading') return <main className="auth-page">불러오는 중…</main>;
  if (mode === 'login' || mode === 'signup') {
    return <AuthCard mode={mode} setMode={setMode} onAuthenticated={route} />;
  }
  if (mode === 'verify') {
    return <Verify user={user} onDone={finishVerification} onLogout={handleLogout} />;
  }
  if (mode === 'complete') return <SignupComplete user={user} />;
  return <SafetyMap user={user} onUserChange={setUser} onLogout={handleLogout} />;
}
