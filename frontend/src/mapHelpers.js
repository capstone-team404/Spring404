export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const TMAP_APP_KEY = import.meta.env.VITE_TMAP_APP_KEY || '';

export const center = {
  lat: 37.557527,
  lng: 126.924466,
};

export const INITIAL_MAP_ZOOM = 18;

export const mapStyle = {
  width: '100%',
  height: '100%',
};

export const NEAR_ROUTE_DISTANCE_METER = 120;
export const HOME_SHEET_HEIGHT = 120;
export const PLACE_SHEET_HEIGHT = 300;
export const ROUTE_SHEET_HEIGHT = 520;

const koreaBounds = {
  minLat: 33,
  maxLat: 39,
  minLng: 124,
  maxLng: 132,
};

export const isInKorea = (position) => {
  return (
    position.lat >= koreaBounds.minLat &&
    position.lat <= koreaBounds.maxLat &&
    position.lng >= koreaBounds.minLng &&
    position.lng <= koreaBounds.maxLng
  );
};

export const getUserAverage = (arr) => {
  if (arr.length === 0) return '0.00';
  const sum = arr.reduce((acc, cur) => acc + Number(cur.user_score || 0), 0);
  return (sum / arr.length).toFixed(2);
};

export const getAiAverage = (arr) => {
  if (arr.length === 0) return '5.00';
  const sum = arr.reduce((acc, cur) => acc + Number(cur.ai_score || 0), 0);
  return (sum / arr.length).toFixed(2);
};

export const getSafetyColor = (score) => {
  if (score >= 4) return '#16a34a';
  if (score >= 2.5) return '#f59e0b';
  return '#ef4444';
};

export const formatMeter = (meter) => {
  if (!meter && meter !== 0) return '-';
  if (meter >= 1000) return `${(meter / 1000).toFixed(1)}km`;
  return `${Math.round(meter)}m`;
};

export const formatSecond = (second) => {
  if (!second && second !== 0) return '-';

  const min = Math.round(second / 60);

  if (min >= 60) {
    const hour = Math.floor(min / 60);
    const rest = min % 60;
    return `${hour}시간 ${rest}분`;
  }

  return `${min}분`;
};

export const handlePlaceIconError = (e) => {
  e.currentTarget.style.display = 'none';

  const fallback = e.currentTarget.nextElementSibling;
  if (fallback) {
    fallback.style.display = 'inline';
  }
};

export const toTmapLatLng = (position) => {
  return new window.Tmapv2.LatLng(Number(position.lat), Number(position.lng));
};

let tmapScriptPromise;

export const loadTmapScript = () => {
  if (window.Tmapv2) return Promise.resolve();

  if (!TMAP_APP_KEY) {
    return Promise.reject(new Error('frontend/.env에 VITE_TMAP_APP_KEY를 설정한 뒤 dev 서버를 다시 시작해 주세요.'));
  }

  if (tmapScriptPromise) return tmapScriptPromise;

  tmapScriptPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      if (window.Tmapv2) {
        settled = true;
        resolve();
      }
    };
    const fail = (message) => {
      if (settled) return;
      settled = true;
      reject(new Error(message));
    };

    const existing = document.querySelector('script[src*="/tmap/jsv2"]');

    if (existing) {
      existing.addEventListener('load', () => {
        if (window.Tmapv2) finish();
        else fail('티맵 SDK는 로드됐지만 Tmapv2 객체를 찾지 못했습니다.');
      }, { once: true });
      existing.addEventListener('error', () => fail('티맵 SDK 로드 실패'), { once: true });

      const intervalId = window.setInterval(finish, 100);
      window.setTimeout(() => {
        window.clearInterval(intervalId);
        if (window.Tmapv2) finish();
        else fail('티맵 SDK를 불러오지 못했습니다. 키의 웹 도메인 허용 또는 네트워크를 확인해 주세요.');
      }, 8000);
      return;
    }

    const script = document.createElement('script');
    script.dataset.tmapSdk = 'true';
    script.async = true;
    script.src = `https://apis.openapi.sk.com/tmap/jsv2?version=1&appKey=${encodeURIComponent(TMAP_APP_KEY)}`;
    script.onload = finish;
    script.onerror = () => fail('티맵 SDK 로드 실패');
    document.head.appendChild(script);
  });

  return tmapScriptPromise;
};
