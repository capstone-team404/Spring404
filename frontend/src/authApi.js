import { API_URL } from './mapHelpers';
const TOKEN_KEY = 'hereji_access_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const saveToken = (token) => localStorage.setItem(TOKEN_KEY, token);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);
export async function authFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) { clearToken(); window.dispatchEvent(new Event('hereji:session-expired')); }
  return response;
}
async function request(path, options = {}) {
  const response = await authFetch(`${API_URL}${path}`, options);
  let data = null; try { data = await response.json(); } catch { data = null; }
  if (!response.ok) {
    const validationMessage = Array.isArray(data?.detail)
      ? data.detail.map((item) => item?.msg?.replace(/^Value error,\s*/, '')).filter(Boolean)[0]
      : null;
    throw new Error(validationMessage || data?.detail?.message || data?.detail || '요청을 처리하지 못했습니다.');
  }
  return data;
}
const json = (method, payload) => ({ method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
export const signup = payload => request('/auth/signup', json('POST', payload));
export const login = payload => request('/auth/login', json('POST', payload));
export const getMe = () => request('/auth/me');
export const verifyGender = test_code => request('/auth/verify-gender', json('POST', {test_code}));
export const updateProfile = payload => request('/me/profile', json('PATCH', payload));
export const getMyActivity = () => request('/me/activity');
export const getMyReviews = () => request('/me/reviews');
export const getMyLikedReviews = () => request('/me/liked-reviews');
export const getMyReports = () => request('/me/reports');
export const deleteAccount = () => request('/me/account', json('DELETE', { confirm: true }));
export const getAdminReports = status => request(`/admin/reports?status=${encodeURIComponent(status || 'pending')}`);
export const updateAdminReportStatus = (reviewId, reporterUserId, status) =>
  request(`/admin/reports/${reviewId}/${reporterUserId}`, json('PATCH', { status }));
export const hideAdminReview = (reviewId, reason) =>
  request(`/admin/reviews/${reviewId}/hide`, json('PATCH', { reason }));
export const deleteAdminReview = (reviewId, reason) =>
  request(`/admin/reviews/${reviewId}`, json('DELETE', { reason }));
export const restoreAdminReview = reviewId =>
  request(`/admin/reviews/${reviewId}/restore`, { method: 'PATCH' });
export async function logout() { try { await request('/auth/logout', {method:'POST'}); } finally { clearToken(); } }
