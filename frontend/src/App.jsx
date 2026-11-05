import React, { useEffect, useState } from 'react';
import SafetyMap from './SafetyMap';
import { clearToken, getMe, getToken, login, logout, saveToken, signup, completeNaverConnection, startNaverLogin, completeNaverLogin } from './authApi';
import './auth.css';
import './home.css';
import './interface.css';
import NaverConnection from './NaverConnection';

const naverReturn = new URLSearchParams(window.location.hash.slice(1));
let naverCompletion;


const initialSignup = {
  nickname: '',
  email: '',
  password: '',
  passwordConfirm: '',
  termsAgreed: false,
  privacyAgreed: false,
};

function AuthCard({ mode, setMode, onAuthenticated, notice }) {
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signupForm, setSignupForm] = useState(initialSignup);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';
  const [naverConsent, setNaverConsent] = useState(false);
  const naverLogin = async () => {
    setBusy(true); setError('');
    try {
      const result = await startNaverLogin();
      if (new URL(result.authorization_url).origin !== 'https://nid.naver.com') throw new Error('로그인 주소를 확인해 주세요.');
      sessionStorage.setItem('hereji_naver_login', JSON.stringify({ state: result.state, browser_verifier: result.browser_verifier }));
      window.location.assign(result.authorization_url);
    } catch (err) { setError(err.message); setBusy(false); }
  };

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

        {(error || notice) && <div className="auth-error" role="alert">{error || notice}</div>}
        <button className="auth-primary" disabled={busy}>
          {busy ? '처리 중…' : isSignup ? '회원가입' : '로그인'}
        </button>
        <div className="social-login-section">
          <details className="connection-privacy"><summary>네이버 가입·로그인 이용 안내</summary>
            <p>이용약관 및 개인정보 처리방침에 동의하고 네이버 계정으로 가입하거나 로그인합니다. 이용자 식별자와 등록 성별을 사용하며, 여성으로 등록된 계정에서 리뷰를 작성할 수 있습니다. 지도와 길찾기는 연결 없이 이용할 수 있습니다.</p>
          </details>
          <label className="connection-consent"><input type="checkbox" checked={naverConsent} onChange={e => setNaverConsent(e.target.checked)} /><span>네이버 가입·로그인 이용 안내에 동의합니다.</span></label>
          <button type="button" className="naver-connect-button" disabled={busy || !naverConsent} onClick={naverLogin}><img src="/images/naver-login-icon.png" alt="" />네이버로 시작하기</button>
        </div>
        <button type="button" className="auth-link" onClick={() => setMode('map')}>로그인 없이 지도 둘러보기</button>
        <button type="button" className="auth-link" onClick={changeMode}>
          {isSignup ? '이미 계정이 있어요' : '처음이신가요? 회원가입'}
        </button>
      </form>
    </main>
  );
}

function Verify({ user, onDone, onLogout, notice }) {
  return <main className="auth-page"><section className="auth-card auth-verify">
    <div className="auth-brand">여기지!</div>
    {notice && <div className="auth-error" role="alert">{notice}</div>}
    <NaverConnection user={user} onDone={onDone} />
    <button type="button" className="auth-link" onClick={onLogout}>로그아웃</button>
  </section></main>;
}

function SignupComplete({ user }) {
  return (
    <main className="auth-page">
      <section className="auth-card auth-complete">
        <div className="auth-complete-icon">✓</div>
        <h1>{user.verification_provider === 'naver' ? '계정 성별 확인이 완료됐어요' : '데모 확인이 완료됐어요'}</h1>
        <p>{user.nickname}님, 여기지! 가입이 완료됐어요.<br />안전 지도로 이동합니다.</p>
        <div className="auth-loading-bar"><span /></div>
      </section>
    </main>
  );
}

export default function App() {
  const [mode, setMode] = useState('loading');
  const [user, setUser] = useState(null);
  const [showSplash, setShowSplash] = useState(true);
  const [logoReady, setLogoReady] = useState(false);
  const [notice, setNotice] = useState('');
  const route = (next) => {
    setUser(next);
    setMode('map');
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
    if (!logoReady) return undefined;
    const timer = window.setTimeout(() => setShowSplash(false), 1100);
    return () => window.clearTimeout(timer);
  }, [logoReady]);

  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSplash(false), 5000);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let active = true;
    const expired = () => {
      if (!active) return;
      clearToken(); setUser(null); setMode('login');
    };
    window.addEventListener('hereji:session-expired', expired);
    const code = naverReturn.get('naver_code');
    const state = naverReturn.get('naver_state');
    const cancelled = naverReturn.has('naver_error');
    if (code || cancelled) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    async function initialize() {
      const saved = sessionStorage.getItem('hereji_naver_login');
      if (code && state && saved) {
        try {
          const pending = JSON.parse(saved);
          if (pending.state !== state) throw new Error('로그인을 시작한 화면에서 다시 시도해 주세요.');
          naverCompletion ||= completeNaverLogin({ code, state, browser_verifier: pending.browser_verifier });
          const result = await naverCompletion;
          saveToken(result.access_token);
          sessionStorage.removeItem('hereji_naver_login');
          if (active) route(result.user);
        } catch (err) { if (active) { setNotice(err.message); setMode('login'); } }
        return;
      }
      if (cancelled) sessionStorage.removeItem('hereji_naver_login');
      if (!getToken()) {
        if (active) {
          setMode('login');
          if (code) setNotice('기존 계정으로 로그인한 뒤 네이버 연결을 다시 시작해 주세요.');
        }
        return;
      }
      let message = cancelled ? '네이버 연결이 취소되었어요. 원할 때 다시 시작해 주세요.' : '';
      if (code && state) {
        naverCompletion ||= completeNaverConnection({ code, state });
        try { await naverCompletion; }
        catch (err) { message = err.message; }
      }
      try {
        const { user: next } = await getMe();
        if (active) { setNotice(message); route(next); }
      } catch { expired(); }
    }
    initialize();
    return () => { active = false; window.removeEventListener('hereji:session-expired', expired); };
  }, []);

  useEffect(() => {
    if (mode !== 'complete') return undefined;
    const timer = window.setTimeout(() => setMode('map'), 1400);
    return () => window.clearTimeout(timer);
  }, [mode]);

  if (showSplash) return <main className="brand-splash" aria-label="여기지 시작 화면"><img className="brand-logo" src="/images/hereji-logo.png" alt="여기지 로고" width="360" height="360" fetchPriority="high" onLoad={() => setLogoReady(true)} onError={() => setLogoReady(true)} /></main>;
  if (mode === 'loading') return <main className="auth-page" role="status">계정을 확인하고 있어요…</main>;
  if (mode === 'login' || mode === 'signup') {
    return <AuthCard mode={mode} setMode={setMode} onAuthenticated={route} notice={notice} />;
  }
  if (mode === 'verify') {
    return <Verify user={user} onDone={finishVerification} onLogout={handleLogout} notice={notice} />;
  }
  if (mode === 'complete') return <SignupComplete user={user} />;
  return <>{notice && <div className="app-notice" role="alert">{notice}<button type="button" aria-label="알림 닫기" onClick={() => setNotice('')}>×</button></div>}<SafetyMap user={user} onUserChange={setUser} onLogout={handleLogout} onRequireLogin={() => setMode('login')} /></>;
}
