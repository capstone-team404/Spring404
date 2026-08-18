import React, { useEffect, useMemo, useState } from 'react';
import {
  getAdminReports,
  deleteAdminReview,
  restoreAdminReview,
  updateAdminReportStatus,
} from './authApi';

const statusTabs = [
  { key: 'pending', label: '검토 대기' },
  { key: 'resolved', label: '처리 완료' },
  { key: 'rejected', label: '신고 기각' },
];

const statusLabel = {
  pending: '검토 대기',
  resolved: '처리 완료',
  rejected: '신고 기각',
};

const formatDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 16);
  return date.toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const shortDate = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

const Stars = ({ score }) => {
  const rating = Math.max(0, Math.min(5, Math.round(Number(score || 0))));
  return (
    <span className="admin-stars" aria-label={`평점 ${score || 0}`}>
      <span>{'★'.repeat(rating)}</span>
      <span>{'★'.repeat(5 - rating)}</span>
    </span>
  );
};

export default function AdminPage({ onBackToMap, onOpenReportedReview }) {
  const [view, setView] = useState('home');
  const [status, setStatus] = useState('pending');
  const [reports, setReports] = useState([]);
  const [counts, setCounts] = useState({ pending: 0, resolved: 0, rejected: 0 });
  const [selectedReport, setSelectedReport] = useState(null);
  const [actionReport, setActionReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const selectedStatusText = useMemo(
    () => statusLabel[selectedReport?.report_status] || statusLabel[status] || '검토 대기',
    [selectedReport, status],
  );

  const loadCounts = async () => {
    const results = await Promise.all(
      statusTabs.map(async (tab) => {
        const result = await getAdminReports(tab.key);
        return [tab.key, result.reports?.length || 0];
      }),
    );
    setCounts(Object.fromEntries(results));
  };

  const loadReports = async (nextStatus = status) => {
    setLoading(true);
    setMessage('');
    try {
      const result = await getAdminReports(nextStatus);
      setReports(result.reports || []);
      await loadCounts();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCounts().catch((err) => setMessage(err.message));
  }, []);

  useEffect(() => {
    if (view === 'reports') {
      loadReports(status);
    }
  }, [view, status]);

  const openReports = () => {
    setView('reports');
    setSelectedReport(null);
    setActionReport(null);
  };

  const backToAdminHome = () => {
    setView('home');
    setSelectedReport(null);
    setActionReport(null);
    setMessage('');
  };

  const finishAction = async (callback) => {
    if (!actionReport && !selectedReport) return;
    const report = actionReport || selectedReport;
    setMessage('');
    try {
      await callback(report);
      setActionReport(null);
      setSelectedReport(null);
      await loadReports(status);
      await loadCounts();
      setMessage('관리자 처리가 완료되었습니다.');
    } catch (err) {
      setMessage(err.message);
    }
  };

  const markReport = (nextStatus) =>
    finishAction((report) =>
      updateAdminReportStatus(report.review_id, report.reporter_user_id, nextStatus),
    );

  const deleteReview = () => {
    const reason = window.prompt(
      '리뷰 삭제 사유를 입력해 주세요. 삭제 후에도 관리자가 복구할 수 있습니다.',
      actionReport?.reason || selectedReport?.reason || '신고 내용 확인 후 관리자 삭제',
    );
    if (reason === null) return;
    finishAction((report) => deleteAdminReview(report.review_id, reason.trim() || '관리자 검토 후 삭제'));
  };

  const restoreReview = () =>
    finishAction((report) => restoreAdminReview(report.review_id));

  if (selectedReport) {
    return (
      <main className="admin-page">
        <header className="admin-header">
          <button type="button" onClick={() => setSelectedReport(null)} className="admin-icon-button">
            ←
          </button>
          <strong>리뷰 상세</strong>
          <button type="button" onClick={() => setActionReport(selectedReport)} className="admin-icon-button">
            ⋮
          </button>
        </header>

        {message && <div className="admin-message">{message}</div>}

        <section className="admin-detail">
          <div className="admin-status-banner">
            <strong>{selectedStatusText}</strong>
            <span>신고 {selectedReport.report_count || 1}건</span>
          </div>

          <div className="admin-detail-block">
            <h2>신고 정보</h2>
            <dl>
              <dt>신고 사유</dt>
              <dd>{selectedReport.reason || '-'}</dd>
              {selectedReport.detail && (
                <>
                  <dt>상세 내용</dt>
                  <dd>{selectedReport.detail}</dd>
                </>
              )}
              <dt>신고자</dt>
              <dd>{selectedReport.reporter_nickname || selectedReport.reporter_email || '-'}</dd>
              <dt>신고 일시</dt>
              <dd>{formatDate(selectedReport.reported_at)}</dd>
              <dt>누적 신고</dt>
              <dd>{selectedReport.report_count || 1}건</dd>
            </dl>
          </div>

          <div className="admin-detail-block">
            <h2>원본 리뷰</h2>
            <dl>
              <dt>작성자</dt>
              <dd>{selectedReport.author_nickname || selectedReport.author_email || '-'}</dd>
              <dt>작성일</dt>
              <dd>{formatDate(selectedReport.review_created_at)}</dd>
            </dl>
            <div className="admin-review-box">
              <span>리뷰 내용</span>
              <p>{selectedReport.content || '-'}</p>
            </div>
            {selectedReport.photos?.length > 0 && (
              <div className="admin-photo-row">
                {selectedReport.photos.map((photo, index) => (
                  <img
                    key={`${selectedReport.review_id}-photo-${index}`}
                    src={photo.photo_data}
                    alt={photo.photo_name || '리뷰 사진'}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="admin-detail-block">
            <h2>관련 정보</h2>
            <dl>
              <dt>장소</dt>
              <dd>{selectedReport.place_name || `구역 #${selectedReport.zone_id || '-'}`}</dd>
              <dt>평점</dt>
              <dd>
                <Stars score={selectedReport.user_score} />
                <span className="admin-score-text">{Number(selectedReport.user_score || 0).toFixed(1)}</span>
              </dd>
              <dt>좋아요 수</dt>
              <dd>{selectedReport.like_count || 0}</dd>
            </dl>
          </div>

          <div className="admin-detail-actions">
            <button type="button" className="admin-light-button" onClick={() => markReport('rejected')}>
              신고 기각
            </button>
            <button type="button" className="admin-danger-button" onClick={deleteReview}>
              리뷰 삭제
            </button>
            <button type="button" className="admin-outline-button" onClick={() => markReport('resolved')}>
              검토 완료
            </button>
            <button type="button" className="admin-map-button" onClick={() => onOpenReportedReview?.(selectedReport)}>
              지도에서 리뷰 보기
            </button>
          </div>
        </section>

        {actionReport && (
          <ActionSheet
            report={actionReport}
            onClose={() => setActionReport(null)}
            onDelete={deleteReview}
            onReject={() => markReport('rejected')}
            onResolve={() => markReport('resolved')}
            onRestore={restoreReview}
          />
        )}
      </main>
    );
  }

  if (view === 'home') {
    return (
      <main className="admin-page">
        <header className="admin-header">
          <button type="button" onClick={onBackToMap} className="admin-icon-button">
            ←
          </button>
          <strong>관리자 페이지</strong>
          <div className="admin-bell" aria-label="신규 신고">
            {counts.pending > 0 && <span>{counts.pending}</span>}
          </div>
        </header>

        {message && <div className="admin-message">{message}</div>}

        <section className="admin-home">
          <div className="admin-home-summary">
            <strong>관리자 기능</strong>
            <p>서비스 운영에 필요한 기능을 선택해서 관리하세요.</p>
          </div>

          <button type="button" className="admin-menu-card" onClick={openReports}>
            <span className="admin-menu-icon">!</span>
            <span>
              <strong>리뷰 신고 관리</strong>
              <small>신고된 리뷰를 확인하고 삭제, 기각, 검토 완료 처리</small>
            </span>
            <em>{counts.pending || 0}</em>
          </button>

        </section>
      </main>
    );
  }

  return (
    <main className="admin-page">
      <header className="admin-header">
        <button type="button" onClick={backToAdminHome} className="admin-icon-button">
          ←
        </button>
        <strong>리뷰 신고 관리</strong>
        <div className="admin-bell" aria-label="신규 신고">
          {counts.pending > 0 && <span>{counts.pending}</span>}
        </div>
      </header>

      <nav className="admin-tabs" aria-label="신고 상태">
        {statusTabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={status === tab.key ? 'is-active' : ''}
          >
            {tab.label}
            <span>{counts[tab.key] || 0}</span>
          </button>
        ))}
      </nav>

      {message && <div className="admin-message">{message}</div>}

      <section className="admin-list-section">
        <div className="admin-toolbar">
          <button type="button" className="admin-sort-button">최신순</button>
          <button type="button">필터</button>
        </div>

        {loading && <div className="admin-empty">신고 리뷰를 불러오는 중입니다.</div>}
        {!loading && reports.length === 0 && (
          <div className="admin-empty">표시할 신고 리뷰가 없습니다.</div>
        )}

        <div className="admin-report-list">
          {reports.map((report) => (
            <article
              className="admin-report-card"
              key={`${report.review_id}-${report.reporter_user_id}-${report.reported_at}`}
            >
              <div className="admin-card-top">
                <span>{statusLabel[report.report_status] || '검토 대기'}</span>
                <strong>신고 {report.report_count || 1}건</strong>
              </div>
              <h2>{report.content || '내용 없는 리뷰'}</h2>
              <p>{report.reason || '-'}</p>
              <div className="admin-card-meta">
                <span>신고자</span>
                <span>{report.reporter_nickname || report.reporter_email || '-'}</span>
                <i />
                <span>{shortDate(report.reported_at)}</span>
              </div>
              <div className="admin-card-actions">
                <button type="button" onClick={() => setSelectedReport(report)}>
                  상세 보기
                </button>
                <button type="button" className="admin-action-trigger" onClick={() => setActionReport(report)}>
                  처리하기
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {actionReport && (
        <ActionSheet
          report={actionReport}
          onClose={() => setActionReport(null)}
          onDelete={deleteReview}
          onReject={() => markReport('rejected')}
          onResolve={() => markReport('resolved')}
          onRestore={restoreReview}
        />
      )}
    </main>
  );
}

function ActionSheet({ report, onClose, onDelete, onReject, onResolve, onRestore }) {
  return (
    <div className="admin-sheet-backdrop" onClick={onClose}>
      <section className="admin-action-sheet" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>처리하기</strong>
          <button type="button" onClick={onClose}>x</button>
        </header>
        <p>처리할 항목을 선택해주세요</p>

        {report.moderation_status === 'hidden' ? (
          <button type="button" className="admin-action-option" onClick={onRestore}>
            <span>↺</span>
            <strong>리뷰 복구</strong>
            <small>숨김 처리된 리뷰를 다시 보이게 합니다.</small>
          </button>
        ) : (
          <button type="button" className="admin-action-option is-danger" onClick={onDelete}>
            <span>!</span>
            <strong>리뷰 삭제</strong>
            <small>서비스에서 리뷰를 숨깁니다. 관리자는 나중에 복구할 수 있습니다.</small>
          </button>
        )}

        <button type="button" className="admin-action-option" onClick={onReject}>
          <span>F</span>
          <strong>신고 기각</strong>
          <small>신고 내용이 타당하지 않다고 판단되는 경우 선택합니다.</small>
        </button>

        <button type="button" className="admin-action-option is-success" onClick={onResolve}>
          <span>✓</span>
          <strong>검토 완료</strong>
          <small>추가 조치 없이 검토를 완료합니다.</small>
        </button>

        <button type="button" className="admin-cancel-button" onClick={onClose}>
          취소
        </button>
      </section>
    </div>
  );
}
