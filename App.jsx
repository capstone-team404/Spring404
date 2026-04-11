import { useState } from 'react';
import {
  GoogleMap,
  useJsApiLoader,
  InfoWindow,
  Marker,
} from '@react-google-maps/api';

const mapStyle = {
  width: '100%',
  height: '400px',
};

const center = {
  lat: 48.856614, // 파리
  lng: 2.3522219,
};

function App() {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: 'AIzaSyB9lB1dUQypTZTLyw8cM5MgpS4jxbCoPUk',
    libraries: ['places'],
  });

  // 🔥 마커 하나만 관리
  const [marker, setMarker] = useState(null);

  // 🔹 리뷰 상태
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);

  // 🔹 리뷰 리스트 (현재 마커용)
  const [reviews, setReviews] = useState([]);

  if (!isLoaded) return <div>Loading...</div>;

  const handleClick = (e) => {
    if (e.placeId) {
      e.stop();

      const service = new window.google.maps.places.PlacesService(
        document.createElement('div'),
      );

      service.getDetails(
        {
          placeId: e.placeId,
          fields: ['name'],
        },
        (place, status) => {
          if (status === 'OK') {
            // 🔥 이전 마커 날리고 새 마커만 생성
            setMarker({
              id: Date.now(),
              name: place.name,
              position: {
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
              },
            });

            // 🔥 새 장소니까 리뷰 초기화
            setReviews([]);
            setReviewText('');
            setReviewRating(0);
          }
        },
      );
    }
  };

  const saveReview = () => {
    setReviews((prev) => [...prev, { text: reviewText, rating: reviewRating }]);
    setReviewText('');
    setReviewRating(0);
  };

  return (
    <GoogleMap
      mapContainerStyle={mapStyle}
      center={center}
      zoom={13}
      options={{ clickableIcons: true }}
      onClick={handleClick}
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
              {/* 📍 장소 이름 */}
              <h3>📍 {marker.name}</h3>

              <hr />

              {/* 🔹 기존 리뷰 */}
              {reviews.length > 0 &&
                reviews.map((r, idx) => (
                  <div key={idx} style={{ marginBottom: '5px' }}>
                    <span>
                      {'★'.repeat(r.rating) + '☆'.repeat(5 - r.rating)}
                    </span>
                    <p style={{ margin: '2px 0' }}>{r.text}</p>
                  </div>
                ))}

              <hr />

              {/* 🔹 리뷰 입력 */}
              <div>
                <div>
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
                </div>

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
            </div>
          </InfoWindow>
        </>
      )}
    </GoogleMap>
  );
}

export default App;
