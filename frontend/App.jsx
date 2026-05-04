import { useState } from 'react';
//구글맵 관련 컴포넌트
import {
  GoogleMap,
  useJsApiLoader,
  InfoWindow,
  Marker,
} from '@react-google-maps/api';
//지도 스타일
const mapStyle = {
  width: '100%',
  height: '400px',
};
//지도 시작 위치
const center = {
  lat: 48.856614,
  lng: 2.3522219,
};

const LIBRARIES = ['places']; //place api사용 설정

const API_URL = 'http://10.240.119.182:8000'; //백엔드 주소

//메인 컴포넌트
function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: 'AIzaSyB9lB1dUQypTZTLyw8cM5MgpS4jxbCoPUk',
    libraries: LIBRARIES,
  }); //구글맨 api확인

  //상태값
  const [marker, setMarker] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviews, setReviews] = useState([]);

  if (!isLoaded) return <div>Loading...</div>;

  // 사용자 평균계산
  const getUserAverage = (arr) => {
    if (arr.length === 0) return '0.00';
    const sum = arr.reduce((acc, cur) => acc + cur.user_score, 0);
    return (sum / arr.length).toFixed(2);
  };

  // AI 평균계산
  const getAiAverage = (arr) => {
    if (arr.length === 0) return '0.00';
    const sum = arr.reduce((acc, cur) => acc + (cur.ai_score || 0), 0);
    return (sum / arr.length).toFixed(2);
  };

  // 지도 클릭
  const handleClick = (e) => {
    if (e.placeId) {
      e.stop();

      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      ); //구글 장소서비스

      service.getDetails(
        {
          placeId: e.placeId,
          fields: ['name'],
        }, //장소 상세 정보 가져오기
        async (place, status) => {
          if (status === 'OK') {
            const newPosition = {
              lat: e.latLng.lat(),
              lng: e.latLng.lng(),
            };

            setMarker({
              id: Date.now(),
              name: place.name,
              position: newPosition,
            });
            //백엔드에서 리뷰 가져오기
            try {
              const res = await fetch(`${API_URL}/reviews`);
              if (!res.ok) throw new Error('서버 오류');

              const data = await res.json();
              //현재 장소 기준으로 필터
              const filtered = data.filter(
                (r) =>
                  Math.abs(r.lat - newPosition.lat) < 0.001 &&
                  Math.abs(r.lng - newPosition.lng) < 0.001,
              );
              setReviews(filtered); //화면에 표시할 리뷰 저장
            } catch (err) {
              console.error(err);
            }
          }
        },
      );
    }
  };

  // 별점, 리뷰 저장
  const saveReview = async () => {
    if (!marker) return;

    if (reviewRating === 0) {
      alert('별점 선택해라');
      return;
    }

    if (!reviewText.trim()) {
      alert('리뷰 입력해라');
      return;
    }
    //백엔드로 리뷰 전송
    try {
      const res = await fetch(`${API_URL}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: reviewText,
          lat: marker.position.lat,
          lng: marker.position.lng,
          user_score: reviewRating,
        }),
      });

      if (!res.ok) throw new Error('서버 오류');

      const result = await res.json(); //서버 응답

      setReviews((prev) => [...prev, result.data]); //백엔드 결과받기

      setReviewText('');
      setReviewRating(0);

      alert('저장됨!');
    } catch (err) {
      console.error(err);
      alert('저장 실패');
    }
  };
  //화면 ui
  return (
    <GoogleMap
      mapContainerStyle={mapStyle}
      center={center}
      zoom={13}
      options={{ clickableIcons: true }}
      onClick={handleClick} // 지도 클릭 이벤트 연결
    >
      {marker && (
        <>
          <Marker position={marker.position} />

          <InfoWindow
            position={marker.position}
            onCloseClick={() => {
              setMarker(null);
              setReviews([]);
              setReviewText('');
              setReviewRating(0);
            }}
          >
            <div style={{ width: '250px' }}>
              <h3>📍 {marker.name}</h3>
              <hr />
              // 장소이름
              {/* 사용자 평균 */}
              <div>⭐ 평균 평점: {getUserAverage(reviews)}</div>
              {/*AI 안전 점수 */}
              <div
                style={{
                  color:
                    getAiAverage(reviews) > 0.7
                      ? 'red'
                      : getAiAverage(reviews) > 0.4
                        ? 'orange'
                        : 'green',
                }}
              >
                ⚠️ 안전 점수: {getAiAverage(reviews)}
              </div>
              <hr />
              {/* 리뷰 목록 */}
              {reviews.length === 0 && <p>리뷰 없음</p>}
              {reviews.map((r, idx) => (
                <div key={`${r.lat}-${r.lng}-${idx}`}>
                  <span>
                    {'★'.repeat(r.user_score) + '☆'.repeat(5 - r.user_score)}
                  </span>
                  <p>{r.content}</p>
                </div>
              ))}
              <hr />
              {/* 별점 */}
              {[1, 2, 3, 4, 5].map((star) => (
                <span
                  key={star}
                  onClick={() => setReviewRating(star)}
                  style={{
                    cursor: 'pointer',
                    color: star <= reviewRating ? 'gold' : 'gray',
                    fontSize: '18px',
                  }}
                >
                  ★
                </span>
              ))}
              {/* 리뷰 */}
              <textarea
                value={reviewText}
                onChange={(e) => setReviewText(e.target.value)}
                placeholder="리뷰 입력"
                style={{ width: '100%', marginTop: '5px' }}
              />
              <button style={{ marginTop: '5px' }} onClick={saveReview}>
                저장
              </button>
            </div>
          </InfoWindow>
        </>
      )}
    </GoogleMap>
  );
}

export default App;
