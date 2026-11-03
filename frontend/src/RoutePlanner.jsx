import React, { useRef, useState } from 'react';
import Icon from './Icon';

export default function RoutePlanner({ initialStart, initialEnd, onLookup, onUseLocation, onSubmit, onClose }) {
  const [start, setStart] = useState(initialStart || null);
  const [end, setEnd] = useState(initialEnd || null);
  const [field, setField] = useState(initialStart ? 'end' : 'start');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef(null);
  const version = useRef(0);
  React.useEffect(() => () => request.current?.abort(), []);
  const activate = next => {
    version.current++; request.current?.abort(); setBusy(false);
    setField(next); setQuery(''); setResults([]); setError('');
  };
  const search = async event => {
    event.preventDefault();
    if (!query.trim()) { setError('장소 이름이나 주소를 입력해 주세요.'); return; }
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const current = ++version.current;
    setBusy(true); setError(''); setResults([]);
    try {
      const places = await onLookup(query, controller.signal);
      if (current !== version.current) return;
      setResults(places);
      if (!places.length) setError('검색 결과가 없습니다. 다른 검색어를 입력해 주세요.');
    } catch (err) { if (err.name !== 'AbortError' && current === version.current) setError(err.message); }
    finally { if (current === version.current) setBusy(false); }
  };
  const select = point => {
    if (field === 'start') { setStart(point); activate('end'); }
    else { setEnd(point); version.current++; request.current?.abort(); setBusy(false); setResults([]); setQuery(''); setError(''); }
  };
  const useLocation = async () => {
    setBusy(true); setError('');
    try { const point = await onUseLocation(); if (point) select(point); else setError('위치를 확인하지 못했습니다. 출발지를 검색해 주세요.'); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };
  const ready = start && end && !(start.position.lat === end.position.lat && start.position.lng === end.position.lng);
  return <section className="route-planner" aria-label="길찾기">
    <header><button type="button" className="icon-button" onClick={onClose} aria-label="길찾기 닫기"><Icon name="back" /></button><h1>길찾기</h1><span>도보</span></header>
    <div className="planner-points">
      <div><button type="button" className={field === 'start' ? 'is-active' : ''} onClick={() => activate('start')}><i className="start-point" /><span>출발</span><strong>{start?.name || '출발지 선택'}</strong></button>
        <button type="button" className={field === 'end' ? 'is-active' : ''} onClick={() => activate('end')}><i className="end-point" /><span>도착</span><strong>{end?.name || '도착지 선택'}</strong></button></div>
      <button type="button" className="icon-button" aria-label="출발지와 도착지 바꾸기" disabled={busy} onClick={() => { setStart(end); setEnd(start); activate('start'); }}><Icon name="swap" /></button>
    </div>
    <form className="planner-search" onSubmit={search}><Icon name="search" /><input aria-label={field === 'start' ? '출발지 검색' : '도착지 검색'} placeholder={field === 'start' ? '출발지 이름 또는 주소' : '도착지 이름 또는 주소'} value={query} onChange={e => setQuery(e.target.value)} /><button type="submit" disabled={busy}>검색</button></form>
    <div className="planner-results">
      <button type="button" className="planner-current-location" onClick={useLocation} disabled={busy}><Icon name="location" />{field === 'start' ? '현재 위치에서 출발' : '현재 위치를 도착지로'}</button>
      {busy && <p role="status">확인 중입니다…</p>}
      {error && <p className="search-message error" role="alert">{error}</p>}
      {!query && !results.length && <p className="planner-hint">{start && end ? '출발지와 도착지를 확인한 뒤 경로를 비교하세요.' : `${field === 'start' ? '출발지' : '도착지'}를 검색해 목록에서 선택하세요.`}</p>}
      {results.map(point => <button type="button" className="place-result" key={`${point.id}-${point.position.lat}-${point.position.lng}`} onClick={() => select(point)}><Icon name="pin" /><span><strong>{point.name}</strong><small>{point.address}</small></span><span className="place-select-label">{field === 'start' ? '출발' : '도착'}</span></button>)}
    </div>
    <footer><p>후보 경로의 안전점수·시간·거리를 비교합니다.</p><button type="button" className="primary-button" disabled={!ready || busy} onClick={() => onSubmit(start, end)}>경로 비교하기</button></footer>
  </section>;
}
