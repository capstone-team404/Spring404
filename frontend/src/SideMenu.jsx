import React, { useEffect, useRef } from 'react';
import Icon from './Icon';

export default function SideMenu({ user, onClose, onNavigate, onLogout }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); previous?.focus(); };
  }, []);
  const items = [['map', 'map', '안전 지도'], ['routes', 'route', '길찾기'], ['activity', 'review', '내가 쓴 리뷰'], ['profile', 'user', '마이페이지']];
  const more = [['liked', 'heart', '좋아요 한 리뷰'], ['reports', 'flag', '신고 내역'], ['connection', 'check', '네이버 계정 연결'], ['guide', 'info', '이용 안내']];
  const menuButton = ([key, icon, title]) => <button type="button" key={key} onClick={() => onNavigate(key)}><Icon name={icon} /><span>{title}</span><Icon name="chevron" size={15} /></button>;
  return <dialog ref={dialog} className="side-drawer" aria-labelledby="side-menu-title" onCancel={e => { e.preventDefault(); onClose(); }}
    onClick={e => {
      const rect = dialog.current.getBoundingClientRect();
      if (e.target === dialog.current && (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom)) onClose();
    }}>
    <header><strong id="side-menu-title">여기지</strong><button type="button" className="icon-button" onClick={onClose} aria-label="메뉴 닫기"><Icon name="close" /></button></header>
    <div className="drawer-profile"><span>{user.nickname.slice(0, 1)}</span><div><strong>{user.nickname}님</strong><small>내 계정</small></div></div>
    <nav aria-label="전체 메뉴">{items.map(menuButton)}
      {user.role === 'admin' && menuButton(['admin', 'flag', '관리자 페이지'])}
    </nav>
    <details className="drawer-more"><summary>더 보기<Icon name="chevron" size={16} /></summary><nav aria-label="추가 메뉴">{more.map(menuButton)}</nav></details>
    <footer><small>여기지 · 안전 여행 지도</small><button type="button" onClick={onLogout}>로그아웃</button></footer>
  </dialog>;
}
