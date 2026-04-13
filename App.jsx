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

  const [marker, setMarker] = useState(null);
  const [reviewText, setReviewText] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviews, setReviews] = useState([]);

  if (!isLoaded) return <div>Loading...</div>;

  // 🔥 장소 클릭
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

            setReviewText('');
            setReviewRating(0);

            // 🔥 서버에서 리뷰 불러오기
            try {
              const res = await fetch('http://127.0.0.1:8000/reviews');
              const data = await res.json();

              // 👉 현재 위치랑 가까운 리뷰만 필터
              const filtered = data.filter(
                (r) =>
                  Math.abs(r.lat - newPosition.lat) < 0.001 &&
                  Math.abs(r.lng - newPosition.lng) < 0.001,
              );

              setReviews(filtered);
            } catch (err) {
              console.error(err);
            }
          }
        },
      );
    }
  };

  // 🔥 리뷰 저장 (POST)
  const saveReview = async () => {
    if (!marker) return;

    try {
      await fetch('http://127.0.0.1:8000/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: reviewText,
          lat: marker.position.lat,
          lng: marker.position.lng,
          user_score: reviewRating,
        }),
      });

      // 🔥 저장 후 다시 불러오기
      const res = await fetch('http://127.0.0.1:8000/reviews');
      const data = await res.json();

      const filtered = data.filter(
        (r) =>
          Math.abs(r.lat - marker.position.lat) < 0.001 &&
          Math.abs(r.lng - marker.position.lng) < 0.001,
      );

      setReviews(filtered);
      setReviewText('');
      setReviewRating(0);

      alert('저장됨!');
    } catch (err) {
      console.error(err);
    }
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
              <h3>📍 {marker.name}</h3>

              <hr />

              {/* 🔹 기존 리뷰 */}
              {reviews.length > 0 &&
                reviews.map((r, idx) => (
                  <div key={idx} style={{ marginBottom: '5px' }}>
                    <span>{'★'.repeat(r.score) + '☆'.repeat(5 - r.score)}</span>
                    <p style={{ margin: '2px 0' }}>{r.content}</p>
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
