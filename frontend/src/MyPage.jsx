import React, { useEffect, useMemo, useState } from 'react';
import {
  clearToken,
  deleteAccount,
  getMyActivity,
  getMyLikedReviews,
  getMyReports,
  getMyReviews,
  updateProfile,
} from './authApi';
import NaverConnection from './NaverConnection';

const tabs = [
  { key: 'home', label: '홈' },
  { key: 'profile', label: '프로필' },
  { key: 'activity', label: '나의 활동' },
  { key: 'reports', label: '신고 내역' },
  { key: 'connection', label: '계정 연결' },
  { key: 'account', label: '계정 관리' },
];

const emptyImage =
  'linear-gradient(135deg, #d1fae5 0%, #eff6ff 100%)';

function resizeImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSize = 520;
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.76));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ProfileAvatar({ user, size = 72 }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        overflow: 'hidden',
        background: user?.profile_image ? '#f3f4f6' : emptyImage,
        border: '1px solid #d1fae5',
        display: 'grid',
        placeItems: 'center',
        color: '#14532d',
        fontWeight: 900,
        fontSize: size > 60 ? 24 : 16,
        flex: '0 0 auto',
      }}
    >
      {user?.profile_image ? (
        <img
          src={user.profile_image}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        user?.nickname?.slice(0, 1) || '나'
      )}
    </div>
  );
}

function ReviewList({ reviews }) {
  if (!reviews?.length) {
    return <div className="mypage-empty">아직 표시할 리뷰가 없습니다.</div>;
  }

  return (
    <div className="mypage-list">
      {reviews.map((review) => (
        <article className="mypage-item" key={`${review.id}-${review.liked_at || review.created_at}`}>
          <div className="mypage-item-top">
            <strong>평점 {review.user_score}/5</strong>
            <span>좋아요 {review.like_count || 0} · 신고 {review.report_count || 0}</span>
          </div>
          <p>{review.content}</p>
          {review.report_status === 'under_review' && (
            <span className="mypage-badge warn">검토 대기</span>
          )}
        </article>
      ))}
    </div>
  );
}

export default function MyPage({ user, onUserChange, onBackToMap, onLogout, initialTab = 'home', initialActivity = 'written' }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [activity, setActivity] = useState(null);
  const [myReviews, setMyReviews] = useState([]);
  const [likedReviews, setLikedReviews] = useState([]);
  const [reports, setReports] = useState({ filed_reports: [], received_reports: [] });
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [profileImage, setProfileImage] = useState(user?.profile_image || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [activityTab, setActivityTab] = useState(initialActivity);

  const summary = activity?.summary || {};
  const currentReviews = activityTab === 'written' ? myReviews : likedReviews;

  const stats = useMemo(
    () => [
      { label: '내 리뷰', value: summary.review_count || 0 },
      { label: '받은 좋아요', value: summary.received_like_count || 0 },
      { label: '누적 신고', value: summary.received_report_count || 0 },
      { label: '내 신고', value: summary.filed_report_count || 0 },
    ],
    [summary],
  );

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [activityResult, reviewsResult, likedResult, reportResult] = await Promise.all([
          getMyActivity(),
          getMyReviews(),
          getMyLikedReviews(),
          getMyReports(),
        ]);
        if (!mounted) return;
        setActivity(activityResult);
        setMyReviews(reviewsResult.reviews || []);
        setLikedReviews(likedResult.reviews || []);
        setReports(reportResult);
      } catch (err) {
        if (mounted) setMessage(err.message);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const saveProfile = async () => {
    setBusy(true);
    setMessage('');
    try {
      const result = await updateProfile({ nickname, profile_image: profileImage || null });
      onUserChange(result.user);
      setMessage('프로필이 변경되었습니다.');
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const selectProfileImage = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('이미지 파일만 선택할 수 있습니다.');
      return;
    }
    setProfileImage(await resizeImage(file));
  };

  const removeAccount = async () => {
    const agreed = window.confirm(
      '회원 탈퇴 시 세션이 종료되고 개인정보가 삭제됩니다. 계속할까요?',
    );
    if (!agreed) return;

    setBusy(true);
    try {
      await deleteAccount();
      clearToken();
      onLogout();
    } catch (err) {
      setMessage(err.message);
      setBusy(false);
    }
  };

  return (
    <main className="mypage">
      <header className="mypage-header">
        <button type="button" onClick={onBackToMap} className="mypage-icon-button">
          ←
        </button>
        <strong>마이페이지</strong>
        <button type="button" onClick={onLogout} className="mypage-text-button">
          로그아웃
        </button>
      </header>

      <nav className="mypage-tabs" aria-label="마이페이지 메뉴">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={activeTab === tab.key ? 'is-active' : ''}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {message && <div className="mypage-message">{message}</div>}

      {activeTab === 'home' && (
        <section className="mypage-section">
          <div className="mypage-profile-row">
            <ProfileAvatar user={user} />
            <div>
              <h1>{user.nickname}</h1>
              <p>{user.email}</p>
            </div>
          </div>
          <div className="mypage-stats">
            {stats.map((item) => (
              <div key={item.label}>
                <strong>{item.value}</strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
          <h2>최근 활동</h2>
          <ReviewList reviews={activity?.recent_reviews || []} />
        </section>
      )}

      {activeTab === 'profile' && (
        <section className="mypage-section">
          <h2>프로필 수정</h2>
          <div className="mypage-profile-edit">
            <ProfileAvatar user={{ ...user, profile_image: profileImage }} size={88} />
            <label className="mypage-upload">
              이미지 변경
              <input
                type="file"
                accept="image/*"
                onChange={(e) => selectProfileImage(e.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={() => setProfileImage('')} className="mypage-secondary">
              이미지 삭제
            </button>
          </div>
          <label className="mypage-field">
            닉네임
            <input value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </label>
          <button type="button" onClick={saveProfile} disabled={busy} className="mypage-primary">
            변경 완료
          </button>
        </section>
      )}

      {activeTab === 'activity' && (
        <section className="mypage-section">
          <h2>나의 활동 조회</h2>
          <div className="mypage-segment">
            <button
              type="button"
              onClick={() => setActivityTab('written')}
              className={activityTab === 'written' ? 'is-active' : ''}
            >
              내가 쓴 리뷰
            </button>
            <button
              type="button"
              onClick={() => setActivityTab('liked')}
              className={activityTab === 'liked' ? 'is-active' : ''}
            >
              좋아요 누른 리뷰
            </button>
          </div>
          <ReviewList reviews={currentReviews} />
        </section>
      )}

      {activeTab === 'reports' && (
        <section className="mypage-section">
          <h2>신고 내역 확인</h2>
          <h3>내가 접수한 신고</h3>
          {!reports.filed_reports?.length && <div className="mypage-empty">접수한 신고가 없습니다.</div>}
          {reports.filed_reports?.map((report) => (
            <article className="mypage-item" key={`${report.review_id}-${report.reported_at}`}>
              <div className="mypage-item-top">
                <strong>리뷰 #{report.review_id}</strong>
                <span className={`mypage-badge ${report.status === 'pending' ? 'warn' : ''}`}>
                  {report.status === 'pending' ? '대기' : '완료'}
                </span>
              </div>
              {report.reason && <p><strong>사유:</strong> {report.reason}</p>}
              {report.detail && <p><strong>상세:</strong> {report.detail}</p>}
              <p>{report.content}</p>
            </article>
          ))}

          <h3>나에게 누적된 신고</h3>
          {!reports.received_reports?.length && <div className="mypage-empty">누적된 신고가 없습니다.</div>}
          {reports.received_reports?.map((report) => (
            <article className="mypage-item" key={report.review_id}>
              <div className="mypage-item-top">
                <strong>신고 {report.report_count}건</strong>
                <span className={`mypage-badge ${report.status === 'pending' ? 'warn' : ''}`}>
                  {report.status === 'pending' ? '대기' : '완료'}
                </span>
              </div>
              <p>{report.content}</p>
            </article>
          ))}
        </section>
      )}

      {activeTab === 'connection' && <section className="mypage-section"><NaverConnection user={user} onDone={onUserChange} /></section>}

      {activeTab === 'account' && (
        <section className="mypage-section">
          <h2>계정 관리</h2>
          <button type="button" onClick={onLogout} className="mypage-primary">
            로그아웃
          </button>
          <div className="mypage-danger">
            <strong>회원 탈퇴</strong>
            <p>탈퇴하면 로그인 세션이 종료되고, 이메일/닉네임/프로필 이미지는 삭제됩니다.</p>
            <button type="button" onClick={removeAccount} disabled={busy}>
              회원 탈퇴
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
