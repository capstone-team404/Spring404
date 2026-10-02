import React, { useEffect, useRef, useState } from 'react';

import {
  API_URL,
  TMAP_APP_KEY,
  center,
  NEAR_ROUTE_DISTANCE_METER,
  HOME_SHEET_HEIGHT,
  PLACE_FOCUS_ZOOM,
  PLACE_SHEET_HEIGHT,
  ROUTE_SHEET_HEIGHT,
  ZONE_FOCUS_ZOOM,
  getAiAverage,
  formatMeter,
  formatSecond,
  getVisibleMapCenter,
  loadTmapScript,
  toTmapLatLng,
} from './mapHelpers';
import { BottomSheet, MapView, MyLocationButton, SearchPanel } from './AppViews';
import { authFetch } from './authApi';
import AdminPage from './AdminPage';
import MyPage from './MyPage';

const REPORT_REASONS = [
  { label: '허위·사실과 다른 정보', description: '실제 장소 상황과 다른 내용이라고 판단되는 경우' },
  { label: '방문하지 않고 작성한 것으로 의심되는 리뷰', description: '실제 경험 없이 작성한 것으로 보이는 경우' },
  { label: '광고·홍보성 내용', description: '업체 홍보, 스팸 등이 포함된 경우' },
  { label: '안전과 관련 없는 내용', description: '장소의 안전성과 무관한 내용만 작성된 경우' },
  { label: '욕설·비방·혐오 표현', description: '타인이나 특정 집단을 공격하는 내용이 포함된 경우' },
  { label: '개인정보 노출', description: '이름, 연락처, 얼굴 등 타인의 개인정보가 포함된 경우' },
  { label: '중복·도배 리뷰', description: '동일하거나 유사한 내용을 반복해서 작성한 경우' },
  { label: '부적절한 사진', description: '장소와 관계없거나 부적절한 이미지가 첨부된 경우' },
  { label: '기타', description: '직접 신고 사유 입력' },
];

function SafetyMap({ user, onUserChange, onLogout }) {
  const [screen, setScreen] = useState('map');
  const [menuOpen, setMenuOpen] = useState(false);
  const [tmapReady, setTmapReady] = useState(false);
  const [tmapLoadError, setTmapLoadError] = useState('');

  const [map, setMap] = useState(null);
  const [mapZones, setMapZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState('');
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [selectedSafetyScore, setSelectedSafetyScore] = useState(null);
  const [safetyScoreLoading, setSafetyScoreLoading] = useState(false);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewPhotos, setReviewPhotos] = useState([]);
  const [editingReviewId, setEditingReviewId] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [reviewSort, setReviewSort] = useState('latest');
  const [reportTargetId, setReportTargetId] = useState(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetail, setReportDetail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);

  const [startPoint, setStartPoint] = useState(null);
  const [endPoint, setEndPoint] = useState(null);
  const [routeCandidates, setRouteCandidates] = useState([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');

  const [myLocation, setMyLocation] = useState(null);
  const [locationLoading, setLocationLoading] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [searchScreenOpen, setSearchScreenOpen] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [sheetHeight, setSheetHeight] = useState(HOME_SHEET_HEIGHT);

  const routeLineRef = useRef(null);
  const routeGlowRef = useRef(null);
  const dragRef = useRef({
    dragging: false,
    startY: 0,
    startHeight: HOME_SHEET_HEIGHT,
  });

  const selectedRoute = routeCandidates[selectedRouteIndex];
  const isRouteView = routeCandidates.length > 0 || routeLoading || routeError;

  const getLatLngPosition = (latLng) => {
    if (!latLng) return center;

    return {
      lat: typeof latLng.lat === 'function' ? latLng.lat() : latLng._lat,
      lng: typeof latLng.lng === 'function' ? latLng.lng() : latLng._lng,
    };
  };

  useEffect(() => {
    loadTmapScript()
      .then(() => {
        setTmapReady(true);
        setTmapLoadError('');
      })
      .catch((err) => {
        setTmapLoadError(err.message || '티맵 SDK를 불러오지 못했습니다.');
      });
  }, []);

  useEffect(() => {
    setZoneLoading(true);
    authFetch(`${API_URL}/map/zones`)
      .then(async (res) => {
        if (!res.ok) throw new Error('존 정보를 불러오지 못했습니다.');
        const zones = await res.json();
        setMapZones(
          zones.map((zone) => ({
            ...zone,
            zone_name: `홍대 안전존 ${Number(zone.row_index || 0) + 1}-${Number(zone.col_index || 0) + 1}`,
          })),
        );
        setZoneError('');
      })
      .catch((err) => {
        console.error(err);
        setMapZones([]);
        setZoneError(err.message || '존 정보를 불러오지 못했습니다.');
      })
      .finally(() => {
        setZoneLoading(false);
      });
  }, []);

  const clearRouteLine = () => {
    if (routeLineRef.current) {
      routeLineRef.current.setMap(null);
      routeLineRef.current = null;
    }

    if (routeGlowRef.current) {
      routeGlowRef.current.setMap(null);
      routeGlowRef.current = null;
    }
  };

  useEffect(() => {
    if (!map || !selectedRoute) {
      clearRouteLine();
      return;
    }

    clearRouteLine();

    const path = selectedRoute.path.map(toTmapLatLng);

    routeGlowRef.current = new window.Tmapv2.Polyline({
      path,
      map,
      strokeColor: '#ffffff',
      strokeWeight: 13,
      strokeOpacity: 0.9,
      zIndex: 8,
    });

    routeLineRef.current = new window.Tmapv2.Polyline({
      path,
      map,
      strokeColor: '#15803d',
      strokeWeight: 6,
      strokeOpacity: 0.96,
      zIndex: 9,
    });
  }, [map, selectedRoute]);

  const getDisplayedSafetyScore = () => {
    if (selectedSafetyScore !== null && selectedSafetyScore !== undefined) {
      return Number(selectedSafetyScore).toFixed(2);
    }

    return getAiAverage(reviews);
  };

  const fetchAllReviews = async (sort = 'latest') => {
    const res = await authFetch(`${API_URL}/reviews?sort=${sort}`);
    if (!res.ok) throw new Error('리뷰를 불러오지 못했습니다.');
    return res.json();
  };

  const getErrorMessage = async (response, fallback = '요청을 처리하지 못했습니다.') => {
    try {
      const data = await response.json();
      return data?.detail?.message || data?.detail || fallback;
    } catch {
      return fallback;
    }
  };

  const getReviewsNearPosition = async (position, sort = reviewSort) => {
    const data = await fetchAllReviews(sort);

    return data.filter(
      (r) =>
        Math.abs(Number(r.lat) - position.lat) < 0.001 &&
        Math.abs(Number(r.lng) - position.lng) < 0.001,
    );
  };

  const getReviewsByZone = async (zoneId, sort = reviewSort) => {
    if (!zoneId) return [];
    const res = await authFetch(`${API_URL}/reviews?sort=${sort}&zone_id=${zoneId}`);
    if (!res.ok) throw new Error('리뷰를 불러오지 못했습니다.');
    return res.json();
  };

  const fetchSafetyScoreByPosition = async (position) => {
    const zoneRes = await authFetch(
      `${API_URL}/zones/by-location?lat=${position.lat}&lng=${position.lng}`,
    );
    if (!zoneRes.ok) return null;

    const zone = await zoneRes.json();
    const scoreRes = await authFetch(`${API_URL}/safety-score/${zone.zone_id}`);
    if (!scoreRes.ok) return null;

    return scoreRes.json();
  };

  const fetchSafetyScoreByZone = async (zoneId) => {
    if (!zoneId) return null;
    const scoreRes = await authFetch(`${API_URL}/safety-score/${zoneId}`);
    if (!scoreRes.ok) return null;
    return scoreRes.json();
  };

  const getZoneCenter = (zone) => {
    return {
      lat: (Number(zone.min_lat) + Number(zone.max_lat)) / 2,
      lng: (Number(zone.min_lng) + Number(zone.max_lng)) / 2,
    };
  };

  const normalizeZone = (zone) => {
    if (!zone) return null;

    const knownZone = mapZones.find(
      (item) => Number(item.zone_id) === Number(zone.zone_id),
    );

    return knownZone || zone;
  };

  const fetchZoneByPosition = async (position) => {
    const localZone = findZoneByPosition(position);
    if (localZone) return localZone;

    const zoneRes = await authFetch(
      `${API_URL}/zones/by-location?lat=${position.lat}&lng=${position.lng}`,
    );
    if (!zoneRes.ok) return null;

    return normalizeZone(await zoneRes.json());
  };

  const getAddressByPosition = async (position) => {
    if (!TMAP_APP_KEY) return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;

    const params = new URLSearchParams({
      version: '1',
      format: 'json',
      coordType: 'WGS84GEO',
      addressType: 'A10',
      lon: String(position.lng),
      lat: String(position.lat),
    });

    try {
      const res = await authFetch(`https://apis.openapi.sk.com/tmap/geo/reversegeocoding?${params}`, {
        headers: {
          appKey: TMAP_APP_KEY,
          accept: 'application/json',
        },
      });

      if (!res.ok) throw new Error('reverse geocoding failed');

      const data = await res.json();
      const info = data.addressInfo || {};
      const fullAddress = info.fullAddress || [info.city_do, info.gu_gun, info.legalDong, info.roadName, info.buildingIndex]
        .filter(Boolean)
        .join(' ');

      return fullAddress || `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    } catch (err) {
      console.error(err);
      return `${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`;
    }
  };

  const formatTmapPoi = (place) => {
    const lat = Number(place.frontLat || place.noorLat || place.lat);
    const lng = Number(place.frontLon || place.noorLon || place.lon || place.lng);
    const detailAddress = [
      place.upperAddrName,
      place.middleAddrName,
      place.lowerAddrName,
      place.roadName,
      place.firstBuildNo,
    ]
      .filter(Boolean)
      .join(' ');

    return {
      id: `${place.id || place.name || 'poi'}-${lat}-${lng}`,
      placeId: place.id,
      name: place.name || '이름 없는 장소',
      address: place.newAddressList?.newAddress?.[0]?.fullAddressRoad || detailAddress,
      icon: '',
      iconBackgroundColor: '#ffffff',
      position: {
        lat,
        lng,
      },
    };
  };

  const getNearestPoiByPosition = async (position) => {
    if (!TMAP_APP_KEY) return null;

    const params = new URLSearchParams({
      version: '1',
      format: 'json',
      page: '1',
      count: '10',
      centerLon: String(position.lng),
      centerLat: String(position.lat),
      radius: '30',
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      multiPoint: 'N',
    });

    try {
      const res = await authFetch(`https://apis.openapi.sk.com/tmap/pois/search/around?${params}`, {
        headers: {
          appKey: TMAP_APP_KEY,
          accept: 'application/json',
        },
      });

      if (!res.ok) return null;

      const data = await res.json();
      const pois = data.searchPoiInfo?.pois?.poi || [];
      const nearestPois = pois
        .map(formatTmapPoi)
        .filter((poi) => {
          return (
            Number.isFinite(poi.position.lat) &&
            Number.isFinite(poi.position.lng)
          );
        })
        .map((poi) => ({
          ...poi,
          distanceFromClick: getDistanceMeter(position, poi.position),
        }))
        .filter((poi) => poi.distanceFromClick <= 30)
        .sort((a, b) => a.distanceFromClick - b.distanceFromClick);

      return nearestPois[0] || null;
    } catch (err) {
      console.error(err);
      return null;
    }
  };

  const getDistanceFromRoute = (path, review) => {
    let minDistance = Infinity;

    path.forEach((point) => {
      const distance = getDistanceMeter(point, {
        lat: Number(review.lat),
        lng: Number(review.lng),
      });

      minDistance = Math.min(minDistance, distance);
    });

    return minDistance;
  };

  const getDistanceMeter = (a, b) => {
    const earthRadius = 6371000;
    const toRad = (value) => (Number(value) * Math.PI) / 180;
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const deltaLat = toRad(b.lat - a.lat);
    const deltaLng = toRad(b.lng - a.lng);
    const h =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

    return 2 * earthRadius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };

  const analyzeRouteReviews = (path, allReviews) => {
    const nearReviews = allReviews.filter((review) => {
      return getDistanceFromRoute(path, review) <= NEAR_ROUTE_DISTANCE_METER;
    });

    return {
      nearReviews,
      nearReviewCount: nearReviews.length,
    };
  };

  const requestTmapRouteByOption = async (
    origin,
    destination,
    option,
    optionName,
    allReviews,
  ) => {
    const body = {
      startX: String(origin.position.lng),
      startY: String(origin.position.lat),
      endX: String(destination.position.lng),
      endY: String(destination.position.lat),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
      startName: origin.name || 'start',
      endName: destination.name || 'end',
      searchOption: String(option),
    };

    const res = await authFetch(
      'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json',
      {
        method: 'POST',
        headers: {
          appKey: TMAP_APP_KEY,
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      throw new Error('Tmap 경로 요청 실패');
    }

    const data = await res.json();
    const features = data.features || [];
    const path = [];

    features.forEach((feature) => {
      const geometry = feature.geometry;

      if (geometry?.type === 'LineString') {
        geometry.coordinates.forEach(([lng, lat]) => {
          path.push({ lat, lng });
        });
      }
    });

    if (path.length === 0) {
      throw new Error('Tmap 경로 좌표 없음');
    }

    const firstProperties = features[0]?.properties || {};
    const totalDistance = firstProperties.totalDistance;
    const totalTime = firstProperties.totalTime;
    const reviewAnalysis = analyzeRouteReviews(path, allReviews);

    return {
      id: `tmap-${option}`,
      provider: 'tmap',
      name: optionName,
      distance: formatMeter(totalDistance),
      duration: formatSecond(totalTime),
      distanceValue: totalDistance || 0,
      durationValue: totalTime || 0,
      safetyScore: null,
      nearReviews: reviewAnalysis.nearReviews,
      nearReviewCount: reviewAnalysis.nearReviewCount,
      path,
    };
  };

  const requestTmapRoutes = async (origin, destination, allReviews) => {
    const options = [
      { option: 0, name: '추천 경로' },
      { option: 4, name: '대로 우선' },
      { option: 10, name: '최단 경로' },
      { option: 30, name: '계단 제외' },
    ];

    const results = await Promise.allSettled(
      options.map((item) =>
        requestTmapRouteByOption(
          origin,
          destination,
          item.option,
          item.name,
          allReviews,
        ),
      ),
    );

    const successRoutes = results
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);

    const uniqueMap = new Map();

    successRoutes.forEach((route) => {
      const key = route.path
        .filter((_, idx) => idx % 8 === 0)
        .map((point) => `${point.lat.toFixed(4)},${point.lng.toFixed(4)}`)
        .join('|');

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, route);
      }
    });

    return Array.from(uniqueMap.values());
  };

  const rankRoutesBySafety = async (candidates) => {
    const res = await authFetch(`${API_URL}/routes/safety-rank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ routes: candidates }),
    });

    if (!res.ok) {
      throw new Error('안전 경로 분석 실패');
    }

    const data = await res.json();
    return data.routes || candidates;
  };

  const requestRoutes = async (origin, destination) => {
    clearRouteLine();
    setRouteLoading(true);
    setRouteError('');
    setRouteCandidates([]);
    setSelectedRouteIndex(0);

    try {
      const allReviews = await fetchAllReviews('latest');

      const candidates = await requestTmapRoutes(origin, destination, allReviews);

      if (candidates.length === 0) {
        setRouteError('경로를 찾을 수 없습니다.');
        return;
      }

      let safetyRanked = candidates;

      try {
        safetyRanked = await rankRoutesBySafety(candidates);
      } catch (err) {
        console.error(err);
      }

      const sorted = safetyRanked.sort((a, b) =>
        Number(b.minSafetyScore || 0) - Number(a.minSafetyScore || 0) ||
        Number(b.averageSafetyScore || 0) - Number(a.averageSafetyScore || 0) ||
        Number(a.durationValue || 0) - Number(b.durationValue || 0)
      );

      setRouteCandidates(sorted);
      setSelectedRouteIndex(0);
      setSheetHeight(ROUTE_SHEET_HEIGHT);

      if (map && sorted[0]?.path?.length) {
        const bounds = new window.Tmapv2.LatLngBounds();
        sorted[0].path.forEach((point) => bounds.extend(toTmapLatLng(point)));
        map.fitBounds(bounds);
      }
    } catch (err) {
      console.error(err);
      setRouteError(err.message || '경로 분석 중 오류가 발생했습니다.');
    } finally {
      setRouteLoading(false);
    }
  };

  const resetRoute = () => {
    clearRouteLine();
    setStartPoint(null);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
  };

  const closeRouteView = () => {
    clearRouteLine();
    setStartPoint(null);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
    setSheetHeight(selectedPlace ? PLACE_SHEET_HEIGHT : HOME_SHEET_HEIGHT);

    if (selectedPlace) {
      focusPlaceOnMap(selectedPlace.position, PLACE_SHEET_HEIGHT);
    }
  };

  const resetPlaceAndRoute = () => {
    resetRoute();
    setSelectedPlace(null);
    setSelectedZone(null);
    setSelectedSafetyScore(null);
    setSafetyScoreLoading(false);
    setReviews([]);
    setReviewText('');
    setReviewRating(0);
    setReviewPhotos([]);
    setEditingReviewId(null);
    setSheetHeight(HOME_SHEET_HEIGHT);
  };

  const closeZoneDetail = () => {
    setSelectedZone(null);
    setSheetHeight(HOME_SHEET_HEIGHT);
  };

  const findZoneByPosition = (position) => {
    if (!position) return null;

    const lat = Number(position.lat);
    const lng = Number(position.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return (
      mapZones.find(
        (zone) =>
          Number(zone.min_lat) <= lat &&
          lat < Number(zone.max_lat) &&
          Number(zone.min_lng) <= lng &&
          lng < Number(zone.max_lng),
      ) || null
    );
  };

  const openZoneDetail = async (zone, position) => {
    if (!zone) return;

    const nextZone = normalizeZone(zone);
    const zonePosition = position || getZoneCenter(nextZone);

    resetRoute();
    setSelectedPlace({
      id: `zone-${nextZone.zone_id}`,
      name: `Zone ${nextZone.zone_id}의 안전 정보`,
      address: '선택한 지도 구역',
      icon: '',
      iconBackgroundColor: '#ffffff',
      position: zonePosition,
      zone_id: nextZone.zone_id,
      isZone: true,
    });
    setSelectedSafetyScore(null);
    setSafetyScoreLoading(true);
    setReviews([]);
    setReviewText('');
    setReviewRating(0);
    setReviewPhotos([]);
    setEditingReviewId(null);
    setSearchScreenOpen(false);
    setSelectedZone(nextZone);
    setSheetHeight(PLACE_SHEET_HEIGHT);

    focusPlaceOnMap(zonePosition, PLACE_SHEET_HEIGHT, ZONE_FOCUS_ZOOM);

    try {
      const [filtered, safetyScore] = await Promise.all([
        getReviewsByZone(nextZone.zone_id, reviewSort),
        fetchSafetyScoreByZone(nextZone.zone_id),
      ]);
      setReviews(filtered);
      setSelectedSafetyScore(safetyScore?.final_safety_score ?? nextZone.final_safety_score ?? null);
    } catch (err) {
      console.error(err);
      setReviews([]);
      setSelectedSafetyScore(nextZone.final_safety_score ?? null);
    } finally {
      setSafetyScoreLoading(false);
    }
  };

  const getCurrentPosition = () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('브라우저에서 위치 기능을 지원하지 않습니다.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          reject(new Error('현재 위치를 가져올 수 없습니다.'));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        },
      );
    });
  };

  const moveToMyLocation = async () => {
    setLocationLoading(true);

    try {
      const current = await getCurrentPosition();
      setMyLocation(current);

      if (map) {
        map.setCenter(toTmapLatLng(current));
        map.setZoom(16);
      }

      return current;
    } catch (err) {
      alert(err.message);
      return null;
    } finally {
      setLocationLoading(false);
    }
  };

  const setPointAsStart = (point) => {
    clearRouteLine();
    setStartPoint(point);
    setEndPoint(null);
    setRouteCandidates([]);
    setSelectedRouteIndex(0);
    setRouteError('');
    setRouteLoading(false);
    setSheetHeight(PLACE_SHEET_HEIGHT);
    focusPlaceOnMap(point.position, PLACE_SHEET_HEIGHT);
  };

  const setPointAsEnd = async (point) => {
    let origin = startPoint;

    if (!origin) {
      const current = myLocation || (await moveToMyLocation());

      if (!current) return;

      origin = {
        id: 'my-location-start',
        name: '내 위치',
        position: current,
      };

      setStartPoint(origin);
    }

    setEndPoint(point);
    requestRoutes(origin, point);
  };

  const centerPositionInVisibleMap = (position, nextSheetHeight) => {
    if (!map) return;

    const lat = Number(position.lat);
    const lng = Number(position.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    const zoom = typeof map.getZoom === 'function' ? map.getZoom() : PLACE_FOCUS_ZOOM;
    const nextCenter = toTmapLatLng(getVisibleMapCenter({ lat, lng }, nextSheetHeight, zoom));
    if (typeof map.setCenter === 'function') map.setCenter(nextCenter);
    if (typeof map.panTo === 'function') map.panTo(nextCenter);
  };

  const focusPlaceOnMap = (
    position,
    nextSheetHeight = PLACE_SHEET_HEIGHT,
    zoom = PLACE_FOCUS_ZOOM,
  ) => {
    if (!map) return;

    map.setZoom(zoom);

    window.setTimeout(() => {
      centerPositionInVisibleMap(position, nextSheetHeight);
    }, 80);
  };

  const openPlaceDetail = async (point) => {
    const zone = await fetchZoneByPosition(point.position);
    if (!zone) {
      alert('현재 리뷰는 홍대입구역 근방 1km 안의 지역에만 작성할 수 있습니다.');
      return;
    }

    const nextZone = normalizeZone(zone);
    setSelectedZone(nextZone);
    setSelectedPlace({ ...point, zone_id: nextZone.zone_id });
    setSelectedSafetyScore(null);
    setSafetyScoreLoading(true);
    setReviewText('');
    setReviewRating(0);
    setReviewPhotos([]);
    setEditingReviewId(null);
    setSearchScreenOpen(false);
    setSheetHeight(PLACE_SHEET_HEIGHT);

    focusPlaceOnMap(point.position, PLACE_SHEET_HEIGHT);

    try {
      const [filtered, safetyScore] = await Promise.all([
        getReviewsByZone(nextZone.zone_id, reviewSort),
        fetchSafetyScoreByZone(nextZone.zone_id),
      ]);
      setReviews(filtered);
      setSelectedSafetyScore(safetyScore?.final_safety_score ?? nextZone.final_safety_score ?? null);
    } catch (err) {
      console.error(err);
      setReviews([]);
      setSelectedSafetyScore(null);
    } finally {
      setSafetyScoreLoading(false);
    }
  };

  const openReportedReviewFromAdmin = async (report) => {
    if (report?.lat == null || report?.lng == null) return;

    const position = {
      lat: Number(report.lat),
      lng: Number(report.lng),
    };

    setScreen('map');
    setMenuOpen(false);

    await openPlaceDetail({
      id: `reported-review-${report.review_id}`,
      name: '신고된 리뷰 위치',
      address: '',
      position,
    });

    const reportedReview = {
      id: report.review_id,
      content: report.content,
      zone_id: report.zone_id,
      lat: report.lat,
      lng: report.lng,
      user_score: Number(report.user_score || 0),
      ai_score: Number(report.ai_score || 0),
      like_count: 0,
      report_count: Number(report.report_count || 0),
      report_status: report.report_status,
      moderation_status: report.moderation_status,
      photos: report.photos || [],
      is_admin_focus: true,
    };

    setReviews((prev) => [
      reportedReview,
      ...prev.filter((review) => Number(review.id) !== Number(report.review_id)),
    ]);
    setSheetHeight(PLACE_SHEET_HEIGHT);
  };

  const changeReviewSort = async (sort) => {
    setReviewSort(sort);

    const zoneId = selectedZone?.zone_id || selectedPlace?.zone_id;
    if (!zoneId) return;

    setSafetyScoreLoading(true);
    try {
      const filtered = await getReviewsByZone(zoneId, sort);
      setReviews(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setSafetyScoreLoading(false);
    }
  };

  const likeReview = async (reviewId) => {
    if (!reviewId) return;

    try {
      const res = await authFetch(`${API_URL}/reviews/${reviewId}/like`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('review like failed');

      const result = await res.json();
      const likedReview = result;

      setReviews((prev) => {
        const updated = prev.map((review) =>
          review.id === reviewId
            ? { ...review, like_count: likedReview.like_count }
            : review,
        );

        if (reviewSort === 'helpful') {
          return [...updated].sort(
            (a, b) =>
              Number(b.like_count || 0) - Number(a.like_count || 0) ||
              Number(b.id || 0) - Number(a.id || 0),
          );
        }

        return updated;
      });
    } catch (err) {
      console.error(err);
      alert('좋아요 처리에 실패했습니다.');
    }
  };

  const reportReview = async (reviewId) => {
    if (!reviewId) return;
    setReportTargetId(reviewId);
    setReportReason('');
    setReportDetail('');
  };

  const closeReportDialog = () => {
    if (reportSubmitting) return;
    setReportTargetId(null);
    setReportReason('');
    setReportDetail('');
  };

  const submitReport = async () => {
    if (!reportTargetId) return;
    if (!reportReason) {
      alert('신고 사유를 선택해 주세요.');
      return;
    }
    if (reportReason === '기타' && !reportDetail.trim()) {
      alert('기타 신고 사유를 입력해 주세요.');
      return;
    }

    if (!window.confirm('이 리뷰를 신고하시겠습니까?')) return;

    try {
      const res = await authFetch(`${API_URL}/reviews/${reviewId}/report`, {
        method: 'POST',
      });

      if (!res.ok) throw new Error('review report failed');

      const result = await res.json();
      const reportedReview = result;

      setReviews((prev) =>
        prev.map((review) =>
          review.id === reviewId
            ? {
                ...review,
                report_count: reportedReview.report_count,
                report_status: reportedReview.report_status,
              }
            : review,
        ),
      );

      alert('신고가 접수되었습니다.');
    } catch (err) {
      console.error(err);
      alert('신고 처리에 실패했습니다.');
    }
  };

  const submitReportWithReason = async () => {
    if (!reportTargetId) return;
    if (!reportReason) {
      alert('신고 사유를 선택해 주세요.');
      return;
    }
    if (reportReason === '기타' && !reportDetail.trim()) {
      alert('기타 신고 사유를 입력해 주세요.');
      return;
    }

    setReportSubmitting(true);
    try {
      const res = await authFetch(`${API_URL}/reviews/${reportTargetId}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reportReason,
          detail: reportDetail.trim() || null,
        }),
      });

      if (!res.ok) throw new Error('review report failed');

      const reportedReview = await res.json();
      setReviews((prev) =>
        prev.map((review) =>
          review.id === reportTargetId
            ? {
                ...review,
                report_count: reportedReview.report_count,
                report_status: reportedReview.report_status,
              }
            : review,
        ),
      );

      setReportTargetId(null);
      setReportReason('');
      setReportDetail('');
      alert('신고가 접수되었습니다.');
    } catch (err) {
      console.error(err);
      alert('신고 처리에 실패했습니다.');
    } finally {
      setReportSubmitting(false);
    }
  };

  const startEditReview = (review) => {
    if (!review?.id) return;

    if (review.report_status === 'under_review') {
      alert('신고 검토중인 리뷰는 수정할 수 없습니다.');
      return;
    }

    setEditingReviewId(review.id);
    setReviewText(review.content || '');
    setReviewRating(Number(review.user_score || 0));
    setReviewPhotos(
      review.photos?.length
        ? review.photos
        : review.photo_data
          ? [{ photo_data: review.photo_data, photo_name: review.photo_name }]
          : [],
    );
  };

  const cancelEditReview = () => {
    setEditingReviewId(null);
    setReviewText('');
    setReviewRating(0);
    setReviewPhotos([]);
  };

  const resizeReviewPhoto = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const maxSize = 900;
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);

          const context = canvas.getContext('2d');
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.72));
        };

        image.onerror = reject;
        image.src = reader.result;
      };

      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const selectReviewPhoto = async (file) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('이미지 파일만 첨부할 수 있습니다.');
      return;
    }

    try {
      const resizedPhoto = await resizeReviewPhoto(file);
      setReviewPhotos([{ photo_data: resizedPhoto, photo_name: file.name }]);
    } catch (err) {
      console.error(err);
      alert('사진을 불러오지 못했습니다.');
    }
  };

  const removeReviewPhoto = () => {
    setReviewPhotos([]);
  };

  const selectReviewPhotos = async (files) => {
    const selectedFiles = Array.from(files || []);
    if (selectedFiles.length === 0) return;

    const imageFiles = selectedFiles.filter((file) => file.type.startsWith('image/'));
    if (imageFiles.length !== selectedFiles.length) {
      alert('이미지 파일만 첨부할 수 있습니다.');
    }

    const remainingCount = Math.max(0, 5 - reviewPhotos.length);
    if (remainingCount === 0) {
      alert('사진은 최대 5장까지 첨부할 수 있습니다.');
      return;
    }

    try {
      const resizedPhotos = await Promise.all(
        imageFiles.slice(0, remainingCount).map(async (file) => ({
          photo_data: await resizeReviewPhoto(file),
          photo_name: file.name,
        })),
      );

      setReviewPhotos((prev) => [...prev, ...resizedPhotos].slice(0, 5));

      if (imageFiles.length > remainingCount) {
        alert('사진은 최대 5장까지 첨부할 수 있습니다.');
      }
    } catch (err) {
      console.error(err);
      alert('사진을 불러오지 못했습니다.');
    }
  };

  const removeReviewPhotoAt = (index) => {
    setReviewPhotos((prev) => prev.filter((_, photoIndex) => photoIndex !== index));
  };

  const deleteReview = async (reviewId) => {
    if (!reviewId) return;

    if (!window.confirm('이 리뷰를 삭제하시겠습니까?')) return;

    try {
      const res = await authFetch(`${API_URL}/reviews/${reviewId}`, {
        method: 'DELETE',
      });

      if (res.status === 409) {
        alert('신고 검토중인 리뷰는 임의로 삭제할 수 없습니다.');
        return;
      }

      if (!res.ok) throw new Error('review delete failed');

      await res.json();
      const zoneId = selectedZone?.zone_id || selectedPlace?.zone_id;
      if (zoneId) {
        const [filtered, safetyScore] = await Promise.all([
          getReviewsByZone(zoneId, reviewSort),
          fetchSafetyScoreByZone(zoneId),
        ]);
        setReviews(filtered);
        setSelectedSafetyScore(safetyScore?.final_safety_score ?? null);
      } else {
        setReviews((prev) => prev.filter((review) => review.id !== reviewId));
        setSelectedSafetyScore(null);
      }
      alert('리뷰가 삭제되었습니다.');
    } catch (err) {
      console.error(err);
      alert('리뷰 삭제에 실패했습니다.');
    }
  };

  const searchPlaces = () => {
    if (!searchText.trim()) {
      alert('검색어를 입력해주세요');
      return;
    }

    setSearchScreenOpen(true);
    setSearchLoading(true);
    setSearchError('');
    setSearchResults([]);

    const currentCenter = getLatLngPosition(map?.getCenter?.());
    const params = new URLSearchParams({
      version: '1',
      format: 'json',
      searchKeyword: searchText.trim(),
      count: '12',
      radius: '20',
      centerLat: String(currentCenter.lat),
      centerLon: String(currentCenter.lng),
      reqCoordType: 'WGS84GEO',
      resCoordType: 'WGS84GEO',
    });

    authFetch(`https://apis.openapi.sk.com/tmap/pois?${params}`, {
      headers: {
        appKey: TMAP_APP_KEY,
        accept: 'application/json',
      },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('검색 요청 실패');
        const data = await res.json();
        const pois = data.searchPoiInfo?.pois?.poi || [];

        const formatted = pois
          .filter((place) => {
            const lat = Number(place.frontLat || place.noorLat || place.lat);
            const lng = Number(place.frontLon || place.noorLon || place.lon || place.lng);
            return Number.isFinite(lat) && Number.isFinite(lng);
          })
          .map(formatTmapPoi);

        if (formatted.length === 0) {
          setSearchError('검색 결과가 없습니다.');
          return;
        }

        setSearchResults(formatted);
      })
      .catch((err) => {
        console.error(err);
        setSearchError(err.message || '검색 중 오류가 발생했습니다.');
      })
      .finally(() => {
        setSearchLoading(false);
      });
  };

  const handleReviewPlaceSelect = async ({ position }) => {
    if (!position) return;

    const zone = await fetchZoneByPosition(position);
    if (zone) {
      openZoneDetail(zone);
      return;
    }

    resetPlaceAndRoute();
  };

  const saveReview = async () => {
    const zoneId = selectedZone?.zone_id || selectedPlace?.zone_id;
    if (!selectedPlace || !zoneId) return;

    if (reviewRating === 0) {
      alert('별점을 선택해주세요');
      return;
    }

    if (!reviewText.trim()) {
      alert('리뷰를 입력해주세요');
      return;
    }

    setSafetyScoreLoading(true);

    try {
      if (editingReviewId) {
        const firstPhoto = reviewPhotos[0] || {};
        const res = await authFetch(`${API_URL}/reviews/${editingReviewId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: reviewText,
            user_score: reviewRating,
            photo_data: firstPhoto.photo_data || null,
            photo_name: firstPhoto.photo_name || null,
            photos: reviewPhotos,
          }),
        });

        if (res.status === 409) {
          alert('신고 검토중인 리뷰는 수정할 수 없습니다.');
          return;
        }

        if (!res.ok) throw new Error('리뷰 수정 실패');

        const result = await res.json();
        setReviews((prev) =>
          prev.map((review) =>
            Number(review.id) === Number(editingReviewId)
              ? {
                  ...review,
                  content: reviewText,
                  user_score: reviewRating,
                  photo_data: firstPhoto.photo_data || null,
                  photo_name: firstPhoto.photo_name || null,
                  photos: reviewPhotos,
                  ...(result.data || {}),
                }
              : review,
          ),
        );
        setReviewText('');
        setReviewRating(0);
        setReviewPhotos([]);
        setEditingReviewId(null);

        const zoneId = selectedZone?.zone_id || selectedPlace?.zone_id;
        if (zoneId) {
          const [filtered, safetyScore] = await Promise.all([
            getReviewsByZone(zoneId, reviewSort),
            fetchSafetyScoreByZone(zoneId),
          ]);
          setReviews(filtered);
          setSelectedSafetyScore(safetyScore?.final_safety_score ?? null);
        }

        alert('수정됨!');
        return;
      }

      const firstPhoto = reviewPhotos[0] || {};
      const res = await authFetch(`${API_URL}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: reviewText,
          photo_data: firstPhoto.photo_data || null,
          photo_name: firstPhoto.photo_name || null,
          photos: reviewPhotos,
          lat: selectedPlace.position.lat,
          lng: selectedPlace.position.lng,
          zone_id: zoneId,
          user_score: reviewRating,
        }),
      });

      if (!res.ok) {
        throw new Error(await getErrorMessage(res, '리뷰 저장 실패'));
      }

      const result = await res.json();

      const refreshedReviews = await getReviewsByZone(zoneId, reviewSort);
      setReviews(refreshedReviews);
      setSelectedSafetyScore(result.data.final_safety_score ?? null);
      setReviewText('');
      setReviewRating(0);
      setReviewPhotos([]);

      alert('저장됨!');
    } catch (err) {
      console.error(err);
      alert(err.message || '저장 실패');
    } finally {
      setSafetyScoreLoading(false);
    }
  };

  const startDrag = (e) => {
    dragRef.current = {
      dragging: true,
      startY: e.clientY,
      startHeight: sheetHeight,
    };
  };

  const moveDrag = (e) => {
    if (!dragRef.current.dragging) return;

    const diff = dragRef.current.startY - e.clientY;
    const nextHeight = dragRef.current.startHeight + diff;
    const maxHeight = getViewportHeight() * 0.82;
    const minHeight = selectedPlace || isRouteView ? 260 : 110;

    setSheetHeight(Math.min(maxHeight, Math.max(minHeight, nextHeight)));
  };

  const endDrag = () => {
    dragRef.current.dragging = false;
  };

  const closeSearch = () => {
    setSearchScreenOpen(false);
    setSearchError('');
  };

  const getViewportHeight = () => {
    return window.visualViewport?.height || window.innerHeight;
  };

  if (tmapLoadError) {
    return <div style={{ padding: 20 }}>{tmapLoadError}</div>;
  }

  if (!tmapReady) {
    return <div style={{ padding: 20 }}>티맵을 불러오는 중...</div>;
  }

  if (screen === 'mypage') {
    return (
      <MyPage
        user={user}
        onUserChange={onUserChange}
        onBackToMap={() => setScreen('map')}
        onLogout={onLogout}
      />
    );
  }

  if (screen === 'admin') {
    return (
      <AdminPage
        onBackToMap={() => setScreen('map')}
        onOpenReportedReview={openReportedReviewFromAdmin}
      />
    );
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100dvh',
        minHeight: '100vh',
        backgroundColor: '#e5e7eb',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '430px',
          height: '100dvh',
          minHeight: '100vh',
          overflow: 'hidden',
          backgroundColor: '#f8fafc',
        }}
      >
        <SearchPanel
          searchText={searchText}
          setSearchText={setSearchText}
          setSearchScreenOpen={setSearchScreenOpen}
          searchPlaces={searchPlaces}
          searchScreenOpen={searchScreenOpen}
          closeSearch={closeSearch}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          openPlaceDetail={openPlaceDetail}
          onOpenMenu={() => setMenuOpen(true)}
        />

        {menuOpen && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 80,
              backgroundColor: 'rgba(15, 23, 42, 0.28)',
            }}
            onClick={() => setMenuOpen(false)}
          >
            <aside
              style={{
                width: 'min(292px, 78%)',
                height: '100%',
                backgroundColor: '#ffffff',
                boxShadow: '16px 0 32px rgba(15, 23, 42, 0.22)',
                padding:
                  'calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 18px)',
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 4,
                }}
              >
                <strong style={{ color: '#14532d', fontSize: 20 }}>여기지!</strong>
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="메뉴 닫기"
                  style={{
                    width: 34,
                    height: 34,
                    border: 'none',
                    borderRadius: 10,
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    fontSize: 20,
                    fontWeight: 900,
                  }}
                >
                  ×
                </button>
              </div>

              <div
                style={{
                  padding: 12,
                  border: '1px solid #e5e7eb',
                  borderRadius: 14,
                  backgroundColor: '#f8fafc',
                }}
              >
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 800 }}>
                  로그인 계정
                </div>
                <div style={{ marginTop: 4, color: '#111827', fontWeight: 900 }}>
                  {user.nickname}
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setScreen('mypage');
                }}
                style={{
                  width: '100%',
                  height: 46,
                  border: '2px solid #14532d',
                  borderRadius: 12,
                  backgroundColor: '#ffffff',
                  color: '#14532d',
                  fontSize: 15,
                  fontWeight: 900,
                  textAlign: 'left',
                  padding: '0 14px',
                }}
              >
                마이페이지
              </button>

              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setScreen('admin');
                  }}
                  style={{
                    width: '100%',
                    height: 46,
                    border: '2px solid #b91c1c',
                    borderRadius: 12,
                    backgroundColor: '#fff7ed',
                    color: '#b91c1c',
                    fontSize: 15,
                    fontWeight: 900,
                    textAlign: 'left',
                    padding: '0 14px',
                  }}
                >
                  관리자 페이지
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                style={{
                  width: '100%',
                  height: 44,
                  marginTop: 'auto',
                  border: 'none',
                  borderRadius: 12,
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  fontSize: 14,
                  fontWeight: 900,
                }}
              >
                로그아웃
              </button>
            </aside>
          </div>
        )}

        {reportTargetId && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 90,
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'center',
              backgroundColor: 'rgba(15, 23, 42, 0.35)',
              padding: '16px 14px calc(env(safe-area-inset-bottom, 0px) + 16px)',
            }}
          >
            <section
              role="dialog"
              aria-modal="true"
              aria-label="리뷰 신고"
              style={{
                width: '100%',
                maxHeight: '78dvh',
                overflowY: 'auto',
                backgroundColor: '#ffffff',
                borderRadius: 18,
                padding: 16,
                boxShadow: '0 18px 45px rgba(15, 23, 42, 0.28)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <strong style={{ fontSize: 18, color: '#111827' }}>리뷰 신고</strong>
                <button
                  type="button"
                  onClick={closeReportDialog}
                  disabled={reportSubmitting}
                  style={{
                    width: 34,
                    height: 34,
                    border: 'none',
                    borderRadius: 10,
                    backgroundColor: '#f3f4f6',
                    color: '#374151',
                    fontSize: 20,
                    fontWeight: 900,
                  }}
                >
                  ×
                </button>
              </div>

              <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: 13, lineHeight: 1.45 }}>
                신고 사유를 선택하면 관리자 검토 내역으로 저장됩니다.
              </p>

              <div style={{ display: 'grid', gap: 8 }}>
                {REPORT_REASONS.map((reason) => (
                  <label
                    key={reason.label}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 9,
                      padding: '10px 11px',
                      border: `1px solid ${reportReason === reason.label ? '#14532d' : '#e5e7eb'}`,
                      borderRadius: 12,
                      backgroundColor: reportReason === reason.label ? '#ecfdf5' : '#ffffff',
                      color: '#111827',
                      fontSize: 13,
                      fontWeight: 800,
                      lineHeight: 1.35,
                    }}
                  >
                    <input
                      type="radio"
                      name="reportReason"
                      value={reason.label}
                      checked={reportReason === reason.label}
                      onChange={() => setReportReason(reason.label)}
                      style={{ marginTop: 2 }}
                    />
                    <span>
                      <span style={{ display: 'block' }}>{reason.label}</span>
                      <span style={{ display: 'block', marginTop: 3, color: '#64748b', fontSize: 12, fontWeight: 700 }}>
                        {reason.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>

              {reportReason === '기타' && (
                <textarea
                  value={reportDetail}
                  onChange={(e) => setReportDetail(e.target.value)}
                  placeholder="신고 사유를 직접 입력해 주세요"
                  style={{
                    width: '100%',
                    minHeight: 84,
                    marginTop: 10,
                    border: '1px solid #d1d5db',
                    borderRadius: 12,
                    padding: 11,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'inherit',
                    fontSize: 13,
                  }}
                />
              )}

              <button
                type="button"
                onClick={submitReportWithReason}
                disabled={reportSubmitting}
                style={{
                  width: '100%',
                  height: 44,
                  marginTop: 12,
                  border: 'none',
                  borderRadius: 12,
                  backgroundColor: '#14532d',
                  color: '#ffffff',
                  fontWeight: 900,
                }}
              >
                {reportSubmitting ? '접수 중...' : '신고 접수'}
              </button>
            </section>
          </div>
        )}

        <MapView
          setMap={setMap}
          handleReviewPlaceSelect={handleReviewPlaceSelect}
          tmapReady={tmapReady}
          mapZones={mapZones}
          selectedZone={selectedZone}
          onZoneSelect={openZoneDetail}
          sheetHeight={sheetHeight}
          myLocation={myLocation}
          selectedPlace={selectedPlace}
          isRouteView={isRouteView}
          startPoint={startPoint}
          endPoint={endPoint}
        />

        <MyLocationButton
          moveToMyLocation={moveToMyLocation}
          locationLoading={locationLoading}
          sheetHeight={sheetHeight}
        />

        <BottomSheet
          sheetHeight={sheetHeight}
          startDrag={startDrag}
          isRouteView={isRouteView}
          closeRouteView={closeRouteView}
          startPoint={startPoint}
          endPoint={endPoint}
          routeLoading={routeLoading}
          routeError={routeError}
          routeCandidates={routeCandidates}
          selectedRouteIndex={selectedRouteIndex}
          setSelectedRouteIndex={setSelectedRouteIndex}
          selectedPlace={selectedPlace}
          selectedZone={selectedZone}
          zoneLoading={zoneLoading}
          zoneError={zoneError}
          closeZoneDetail={closeZoneDetail}
          resetPlaceAndRoute={resetPlaceAndRoute}
          setPointAsStart={setPointAsStart}
          setPointAsEnd={setPointAsEnd}
          reviews={reviews}
          reviewSort={reviewSort}
          changeReviewSort={changeReviewSort}
          likeReview={likeReview}
          reportReview={reportReview}
          deleteReview={deleteReview}
          startEditReview={startEditReview}
          currentUserId={user.id}
          currentUser={user}
          onOpenMyPage={() => setScreen('mypage')}
          onLogout={onLogout}
          displayedSafetyScore={getDisplayedSafetyScore()}
          safetyScoreLoading={safetyScoreLoading}
          reviewRating={reviewRating}
          setReviewRating={setReviewRating}
          reviewText={reviewText}
          setReviewText={setReviewText}
          reviewPhotos={reviewPhotos}
          selectReviewPhotos={selectReviewPhotos}
          removeReviewPhoto={removeReviewPhotoAt}
          editingReviewId={editingReviewId}
          cancelEditReview={cancelEditReview}
          saveReview={saveReview}
        />
      </div>
    </div>
  );
}

export default SafetyMap;
