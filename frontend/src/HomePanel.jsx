import React from 'react';
import { center, zoneHasScore, getSafetyColor, getZoneSafetyLabel, formatMeter } from './mapHelpers';

export function distanceMeters(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export default function HomePanel({ zones = [], myLocation, onSelectZone, onSearch, onOpenActivity, onOpenGuide, loading, error, expanded }) {
  const origin = myLocation || center;
  const available = zones.filter(zoneHasScore).length;
  const nearby = zones.map(zone => ({ ...zone, distance: distanceMeters(origin, {
    lat: (Number(zone.min_lat) + Number(zone.max_lat)) / 2,
    lng: (Number(zone.min_lng) + Number(zone.max_lng)) / 2,
  }) })).filter(zone => Number.isFinite(zone.distance)).sort((a, b) => a.distance - b.distance).slice(0, 5);
  return <div className="home-panel">
    <header className="home-panel-heading"><div><span className="home-eyebrow">오늘의 발걸음, 여기지!</span><h2>어디로 걸어볼까요?</h2></div><span className="home-pull-hint">{expanded ? '아래로 접기 ↓' : '위로 열어보기 ↑'}</span></header>
    <div className="home-panel-body">
      <div className="home-actions">
        <button type="button" onClick={onSearch}><span aria-hidden="true">↗</span><strong>목적지 찾기</strong><small>경로를 비교해요</small></button>
        <button type="button" onClick={onOpenActivity}><span aria-hidden="true">≡</span><strong>내 여행 기록</strong><small>작성한 리뷰 보기</small></button>
      </div>
      <section className="home-area-summary"><span>홍대 안전 지도</span><strong>{loading ? '불러오는 중' : `${zones.length}개 구역`}</strong><p>평가 정보가 있는 구역 {available}개 · 정보 부족 {zones.length - available}개</p></section>
      <div className="home-section-title"><h3>가까운 구역 살펴보기</h3><span>{myLocation ? '현재 위치 기준' : '홍대입구역 기준'}</span></div>
      <p className="home-section-caption">가까운 순서예요. 점수와 리뷰를 함께 확인해 보세요.</p>
      {error && <p className="home-error" role="alert">{error}</p>}
      {!loading && !error && !nearby.length && <p className="home-empty">구역 정보를 불러오면 이곳에서 확인할 수 있어요.</p>}
      <div className="home-zone-list">{nearby.map(zone => <button type="button" key={zone.zone_id} onClick={() => onSelectZone(zone)}>
        <span className="home-zone-marker" style={{ background: getSafetyColor(zone.final_safety_score, zoneHasScore(zone)) }} aria-hidden="true" />
        <span><strong>{zone.zone_name || `안전존 ${zone.zone_id}`}</strong><small>{formatMeter(zone.distance)} · {getZoneSafetyLabel(zone)}</small></span>
        <b>{zoneHasScore(zone) ? Number(zone.final_safety_score).toFixed(1) : '—'}<small>{zoneHasScore(zone) ? '/ 5' : ''}</small></b><span aria-hidden="true">›</span>
      </button>)}</div>
      <button type="button" className="home-guide-link" onClick={onOpenGuide}><span><strong>지도 색깔은 어떤 뜻인가요?</strong><small>안전점수와 정보 부족 표시 알아보기</small></span><span aria-hidden="true">→</span></button>
      <p className="home-footnote">점수는 시설 정보와 이용자 경험을 바탕으로 한 참고 정보예요. 실제 안전을 보장하지 않아요.</p>
    </div>
  </div>;
}

export function ServiceGuide({ onBack }) {
  return <main className="service-guide"><header><button type="button" onClick={onBack} aria-label="지도로 돌아가기">←</button><strong>여기지 이용 안내</strong></header>
    <span className="home-eyebrow">혼자 걷는 여행을 위해</span><h1>점수보다 먼저,<br />정보를 함께 살펴봐요.</h1>
    <section><h2>지도 색상 읽기</h2>{[['#00875a', '높은 평가', '3.5점 이상'], ['#eab308', '보통 평가', '2점 이상 3.5점 미만'], ['#dc2626', '낮은 평가', '2점 미만'], ['#64748b', '정보 부족', '평가에 사용할 정보가 부족해요']].map(([color, label, detail]) => <div className="guide-legend" key={label}><i style={{ background: color }} /><strong>{label}</strong><span>{detail}</span></div>)}</section>
    <section><h2>구역과 리뷰</h2><p>지도에서 구역을 선택하면 시설 정보와 리뷰를 확인할 수 있어요. 방문한 시간과 조명·유동인구처럼 직접 경험한 내용을 남겨 주세요.</p></section>
    <section><h2>경로는 어떻게 추천하나요?</h2><p>지도에서 받은 후보 경로의 최저 안전점수를 먼저 비교하고, 동점이면 평균점수와 이동시간을 비교해요. 모든 길 중 가장 안전한 길임을 보장하는 것은 아니에요.</p></section>
    <section><h2>분석 신뢰도와 계정 확인</h2><p>리뷰 신뢰도는 점수에 반영할 비중을 정하기 위한 지표이며 사실 여부를 판별하는 값이 아니에요. 네이버 연결은 계정에 등록된 성별을 확인하며 본인확인이나 실제 방문 인증을 대신하지 않아요.</p></section>
  </main>;
}
