import React, { useEffect, useRef, useState } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';

import {
  API_URL,
  TMAP_APP_KEY,
  LIBRARIES,
  center,
  NEAR_ROUTE_DISTANCE_METER,
  HOME_SHEET_HEIGHT,
  PLACE_SHEET_HEIGHT,
  ROUTE_SHEET_HEIGHT,
  isInKorea,
  getAiAverage,
  formatMeter,
  formatSecond,
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
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries: LIBRARIES,
  });

  const [map, setMap] = useState(null);
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

    routeGlowRef.current = new window.google.maps.Polyline({
      path: selectedRoute.path,
      map,
      strokeColor: '#ffffff',
      strokeWeight: 13,
      strokeOpacity: 0.9,
      zIndex: 8,
    });

    routeLineRef.current = new window.google.maps.Polyline({
      path: selectedRoute.path,
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
    if (!res.ok) throw new Error('서버 오류');
    return res.json();
  };

  const getReviewsNearPosition = async (position, sort = reviewSort) => {
    const data = await fetchAllReviews(sort);

    return data.filter(
      (r) =>
        Math.abs(Number(r.lat) - position.lat) < 0.001 &&
        Math.abs(Number(r.lng) - position.lng) < 0.001,
    );
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

  const getPlaceDetailsByPlaceId = (placeId) => {
    return new Promise((resolve) => {
      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      );

      service.getDetails(
        {
          placeId,
          fields: [
            'name',
            'formatted_address',
            'icon',
            'icon_background_color',
          ],
        },
        (place, status) => {
          if (status === 'OK' && place?.name) {
            resolve({
              name: place.name,
              address: place.formatted_address || '',
              icon: place.icon || '',
              iconBackgroundColor: place.icon_background_color || '#ffffff',
            });
          } else {
            resolve({
              name: '',
              address: '',
              icon: '',
              iconBackgroundColor: '#ffffff',
            });
          }
        },
      );
    });
  };

  const getAddressByPosition = (position) => {
    return new Promise((resolve) => {
      const geocoder = new window.google.maps.Geocoder();

      geocoder.geocode({ location: position }, (results, status) => {
        if (status === 'OK' && results?.[0]) {
          resolve(results[0].formatted_address);
        } else {
          resolve(`${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`);
        }
      });
    });
  };

  const getLocationName = async (position, placeId) => {
    if (placeId) {
      const detail = await getPlaceDetailsByPlaceId(placeId);
      if (detail.name) return detail.name;
    }

    return getAddressByPosition(position);
  };

  const getDistanceFromRoute = (path, review) => {
    const reviewLatLng = new window.google.maps.LatLng(
      Number(review.lat),
      Number(review.lng),
    );

    let minDistance = Infinity;

    path.forEach((point) => {
      const routePoint = new window.google.maps.LatLng(point.lat, point.lng);
      const distance =
        window.google.maps.geometry.spherical.computeDistanceBetween(
          routePoint,
          reviewLatLng,
        );

      minDistance = Math.min(minDistance, distance);
    });

    return minDistance;
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

  const requestGoogleRoutes = (origin, destination, allReviews) => {
    return new Promise((resolve, reject) => {
      const directionsService = new window.google.maps.DirectionsService();

      directionsService.route(
        {
          origin: origin.position,
          destination: destination.position,
          travelMode: window.google.maps.TravelMode.WALKING,
          provideRouteAlternatives: true,
        },
        (result, status) => {
          if (status !== 'OK' || !result?.routes?.length) {
            reject(new Error(`경로를 찾을 수 없습니다. (${status})`));
            return;
          }

          const candidates = result.routes.map((route, index) => {
            const leg = route.legs?.[0];
            const path = (route.overview_path || []).map((point) => ({
              lat: point.lat(),
              lng: point.lng(),
            }));
            const reviewAnalysis = analyzeRouteReviews(path, allReviews);

            return {
              id: `google-${index}`,
              provider: 'google',
              name: route.summary || `경로 ${index + 1}`,
              distance: leg?.distance?.text || '-',
              duration: leg?.duration?.text || '-',
              distanceValue: leg?.distance?.value || 0,
              durationValue: leg?.duration?.value || 0,
              safetyScore: null,
              nearReviews: reviewAnalysis.nearReviews,
              nearReviewCount: reviewAnalysis.nearReviewCount,
              path,
            };
          });

          resolve(candidates);
        },
      );
    });
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

      const useTmap =
        isInKorea(origin.position) && isInKorea(destination.position);

      const candidates = useTmap
        ? await requestTmapRoutes(origin, destination, allReviews)
        : await requestGoogleRoutes(origin, destination, allReviews);

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
        const bounds = new window.google.maps.LatLngBounds();
        sorted[0].path.forEach((point) => bounds.extend(point));
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
    setSelectedSafetyScore(null);
    setSafetyScoreLoading(false);
    setReviews([]);
    setReviewText('');
    setReviewRating(0);
    setReviewPhotos([]);
    setEditingReviewId(null);
    setSheetHeight(HOME_SHEET_HEIGHT);
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
        map.panTo(current);
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

    const projection = map.getProjection();
    const zoom = map.getZoom() || 16;

    if (!projection) {
      map.panTo(position);
      return;
    }

    const scale = 2 ** zoom;
    const latLng = new window.google.maps.LatLng(position.lat, position.lng);
    const point = projection.fromLatLngToPoint(latLng);

    if (!point) {
      map.panTo(position);
      return;
    }

    const centerPoint = new window.google.maps.Point(
      point.x,
      point.y + nextSheetHeight / 2 / scale,
    );

    const newCenter = projection.fromPointToLatLng(centerPoint);
    map.setCenter(newCenter);
  };

  const focusPlaceOnMap = (position, nextSheetHeight = PLACE_SHEET_HEIGHT) => {
    if (!map) return;

    map.setZoom(16);

    window.setTimeout(() => {
      centerPositionInVisibleMap(position, nextSheetHeight);
    }, 80);
  };

  const openPlaceDetail = async (point) => {
    setSelectedPlace(point);
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
      const filtered = await getReviewsNearPosition(point.position, reviewSort);
      setReviews(filtered);

      const safetyScore = await fetchSafetyScoreByPosition(point.position);
      setSelectedSafetyScore(safetyScore?.final_safety_score ?? null);
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

    if (!selectedPlace) return;

    setSafetyScoreLoading(true);
    try {
      const filtered = await getReviewsNearPosition(selectedPlace.position, sort);
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
      setReviews((prev) => prev.filter((review) => review.id !== reviewId));
      setSelectedSafetyScore(null);
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

    const service = new window.google.maps.places.PlacesService(
      document.createElement('div'),
    );

    const location = map?.getCenter() || new window.google.maps.LatLng(center);

    service.textSearch(
      {
        query: searchText,
        location,
        radius: 20000,
      },
      (results, status) => {
        setSearchLoading(false);

        if (status !== window.google.maps.places.PlacesServiceStatus.OK) {
          setSearchError(`검색 결과가 없습니다. (${status})`);
          return;
        }

        const formatted = results
          .filter((place) => place.geometry?.location)
          .slice(0, 12)
          .map((place) => ({
            id: place.place_id || `${place.name}-${Date.now()}`,
            placeId: place.place_id,
            name: place.name || '이름 없는 장소',
            address: place.formatted_address || place.vicinity || '',
            icon: place.icon || '',
            iconBackgroundColor:
              place.icon_background_color ||
              place.iconBackgroundColor ||
              '#ffffff',
            position: {
              lat: place.geometry.location.lat(),
              lng: place.geometry.location.lng(),
            },
          }));

        setSearchResults(formatted);
      },
    );
  };

  const handleReviewPlaceSelect = async (e) => {
    if (!e.placeId || !e.latLng) return;

    e.stop();

    const position = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng(),
    };

    const detail = await getPlaceDetailsByPlaceId(e.placeId);
    const fallbackName = await getLocationName(position, e.placeId);

    openPlaceDetail({
      id: Date.now(),
      placeId: e.placeId,
      name: detail.name || fallbackName,
      address: detail.address,
      icon: detail.icon,
      iconBackgroundColor: detail.iconBackgroundColor,
      position,
    });
  };

  const saveReview = async () => {
    if (!selectedPlace) return;

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
          user_score: reviewRating,
        }),
      });

      if (!res.ok) throw new Error('서버 오류');

      const result = await res.json();

      setReviews((prev) => [...prev, result.data]);
      setSelectedSafetyScore(result.data.final_safety_score ?? null);
      setReviewText('');
      setReviewRating(0);
      setReviewPhotos([]);

      alert('저장됨!');
    } catch (err) {
      console.error(err);
      alert('저장 실패');
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

  if (!isLoaded) {
    return <div style={{ padding: 20 }}>Loading...</div>;
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
          myLocation={myLocation}
          selectedPlace={selectedPlace}
          isRouteView={isRouteView}
          openPlaceDetail={openPlaceDetail}
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
