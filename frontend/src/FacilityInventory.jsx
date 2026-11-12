import React from 'react';

const labels = { cctv: 'CCTV', streetlight: '가로등', security_light: '보안등', convenience: '편의점', police: '경찰시설' };
const statusLabels = { success: '수집 완료', failed: '갱신 실패', not_configured: '미수집', uncollected: '미수집' };
const dateText = (value) => {
  if (!value) return '미수집';
  // Backend DATETIME values are UTC.
  const date = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`);
  return Number.isNaN(date.getTime()) ? '날짜 확인 필요' : date.toLocaleDateString('ko-KR');
};

export default function FacilityInventory({ inventory }) {
  if (!inventory || !inventory.in_collection_area) {
    return <div style={{ fontSize: 13, color: '#6b7280' }}>시설 데이터 미수집 지역입니다.</div>;
  }
  const sources = inventory.sources || {};
  const count = (value) => value == null ? '미수집' : `${value}개`;
  const rows = [
    ['CCTV', count(inventory.cctv_count)],
    ['가로등·보안등', inventory.lamp_count == null
      ? (inventory.lamp_known_count == null ? '미수집' : `확인된 ${inventory.lamp_known_count}개 · 일부 미수집`)
      : count(inventory.lamp_count)],
    ['편의점', count(inventory.convenience_count)],
    ['경찰시설', count(inventory.police_count)],
  ];
  return <section aria-label="수집된 안전 시설 현황" style={{ fontSize: 13, color: '#374151' }}>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontWeight: 800 }}>
      {rows.map(([label, value]) => <div key={label} style={{ padding: 10, borderRadius: 12, backgroundColor: '#f9fafb' }}>{label} {value}</div>)}
    </div>
    {inventory.nearest_police_distance_m != null && <p>
      가까운 경찰시설: {inventory.nearest_police_name} · 직선거리 약 {Math.round(inventory.nearest_police_distance_m)}m
    </p>}
    <p style={{ color: '#6b7280', lineHeight: 1.5 }}>
      공개된 시설 목록 기준입니다. {inventory.score_status === 'integrated_reference' ? '정확한 위치가 확인된 시설 자료를 참고 점수에 반영합니다. 주소 기반 추정 위치는 점수에서 제외합니다.' : '새 시설 안전점수는 기준 확정 후 반영됩니다.'}
      {inventory.boundary_zone && ' 이 구역은 수집 반경 안의 시설만 집계했습니다.'}
    </p>
    <details>
      <summary style={{ cursor: 'pointer' }}>시설별 수집 현황</summary>
      <ul style={{ paddingLeft: 18, lineHeight: 1.7 }}>
        {Object.entries(labels).map(([source, label]) => {
          const state = sources[source] || {};
          return <li key={source}>{label}: {state.has_data && state.partial ? '일부 수집' : (statusLabels[state.status] || '미수집')}
            {state.estimated_coordinates && ' · 주소 기반 추정 위치'}
            {state.has_data && ` · 최근 수집 ${dateText(state.last_success)}`}
            {state.stale && ' · 이전 자료 표시 중'}
            {state.data_dates?.length > 0 && ` · 원본 기준 ${state.data_dates.join(', ')}`}
          </li>;
        })}
      </ul>
    </details>
  </section>;
}
