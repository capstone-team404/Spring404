import React, { useEffect, useRef } from 'react';

export default function SideMenu({ user, onClose, onNavigate, onLogout }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  const items = [
    ['map', '⌖', '안전 지도', '주변 구역 살펴보기'],
    ['activity', '≡', '내가 쓴 리뷰', '나의 경험 돌아보기'],
    ['liked', '♡', '좋아요 한 리뷰', '다시 읽고 싶은 경험'],
    ['reports', '⚑', '신고 내역', '접수·처리 상태 확인'],
    ['connection', '✓', '네이버 계정 연결', user.verification_provider === 'naver' ? '계정 성별 확인 완료' : '계정 성별 확인하기'],
    ['profile', '○', '마이페이지', '프로필과 계정 관리'],
    ['guide', '?', '이용 안내', '지도와 추천 기준 알아보기'],
  ];
  return <dialog ref={dialog} className="side-drawer" aria-labelledby="side-menu-title" onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => {
      const rect = dialog.current.getBoundingClientRect();
      if (e.target === dialog.current && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) onClose();
    }}>
    <header><strong id="side-menu-title">여기지!</strong><button type="button" onClick={onClose} aria-label="메뉴 닫기">×</button></header>
    <div className="drawer-profile"><span>{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}님</strong><small>오늘도 나의 속도로 걸어요</small></div></div>
    <nav aria-label="전체 메뉴">{items.map(([key, icon, title, subtitle]) => <button type="button" key={key} onClick={() => onNavigate(key)}><span className="drawer-icon" aria-hidden="true">{icon}</span><span><strong>{title}</strong><small>{subtitle}</small></span><span aria-hidden="true">›</span></button>)}
      {user.role === 'admin' && <button type="button" onClick={() => onNavigate('admin')}><span className="drawer-icon">⚙</span><span><strong>관리자 페이지</strong><small>신고된 리뷰 검토</small></span><span>›</span></button>}
    </nav>
    <footer><small>혼자 걷는 여행을 위해, 여기지!</small><button type="button" onClick={onLogout}>로그아웃</button></footer>
  </dialog>;
}
