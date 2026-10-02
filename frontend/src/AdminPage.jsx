import React, { useEffect, useState } from 'react';
import { getAdminReports, restoreAdminReview, setAdminReviewChecked } from './authApi';

export default function AdminPage({ onBackToMap, onRestored }) {
  const [reviews, setReviews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [uncheckedOnly, setUncheckedOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    getAdminReports().then(result => { if (active) setReviews(result.reports || []); })
      .catch(err => { if (active) setMessage(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  const checked = async review => {
    setBusy(true); setMessage('');
    try {
      const value = !review.admin_checked;
      await setAdminReviewChecked(review.review_id, value);
      setReviews(items => items.map(item => item.review_id === review.review_id ? { ...item, admin_checked: value } : item));
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  };
  const restore = async review => {
    if (!window.confirm('사용자 화면과 안전 점수에 다시 반영됩니다. 복구하시겠습니까?')) return;
    setBusy(true); setMessage('');
    try {
      await restoreAdminReview(review.review_id);
      setReviews(items => items.filter(item => item.review_id !== review.review_id));
      onRestored?.();
      setSelected(null); setMessage('리뷰가 복구되었습니다.');
    } catch (err) { setMessage(err.message); } finally { setBusy(false); }
  };
  const current = reviews.find(item => item.review_id === selected);
  const visible = reviews.filter(item => !uncheckedOnly || !item.admin_checked);
  return <main className="admin-page">
    <header className="admin-header">
      <button type="button" className="admin-icon-button" disabled={busy} onClick={() => current ? setSelected(null) : onBackToMap()}>←</button>
      <strong>{current ? '자동 숨김 리뷰 상세' : '자동 숨김 리뷰 관리'}</strong>
    </header>
    {message && <div className="admin-message" role="status">{message}</div>}
    {current ? <section className="admin-detail">
      <div className="admin-status-banner"><strong>자동 숨김 · 점수 반영 제외</strong><span>{current.admin_checked ? '확인함' : '미확인'}</span></div>
      <div className="admin-detail-block"><h2>원본 리뷰</h2>
        <p>{current.author_nickname || '탈퇴한 사용자'} · {new Date(current.created_at).toLocaleString('ko-KR')}</p>
        <div className="admin-review-box"><p>{current.content}</p></div>
        <p>평점 {current.user_score} · 좋아요 {current.like_count || 0} · 구역 #{current.zone_id}</p>
        <div className="admin-photo-row">{(current.photos || []).map((photo, index) => <img key={index} src={photo.photo_data} alt={photo.photo_name || '리뷰 사진'} />)}</div>
      </div>
      <div className="admin-detail-block"><h2>신고 사유 ({current.reports?.length || 0}명)</h2>
        {(current.reports || []).map((report, index) => <div className="admin-review-box" key={index}>
          <strong>{report.reason}</strong><p>{report.detail}</p><small>{report.reporter_nickname || '탈퇴한 사용자'} · {new Date(report.reported_at).toLocaleString('ko-KR')}</small>
        </div>)}
      </div>
      <div className="admin-detail-actions">
        <button type="button" disabled={busy} aria-pressed={Boolean(current.admin_checked)} className="admin-outline-button" onClick={() => checked(current)}>{current.admin_checked ? '확인함 해제' : '확인함 표시'}</button>
        <button type="button" disabled={busy} className="admin-map-button" onClick={() => restore(current)}>리뷰 복구</button>
      </div>
    </section> : <section className="admin-list-section">
      <p>서로 다른 사용자 3명 이상이 신고한 리뷰입니다. 복구하지 않으면 숨김 상태가 유지됩니다.</p>
      <label><input type="checkbox" checked={uncheckedOnly} onChange={event => setUncheckedOnly(event.target.checked)} /> 미확인만 보기</label>
      <p>전체 {reviews.length}개 · 미확인 {reviews.filter(item => !item.admin_checked).length}개</p>
      {loading && <div className="admin-empty">불러오는 중입니다.</div>}
      {!loading && visible.length === 0 && <div className="admin-empty">표시할 자동 숨김 리뷰가 없습니다.</div>}
      <div className="admin-report-list">{visible.map(review => <article className="admin-report-card" key={review.review_id}>
        <div className="admin-card-top"><span>{review.admin_checked ? '✓ 확인함' : '미확인'}</span><strong>신고 {review.reports?.length || 0}명</strong></div>
        <h2>{review.content}</h2><div className="admin-card-actions">
          <button type="button" disabled={busy} onClick={() => setSelected(review.review_id)}>상세 보기</button>
          <button type="button" disabled={busy} aria-pressed={Boolean(review.admin_checked)} onClick={() => checked(review)}>{review.admin_checked ? '확인함 해제' : '확인함 표시'}</button>
        </div>
      </article>)}</div>
    </section>}
  </main>;
}
