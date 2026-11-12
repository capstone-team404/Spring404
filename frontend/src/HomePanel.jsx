import React from 'react';
import Icon from './Icon';
import { center, zoneHasScore, getSafetyColor, getZoneSafetyLabel, formatMeter } from './mapHelpers';

export function distanceMeters(a, b) {
  const rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export default function HomePanel({ zones = [], myLocation, onSelectZone, onSearch, onOpenRoutes, onOpenActivity, onOpenGuide, loading, error, expanded }) {
  const origin = myLocation || center;
  const available = zones.filter(zoneHasScore).length;
  const nearby = zones.map(zone => ({ ...zone, distance: distanceMeters(origin, {
    lat: (Number(zone.min_lat) + Number(zone.max_lat)) / 2,
    lng: (Number(zone.min_lng) + Number(zone.max_lng)) / 2,
  }) })).filter(zone => Number.isFinite(zone.distance)).sort((a, b) => a.distance - b.distance).slice(0, 5);
  return <div className="home-panel">
    <header className="home-panel-heading"><div><span className="home-eyebrow">홍대입구역 일대</span><h2>주변 안전 정보</h2></div><span className="home-pull-hint">{expanded ? '접기 ↓' : '펼치기 ↑'}</span></header>
    <div className="home-panel-body">
      <div className="home-actions">
        <button type="button" onClick={onOpenRoutes}><Icon name="route" /><strong>길찾기</strong></button>
        <button type="button" onClick={onOpenActivity}><Icon name="review" /><strong>내 리뷰</strong></button>
      </div>
      <section className="home-area-summary"><span>구역 정보</span><strong>{loading ? '불러오는 중' : `${zones.length}개`}</strong><p>평가 정보 {available} · 정보 부족 {zones.length - available}</p></section>
      <div className="home-section-title"><h3>가까운 구역 살펴보기</h3><span>{myLocation ? '현재 위치 기준' : '홍대입구역 기준'}</span></div>
      <p className="home-section-caption">가까운 순 · 점수와 리뷰를 함께 확인하세요.</p>
      {error && <p className="home-error" role="alert">{error}</p>}
      {!loading && !error && !nearby.length && <p className="home-empty">구역 정보를 불러오면 이곳에서 확인할 수 있어요.</p>}
      <div className="home-zone-list">{nearby.map(zone => <button type="button" key={zone.zone_id} onClick={() => onSelectZone(zone)}>
        <span className="home-zone-marker" style={{ background: getSafetyColor(zone.final_safety_score, zoneHasScore(zone)) }} aria-hidden="true" />
        <span><strong>{zone.zone_name || `안전존 ${zone.zone_id}`}</strong><small>{formatMeter(zone.distance)} · {getZoneSafetyLabel(zone)}</small></span>
        <b>{zoneHasScore(zone) ? Number(zone.final_safety_score).toFixed(1) : '—'}<small>{zoneHasScore(zone) ? '/ 5' : ''}</small></b><Icon name="chevron" size={16} />
      </button>)}</div>
      <button type="button" className="home-guide-link" onClick={onOpenGuide}><Icon name="info" size={18} /><span><strong>안전점수 안내</strong><small>평가 기준과 정보 부족 표시</small></span><Icon name="chevron" size={16} /></button>
      <p className="home-footnote">점수는 시설 정보와 이용자 경험을 바탕으로 한 참고 정보예요. 실제 안전을 보장하지 않아요.</p>
    </div>
  </div>;
}

export function ServiceGuide({ onBack }) {
  return <main className="service-guide"><header><button type="button" onClick={onBack} aria-label="지도로 돌아가기">←</button><strong>여기지 이용 안내</strong></header>
    <span className="home-eyebrow">이용 가이드</span><h1>지도와 안전점수<br />이용 안내</h1>
    <section><h2>지도 색상 읽기</h2>{[['#00875a', '높은 평가', '3.5점 이상'], ['#eab308', '보통 평가', '2점 이상 3.5점 미만'], ['#dc2626', '낮은 평가', '2점 미만'], ['#64748b', '정보 부족', '평가에 사용할 정보가 부족해요']].map(([color, label, detail]) => <div className="guide-legend" key={label}><i style={{ background: color }} /><strong>{label}</strong><span>{detail}</span></div>)}</section>
    <section><h2>구역과 리뷰</h2><p>지도에서 구역을 선택하면 시설 정보와 리뷰를 확인할 수 있어요. 방문한 시간과 조명·유동인구처럼 직접 경험한 내용을 남겨 주세요.</p></section>
    <section><h2>점수 반영 기준</h2><p>리뷰는 작성자의 별점 80%와 텍스트 분석 20%로 계산하고 같은 작성자의 반복 리뷰는 한 사람의 의견으로 묶어요. 첫 리뷰의 급변을 줄이는 중립 기준은 작성자 0.5명 분량이에요. 시설 참고 점수는 현재 수집된 CCTV·편의점·조명 정보와 경찰시설 접근성을 사용하며, 미수집·오래된 자료와 주소 기반 추정 위치는 계산에서 제외해요. 리뷰와 시설이 모두 있으면 70:30으로 합치고, 리뷰가 없으면 시설 지표를 제공해요. 시설 지표가 낮다는 것은 실제 범죄 위험이 높다는 뜻은 아니에요.</p></section>
    <section><h2>경로는 어떻게 추천하나요?</h2><p>지도에서 받은 후보 경로의 최저 안전점수를 먼저 비교하고, 동점이면 평균점수와 이동시간을 비교해요. 모든 길 중 가장 안전한 길임을 보장하는 것은 아니에요.</p></section>
    <section><h2>분석 신뢰도와 계정 확인</h2><p>리뷰 신뢰도는 점수에 반영할 비중을 정하기 위한 지표이며 사실 여부를 판별하는 값이 아니에요. 네이버 연결은 계정에 등록된 성별을 확인하며 본인확인이나 실제 방문 인증을 대신하지 않아요.</p></section>
  </main>;
}
