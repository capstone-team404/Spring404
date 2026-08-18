import React from 'react';
import { GoogleMap, Marker, OverlayView } from '@react-google-maps/api';

import {
  center,
  mapStyle,
  getMyLocationIcon,
  getPinIcon,
  getSafetyColor,
  getUserAverage,
  handlePlaceIconError,
} from './mapHelpers';

import {
  locationBoxStyle,
  locationLineStyle,
  startDotStyle,
  endDotStyle,
  locationLabelStyle,
  locationTextStyle,
  locationDividerStyle,
  placeActionRowStyle,
  placeActionStyle,
  noticeStyle,
  scoreBoxStyle,
  scoreLabelStyle,
  scoreValueStyle,
  targetLineTopStyle,
  targetLineBottomStyle,
  targetLineLeftStyle,
  targetLineRightStyle,
  targetDotStyle,
} from './styles';

export function SearchPanel({
  searchText,
  setSearchText,
  setSearchScreenOpen,
  searchPlaces,
  searchScreenOpen,
  closeSearch,
  searchLoading,
  searchError,
  searchResults,
  openPlaceDetail,
  onOpenMenu,
}) {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
          left: 12,
          right: 12,
          zIndex: 30,
          display: 'flex',
          gap: 8,
        }}
      >
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="메뉴 열기"
          style={{
            width: 44,
            height: 44,
            border: 'none',
            borderRadius: 14,
            backgroundColor: '#ffffff',
            color: '#14532d',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            display: 'grid',
            placeItems: 'center',
            padding: 0,
            flex: '0 0 auto',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 18,
              height: 14,
              display: 'grid',
              gap: 4,
            }}
          >
            <span style={{ height: 2, backgroundColor: '#14532d', borderRadius: 999 }} />
            <span style={{ height: 2, backgroundColor: '#14532d', borderRadius: 999 }} />
            <span style={{ height: 2, backgroundColor: '#14532d', borderRadius: 999 }} />
          </span>
        </button>

        <input
          value={searchText}
          onFocus={() => setSearchScreenOpen(true)}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') searchPlaces();
          }}
          placeholder="장소 검색"
          style={{
            flex: 1,
            height: 44,
            border: 'none',
            borderRadius: 14,
            padding: '0 14px',
            fontSize: 15,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
            outline: 'none',
          }}
        />

        <button
          onClick={searchPlaces}
          style={{
            width: 58,
            border: 'none',
            borderRadius: 14,
            backgroundColor: '#14532d',
            color: 'white',
            fontWeight: 800,
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
          }}
        >
          검색
        </button>
      </div>

      {searchScreenOpen && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 25,
            backgroundColor: '#f8fafc',
            padding:
              'calc(env(safe-area-inset-top, 0px) + 72px) 14px calc(env(safe-area-inset-bottom, 0px) + 20px)',
            overflowY: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 14,
            }}
          >
            <strong style={{ fontSize: 18 }}>검색 결과</strong>
            <button
              onClick={closeSearch}
              style={{
                border: 'none',
                backgroundColor: '#e5e7eb',
                borderRadius: 999,
                padding: '8px 12px',
                fontWeight: 700,
              }}
            >
              닫기
            </button>
          </div>

          {searchLoading && <p>검색 중...</p>}
          {searchError && <p style={{ color: '#ef4444' }}>{searchError}</p>}

          {searchResults.map((place) => (
            <button
              key={place.id}
              onClick={() => openPlaceDetail(place)}
              style={{
                width: '100%',
                display: 'block',
                textAlign: 'left',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
                boxShadow: '0 4px 14px rgba(15, 23, 42, 0.06)',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#111827',
                  marginBottom: 4,
                }}
              >
                {place.icon ? (
                  <>
                    <img
                      src={place.icon}
                      alt=""
                      onError={handlePlaceIconError}
                      style={{ width: 18, height: 18 }}
                    />
                    <span style={{ display: 'none' }}>📍</span>
                  </>
                ) : (
                  <span>📍</span>
                )}
                <span>{place.name}</span>
              </div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>
                {place.address || '주소 정보 없음'}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function MapView({
  setMap,
  handleReviewPlaceSelect,
  myLocation,
  selectedPlace,
  isRouteView,
  openPlaceDetail,
  startPoint,
  endPoint,
}) {
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <GoogleMap
        mapContainerStyle={mapStyle}
        center={center}
        zoom={16}
        options={{
          clickableIcons: true,
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
          zoomControl: false,
        }}
        onLoad={(mapInstance) => setMap(mapInstance)}
        onClick={handleReviewPlaceSelect}
      >
        {myLocation && (
          <>
            <OverlayView
              position={myLocation}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={() => ({ x: -22, y: -22 })}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  backgroundColor: 'rgba(37, 99, 235, 0.16)',
                  boxShadow:
                    '0 0 12px rgba(37, 99, 235, 0.55), 0 0 28px rgba(37, 99, 235, 0.28)',
                  border: '1px solid rgba(37, 99, 235, 0.28)',
                }}
              />
            </OverlayView>

            <Marker
              position={myLocation}
              icon={getMyLocationIcon()}
              title="내 위치"
              zIndex={30}
            />
          </>
        )}

        {selectedPlace && !isRouteView && (
          <>
            <OverlayView
              position={selectedPlace.position}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={() => ({ x: -22, y: -48 })}
            >
              <button
                onClick={() => openPlaceDetail(selectedPlace)}
                style={{
                  width: 44,
                  height: 44,
                  border: 'none',
                  borderRadius: '50% 50% 50% 0',
                  backgroundColor: '#14532d',
                  transform: 'rotate(-45deg)',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.28)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <span
                  style={{
                    width: 25,
                    height: 25,
                    borderRadius: 999,
                    backgroundColor: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transform: 'rotate(45deg)',
                    overflow: 'hidden',
                  }}
                >
                  {selectedPlace.icon ? (
                    <>
                      <img
                        src={selectedPlace.icon}
                        alt=""
                        onError={handlePlaceIconError}
                        style={{ width: 17, height: 17 }}
                      />
                      <span style={{ display: 'none', fontSize: 14 }}>📍</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 14 }}>📍</span>
                  )}
                </span>
              </button>
            </OverlayView>

            <OverlayView
              position={selectedPlace.position}
              mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
              getPixelPositionOffset={() => ({ x: 0, y: 18 })}
            >
              <div
                style={{
                  display: 'inline-block',
                  width: 'max-content',
                  maxWidth: 240,
                  transform: 'translateX(-50%)',
                  backgroundColor: '#ffffff',
                  color: '#111827',
                  border: '1px solid #e5e7eb',
                  borderRadius: 999,
                  padding: '6px 12px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.18)',
                  fontSize: 12,
                  fontWeight: 900,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {selectedPlace.name}
              </div>
            </OverlayView>
          </>
        )}

        {startPoint && (
          <Marker
            position={startPoint.position}
            icon={getPinIcon('#2563eb')}
            label={{
              text: '출발',
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '9px',
            }}
            title={`출발: ${startPoint.name}`}
          />
        )}

        {endPoint && (
          <Marker
            position={endPoint.position}
            icon={getPinIcon('#ef4444')}
            label={{
              text: '도착',
              color: '#ffffff',
              fontWeight: '900',
              fontSize: '9px',
            }}
            title={`도착: ${endPoint.name}`}
          />
        )}
      </GoogleMap>
    </div>
  );
}

export function MyLocationButton({ moveToMyLocation, locationLoading, sheetHeight }) {
  return (
    <button
      onClick={moveToMyLocation}
      disabled={locationLoading}
      aria-label="내 위치"
      style={{
        position: 'absolute',
        right: 14,
        bottom: `calc(${sheetHeight + 16}px + env(safe-area-inset-bottom, 0px))`,
        zIndex: 22,
        width: 44,
        height: 44,
        borderRadius: 999,
        border: '1px solid #dfe3ea',
        backgroundColor: '#ffffff',
        boxShadow: '0 4px 12px rgba(15, 23, 42, 0.22)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: locationLoading ? 'default' : 'pointer',
        opacity: locationLoading ? 0.65 : 1,
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 20,
          height: 20,
          border: '2px solid #4b5563',
          borderRadius: 999,
          display: 'block',
          boxSizing: 'border-box',
        }}
      >
        <span style={targetLineTopStyle} />
        <span style={targetLineBottomStyle} />
        <span style={targetLineLeftStyle} />
        <span style={targetLineRightStyle} />
        <span style={targetDotStyle} />
      </span>
    </button>
  );
}

function LocationBox({ startPoint, endPoint }) {
  return (
    <div style={locationBoxStyle}>
      <div style={locationLineStyle}>
        <span style={startDotStyle} />
        <span style={locationLabelStyle}>출발</span>
        <strong style={locationTextStyle}>
          {startPoint?.name || '출발지를 선택하세요'}
        </strong>
      </div>

      <div style={locationDividerStyle} />

      <div style={locationLineStyle}>
        <span style={endDotStyle} />
        <span style={locationLabelStyle}>도착</span>
        <strong style={locationTextStyle}>
          {endPoint?.name || '도착지를 선택하세요'}
        </strong>
      </div>
    </div>
  );
}

export function BottomSheet({
  sheetHeight,
  startDrag,
  isRouteView,
  closeRouteView,
  startPoint,
  endPoint,
  routeLoading,
  routeError,
  routeCandidates,
  selectedRouteIndex,
  setSelectedRouteIndex,
  selectedPlace,
  resetPlaceAndRoute,
  setPointAsStart,
  setPointAsEnd,
  reviews,
  reviewSort,
  changeReviewSort,
  likeReview,
  reportReview,
  deleteReview,
  startEditReview,
  currentUserId,
  currentUser,
  onOpenMyPage,
  onLogout,
  displayedSafetyScore,
  safetyScoreLoading,
  reviewRating,
  setReviewRating,
  reviewText,
  setReviewText,
  reviewPhotos,
  selectReviewPhotos,
  removeReviewPhoto,
  editingReviewId,
  cancelEditReview,
  saveReview,
}) {
  const reviewPhotoData = reviewPhotos[0]?.photo_data || '';
  const reviewPhotoName = reviewPhotos[0]?.photo_name || '';
  return (
    <>
      {safetyScoreLoading && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.28)',
            padding: 20,
          }}
        >
          <div
            style={{
              width: 'min(280px, 100%)',
              borderRadius: 14,
              backgroundColor: '#ffffff',
              border: '1px solid #e5e7eb',
              boxShadow: '0 18px 45px rgba(15, 23, 42, 0.24)',
              padding: '18px 16px',
              color: '#111827',
              fontSize: 15,
              fontWeight: 900,
              lineHeight: 1.45,
              textAlign: 'center',
            }}
          >
            안전점수를 가져오는 중입니다.
          </div>
        </div>
      )}
      {false && (
      <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 45, display: 'flex', gap: 7, alignItems: 'center', padding: '7px 9px', borderRadius: 999, background: 'rgba(255,255,255,.95)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', fontSize: 12, fontWeight: 800 }}>
        <span>{currentUser?.nickname}</span>
        <button type="button" onClick={onOpenMyPage} style={{ border: 0, borderRadius: 999, padding: '5px 8px', fontWeight: 800, background: '#ecfdf5', color: '#047857' }}>마이페이지</button>
        <button type="button" onClick={onLogout} style={{ border: 0, borderRadius: 999, padding: '5px 8px', fontWeight: 800 }}>로그아웃</button>
      </div>
      )}

      <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 20,
        height: sheetHeight,
        backgroundColor: 'white',
        borderTopLeftRadius: 22,
        borderTopRightRadius: 22,
        boxShadow: '0 -10px 30px rgba(15, 23, 42, 0.2)',
        padding:
          '10px 16px calc(env(safe-area-inset-bottom, 0px) + 18px)',
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
      }}
    >
      <div
        onPointerDown={startDrag}
        style={{
          width: 46,
          height: 5,
          borderRadius: 999,
          backgroundColor: '#d1d5db',
          margin: '0 auto 12px',
          cursor: 'grab',
        }}
      />

      {isRouteView ? (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              marginBottom: 10,
            }}
          >
            <button
              onClick={closeRouteView}
              style={{
                border: 'none',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                borderRadius: 999,
                padding: '8px 11px',
                fontWeight: 800,
              }}
            >
              닫기
            </button>
          </div>

          <div style={{ marginBottom: 18 }}>
            <LocationBox startPoint={startPoint} endPoint={endPoint} />
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: 24,
              fontWeight: 900,
              color: '#111827',
              marginBottom: 16,
            }}
          >
            추천 경로
          </div>

          {routeLoading && <p style={noticeStyle}>안전 경로 분석 중...</p>}
          {routeError && (
            <p style={{ ...noticeStyle, color: '#ef4444' }}>{routeError}</p>
          )}

          {routeCandidates.map((route, idx) => (
            <button
              key={route.id}
              onClick={() => setSelectedRouteIndex(idx)}
              style={{
                width: '100%',
                textAlign: 'left',
                border:
                  selectedRouteIndex === idx
                    ? '2px solid #16a34a'
                    : '1px solid #e5e7eb',
                backgroundColor:
                  selectedRouteIndex === idx ? '#f8fafc' : 'white',
                borderRadius: 14,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontWeight: 900,
                  color: '#111827',
                  marginBottom: 8,
                }}
              >
                {idx === 0 ? 'Min Score 추천 · ' : ''}
                {route.name}
              </div>

              <div
                style={{
                  color: '#4b5563',
                  fontSize: 14,
                  marginBottom: 8,
                }}
              >
                {route.distance} · {route.duration}
              </div>

              <div
                style={{
                  color: getSafetyColor(Number(route.minSafetyScore || 0)),
                  fontWeight: 900,
                  fontSize: 14,
                }}
              >
                최저 {Number(route.minSafetyScore || 0).toFixed(2)} / 5 · 평균{' '}
                {Number(route.averageSafetyScore || 0).toFixed(2)} / 5
              </div>
              <div style={{ marginTop: 9, color: '#111827', fontSize: 13, fontWeight: 900 }}>
                {route.summary || '경로의 가장 취약한 구간을 우선 비교했습니다.'}
              </div>
              <div style={{ marginTop: 5, color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
                {route.reason || '최저 안전점수가 높은 순서로 추천하며, 동점이면 평균 점수와 소요 시간을 비교합니다.'}
              </div>
              {Number(route.coverageRatio || 0) < 0.5 && (
                <div style={{ marginTop: 7, color: '#b45309', fontSize: 11, fontWeight: 800 }}>
                  안전 데이터 포함률이 낮아 결과를 참고용으로 확인해 주세요.
                </div>
              )}
            </button>
          ))}
        </>
      ) : !selectedPlace ? (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              fontSize: 24,
              fontWeight: 900,
              fontFamily: '"Trebuchet MS", "Segoe UI", sans-serif',
              color: '#14532d',
              lineHeight: 1.1,
            }}
          >
            여기지!
          </div>
          <div
            style={{
              marginTop: 5,
              fontSize: 13,
              fontWeight: 700,
              color: '#6b7280',
            }}
          >
            Safety Map
          </div>

          <div
            style={{
              marginTop: 8,
              fontSize: 12,
              color: '#9ca3af',
              lineHeight: 1.4,
            }}
          >
            내 주변 장소를 눌러 안전 점수와 리뷰를 확인해보세요
          </div>
          <button
            type="button"
            onClick={onOpenMyPage}
            style={{
              display: 'none',
              width: 'min(340px, 94%)',
              height: 42,
              marginTop: 14,
              border: '2px solid #14532d',
              borderRadius: 12,
              backgroundColor: '#ffffff',
              color: '#14532d',
              fontSize: 0,
              fontWeight: 900,
              boxShadow: '0 6px 14px rgba(15, 23, 42, 0.1)',
            }}
          >
            마이페이지
            <span style={{ fontSize: 15 }}>마이페이지</span>
          </button>
        </div>
      ) : (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 21,
                  fontWeight: 900,
                  color: '#111827',
                  marginBottom: 5,
                }}
              >
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    backgroundColor: '#dcfce7',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flex: '0 0 auto',
                    overflow: 'hidden',
                  }}
                >
                  {selectedPlace.icon ? (
                    <>
                      <img
                        src={selectedPlace.icon}
                        alt=""
                        onError={handlePlaceIconError}
                        style={{ width: 18, height: 18 }}
                      />
                      <span style={{ display: 'none' }}>📍</span>
                    </>
                  ) : (
                    '📍'
                  )}
                </span>
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {selectedPlace.name}
                </span>
              </div>

              {selectedPlace.address && (
                <div style={{ fontSize: 13, color: '#6b7280' }}>
                  {selectedPlace.address}
                </div>
              )}
            </div>

            <button
              onClick={resetPlaceAndRoute}
              style={{
                border: 'none',
                backgroundColor: '#f3f4f6',
                color: '#374151',
                borderRadius: 999,
                padding: '8px 11px',
                fontWeight: 800,
                flex: '0 0 auto',
              }}
            >
              닫기
            </button>
          </div>

          <div style={placeActionRowStyle}>
            <button
              onClick={() => setPointAsStart(selectedPlace)}
              style={placeActionStyle('#dbeafe', '#1d4ed8')}
            >
              출발
            </button>

            <button
              onClick={() => setPointAsEnd(selectedPlace)}
              style={placeActionStyle('#fee2e2', '#dc2626')}
            >
              도착
            </button>
          </div>

          {startPoint && (
            <div style={{ marginBottom: 12 }}>
              <LocationBox startPoint={startPoint} endPoint={endPoint} />
            </div>
          )}

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
              marginBottom: 12,
            }}
          >
            <div style={{ ...scoreBoxStyle, textAlign: 'center' }}>
              <div style={scoreLabelStyle}>평균 평점</div>
              <div style={scoreValueStyle}>⭐ {getUserAverage(reviews)}</div>
            </div>

            <div style={{ ...scoreBoxStyle, textAlign: 'center' }}>
              <div style={scoreLabelStyle}>안전 점수</div>
              <div
                style={{
                  ...scoreValueStyle,
                  color: getSafetyColor(Number(displayedSafetyScore)),
                }}
              >
                {displayedSafetyScore} / 5
              </div>
            </div>
          </div>

          <div
            style={{
              borderTop: '1px solid #eeeeee',
              paddingTop: 12,
              fontWeight: 900,
              color: '#111827',
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            리뷰
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 14,
              marginBottom: 10,
            }}
          >
            {[
              { key: 'latest', label: '최신순' },
              { key: 'helpful', label: '추천순' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => changeReviewSort(item.key)}
                style={{
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: reviewSort === item.key ? '#111827' : '#9ca3af',
                  fontWeight: reviewSort === item.key ? 900 : 700,
                  fontSize: 15,
                  padding: '2px 0',
                  cursor: 'pointer',
                }}
              >
                · {item.label}
              </button>
            ))}
          </div>

          {reviews.length === 0 && (
            <div
              style={{
                color: '#6b7280',
                backgroundColor: '#f9fafb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 12,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              아직 리뷰가 없어요.
            </div>
          )}

          {reviews.map((review, idx) => (
            <div
              key={`${review.lat}-${review.lng}-${idx}`}
              style={{
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 12,
                marginBottom: 8,
                textAlign: 'center',
              }}
            >
              <div style={{ color: '#f59e0b', marginBottom: 5, textAlign: 'center' }}>
                {'★'.repeat(review.user_score)}
                {'☆'.repeat(5 - review.user_score)}
              </div>
              <div style={{ color: '#374151', fontSize: 14, textAlign: 'center' }}>
                {review.content}
              </div>
              {(review.ai_summary || review.ai_tags?.length > 0) && (
                <div
                  style={{
                    marginTop: 10,
                    padding: 11,
                    borderRadius: 12,
                    border: '1px solid #d1fae5',
                    backgroundColor: '#f0fdf4',
                    textAlign: 'left',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      color: '#166534',
                      fontSize: 12,
                      fontWeight: 900,
                    }}
                  >
                    <span>AI 안전 분석</span>
                    <span>
                      {Number(review.ai_score || 0).toFixed(1)} / 5 · 신뢰도{' '}
                      {Math.round(Number(review.ai_confidence || 0) * 100)}%
                    </span>
                  </div>
                  {review.ai_tags?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                      {review.ai_tags.map((tag) => (
                        <span
                          key={`${review.id}-${tag}`}
                          style={{
                            padding: '4px 7px',
                            borderRadius: 999,
                            backgroundColor: '#dcfce7',
                            color: '#166534',
                            fontSize: 11,
                            fontWeight: 800,
                          }}
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p style={{ margin: '8px 0 0', color: '#365b43', fontSize: 12, lineHeight: 1.55 }}>
                    {review.ai_summary}
                  </p>
                  {review.reliability_status === 'low' && (
                    <p style={{ margin: '7px 0 0', color: '#92400e', fontSize: 11, lineHeight: 1.45 }}>
                      분석 신뢰도가 낮아 구역 안전도 계산에 일부만 반영됐어요.
                    </p>
                  )}
                  {review.reliability_status === 'rejected' && (
                    <p style={{ margin: '7px 0 0', color: '#b91c1c', fontSize: 11, lineHeight: 1.45 }}>
                      안전 근거가 부족해 구역 안전도 계산에서는 제외됐어요.
                    </p>
                  )}
                  {review.analysis_source === 'rule_fallback' && (
                    <div style={{ marginTop: 6, color: '#6b7280', fontSize: 10 }}>
                      규칙 기반 대체 분석
                    </div>
                  )}
                </div>
              )}
              {review.is_admin_focus && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 24,
                    marginTop: 8,
                    padding: '0 9px',
                    borderRadius: 999,
                    backgroundColor: '#fee2e2',
                    color: '#b91c1c',
                    fontWeight: 900,
                    fontSize: 0,
                  }}
                >
                  <span style={{ fontSize: 11 }}>
                    {review.report_status === 'under_review'
                      ? '\uc2e0\uace0 \uac80\ud1a0\uc911'
                      : '\uc2e0\uace0 \uc811\uc218'}
                  </span>
                  <span style={{ display: 'none' }}>
                    {review.report_status === 'under_review' ? '신고 검토중' : '신고 접수'}
                  </span>
                  신고 리뷰
                </div>
              )}
              {false && review.photo_data && (
                <img
                  src={review.photo_data}
                  alt={review.photo_name || '리뷰 사진'}
                  style={{
                    width: '100%',
                    maxHeight: 180,
                    objectFit: 'cover',
                    borderRadius: 10,
                    marginTop: 10,
                    border: '1px solid #e5e7eb',
                  }}
                />
              )}
              {(review.photos?.length > 0 || review.photo_data) && (
                <div
                  style={{
                    display: 'flex',
                    gap: 10,
                    overflowX: 'auto',
                    marginTop: 10,
                    paddingBottom: 4,
                    scrollSnapType: 'x mandatory',
                    WebkitOverflowScrolling: 'touch',
                  }}
                >
                  {(review.photos?.length
                    ? review.photos
                    : [{ photo_data: review.photo_data, photo_name: review.photo_name }]
                  ).map((photo, photoIndex) => (
                    <img
                      key={`${review.id}-photo-${photoIndex}`}
                      src={photo.photo_data}
                      alt={photo.photo_name || '리뷰 사진'}
                      style={{
                        width: 132,
                        height: 132,
                        objectFit: 'cover',
                        borderRadius: 12,
                        border: '1px solid #e5e7eb',
                        flex: '0 0 auto',
                        scrollSnapAlign: 'start',
                        backgroundColor: '#f3f4f6',
                      }}
                    />
                  ))}
                </div>
              )}
              {['reported', 'under_review'].includes(review.report_status) && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 24,
                    marginTop: 8,
                    padding: '0 9px',
                    borderRadius: 999,
                    backgroundColor:
                      review.report_status === 'under_review' ? '#fef3c7' : '#eff6ff',
                    color: review.report_status === 'under_review' ? '#92400e' : '#1d4ed8',
                    fontWeight: 900,
                    fontSize: 0,
                  }}
                >
                  <span style={{ fontSize: 11 }}>
                    {review.report_status === 'under_review' ? '신고 검토중' : '신고 접수'}
                  </span>
                  신고 검토중
                </div>
              )}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 6,
                  marginTop: 8,
                }}
              >
                <button
                  onClick={() => likeReview(review.id)}
                  style={{
                    minWidth: 82,
                    height: 30,
                    border: '1px solid #d1fae5',
                    borderRadius: 999,
                    backgroundColor: '#ecfdf5',
                    color: '#047857',
                    fontWeight: 900,
                    fontSize: 0,
                  }}
                >
                  <span style={{ fontSize: 12 }}>👍 좋아요 {review.like_count || 0}</span>
                  좋아요 {review.like_count || 0}
                </button>
                <button
                  onClick={() => reportReview(review.id)}
                  style={{
                    minWidth: 58,
                    height: 30,
                    border: '1px solid #fee2e2',
                    borderRadius: 999,
                    backgroundColor: '#fff7ed',
                    color: '#b91c1c',
                    fontWeight: 900,
                    fontSize: 0,
                  }}
                >
                  <span style={{ fontSize: 12 }}>🚩 신고</span>
                  신고
                </button>
                {Number(review.user_id) === Number(currentUserId) && (
                  <>
                    <button
                      onClick={() => startEditReview(review)}
                      style={{
                        minWidth: 58,
                        height: 30,
                        border: '1px solid #bfdbfe',
                        borderRadius: 999,
                        backgroundColor: '#eff6ff',
                        color: '#1d4ed8',
                        fontWeight: 900,
                        fontSize: 0,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>✏️ 수정</span>
                      수정
                    </button>
                    <button
                      onClick={() => deleteReview(review.id)}
                      style={{
                        minWidth: 58,
                        height: 30,
                        border: '1px solid #e5e7eb',
                        borderRadius: 999,
                        backgroundColor: '#f9fafb',
                        color: '#374151',
                        fontWeight: 900,
                        fontSize: 0,
                      }}
                    >
                      <span style={{ fontSize: 12 }}>🗑️ 삭제</span>
                      삭제
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}

          <div
            style={{
              borderTop: '1px solid #e5e7eb',
              paddingTop: 12,
              marginTop: 12,
            }}
          >
            {editingReviewId && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  marginBottom: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  backgroundColor: '#eff6ff',
                  color: '#1d4ed8',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                <span>리뷰 수정 중</span>
                <button
                  onClick={cancelEditReview}
                  style={{
                    border: 'none',
                    borderRadius: 999,
                    backgroundColor: '#dbeafe',
                    color: '#1d4ed8',
                    fontWeight: 900,
                    padding: '5px 9px',
                  }}
                >
                  취소
                </button>
              </div>
            )}
            <div style={{ marginBottom: 8, textAlign: 'center' }}>
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setReviewRating(star)}
                  style={{
                    cursor: 'pointer',
                    color: star <= reviewRating ? '#f59e0b' : '#d1d5db',
                    fontSize: 24,
                    marginRight: 2,
                  }}
                >
                  ★
                </span>
              ))}
            </div>

            <textarea
              value={reviewText}
              onChange={(e) => setReviewText(e.target.value)}
              placeholder="리뷰 입력"
              style={{
                width: '100%',
                minHeight: 78,
                boxSizing: 'border-box',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                padding: 12,
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                textAlign: 'center',
              }}
            />

            {reviewPhotoData && (
              <div
                style={{
                  marginTop: 8,
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  overflow: 'hidden',
                  backgroundColor: '#f9fafb',
                }}
              >
                <img
                  src={reviewPhotoData}
                  alt={reviewPhotoName || '첨부 사진'}
                  style={{
                    width: '100%',
                    maxHeight: 170,
                    objectFit: 'cover',
                    display: 'block',
                  }}
                />
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                    padding: 9,
                    fontSize: 12,
                    color: '#4b5563',
                    fontWeight: 800,
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {reviewPhotoName || '첨부 사진'}
                  </span>
                  <button
                    onClick={() => removeReviewPhoto(0)}
                    style={{
                      border: 'none',
                      borderRadius: 999,
                      backgroundColor: '#fee2e2',
                      color: '#b91c1c',
                      fontWeight: 900,
                      padding: '6px 9px',
                      flex: '0 0 auto',
                    }}
                  >
                    삭제
                  </button>
                </div>
              </div>
            )}

            {reviewPhotos.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  marginTop: 8,
                  paddingBottom: 2,
                }}
              >
                {reviewPhotos.slice(1).map((photo, index) => (
                  <div
                    key={`selected-photo-${index}`}
                    style={{
                      position: 'relative',
                      width: 96,
                      height: 76,
                      flex: '0 0 auto',
                    }}
                  >
                    <img
                      src={photo.photo_data}
                      alt={photo.photo_name || '첨부 사진'}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        borderRadius: 10,
                        border: '1px solid #e5e7eb',
                      }}
                    />
                    <button
                      onClick={() => removeReviewPhoto(index + 1)}
                      style={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 24,
                        height: 24,
                        border: 'none',
                        borderRadius: 999,
                        backgroundColor: 'rgba(185, 28, 28, 0.92)',
                        color: '#ffffff',
                        fontWeight: 900,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: 38,
                marginTop: 8,
                border: '1px dashed #9ca3af',
                borderRadius: 12,
                backgroundColor: '#f9fafb',
                color: '#374151',
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              사진 첨부
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  selectReviewPhotos(e.target.files);
                  e.target.value = '';
                }}
                style={{ display: 'none' }}
              />
            </label>

            <button
              onClick={saveReview}
              style={{
                width: '100%',
                height: 44,
                marginTop: 8,
                border: 'none',
                borderRadius: 12,
                backgroundColor: '#14532d',
                color: 'white',
                fontWeight: 900,
              }}
            >
              {editingReviewId ? '리뷰 수정 완료' : '리뷰 저장'}
            </button>
          </div>
        </>
      )}
      </div>
    </>
  );
}
