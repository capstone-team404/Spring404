import React, { useEffect, useState } from 'react';
import { getVerificationConfig, startNaverConnection, verifyGender } from './authApi';

export default function NaverConnection({ user, onDone }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [code, setCode] = useState('');
  const confirmed = user?.gender_verified && user?.verification_provider === 'naver';
  useEffect(() => {
    let active = true;
    getVerificationConfig().then(value => { if (active) setConfig(value); })
      .catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, []);
  const connect = async () => {
    setBusy(true); setError('');
    try {
      const { authorization_url: url } = await startNaverConnection();
      const target = new URL(url);
      if (target.origin !== 'https://nid.naver.com') throw new Error('연결 주소를 확인할 수 없습니다.');
      window.location.assign(url);
    } catch (err) { setError(err.message); setBusy(false); }
  };
  const demo = async () => {
    setBusy(true); setError('');
    try { const result = await verifyGender(code); onDone(result.user); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  return <section className="naver-connection" aria-label="네이버 계정 연결">
    <span className="connection-eyebrow">ACCOUNT CONNECTION</span>
    <h2>{confirmed ? '네이버 계정 연결 완료' : '네이버로 성별을 확인해요'}</h2>
    <p>여성 1인 여행자의 경험을 모으기 위해 네이버 계정에 등록된 성별을 확인해요.</p>
    {confirmed ? <div className="connection-success" role="status">✓ 네이버 계정 성별 확인 완료</div> : <>
      <div className="connection-note">신분증을 통한 본인확인이 아니며, 실제 방문이나 리뷰의 사실 여부를 인증하지 않아요.</div>
      <details className="connection-privacy"><summary>어떤 정보를 사용하나요?</summary>
        <p>네이버 이용자 식별자와 성별을 제공받아요. 여성으로 확인된 경우 계정 연결을 위한 식별자의 해시값, 확인 상태와 시각을 회원 탈퇴 시까지 보관해요. 이름·전화번호는 요청하지 않으며 네이버 접근 토큰은 저장하지 않아요.</p>
        <p>네이버 연결은 선택할 수 있지만, 성별 확인을 완료하지 않으면 현재 서비스 이용 단계로 진행할 수 없어요. 언제든 로그아웃할 수 있어요.</p>
      </details>
      <label className="connection-consent"><input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
        <span>계정 연결을 위한 성별·식별자 이용 안내를 확인하고 동의합니다.</span>
      </label>
      <button type="button" className="naver-connect-button" onClick={connect} disabled={!config?.naver_configured || !agreed || busy}>
        <img src="/images/naver-login-icon.png" alt="" aria-hidden="true" />
        <span>{busy ? '네이버로 이동 중…' : '네이버 계정 연결하기'}</span>
      </button>
      {config && !config.naver_configured && <p className="connection-help">네이버 연결을 준비 중이에요. 설정이 완료되면 이곳에서 연결할 수 있어요.</p>}
      {config?.mode === 'demo' && <details className="connection-demo"><summary>개발·시연용 테스트 코드</summary>
        <p>실제 계정 성별을 확인하지 않는 데모 모드입니다.</p>
        <input aria-label="데모 코드" value={code} onChange={e => setCode(e.target.value)} placeholder="테스트 코드" />
        <button type="button" className="auth-demo-button" disabled={!code || busy} onClick={demo}>데모로 진행</button>
      </details>}
    </>}
    {error && <div className="auth-error" role="alert">{error}</div>}
  </section>;
}
