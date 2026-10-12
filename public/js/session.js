const KEY = 'campora.token';

export const getToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const setToken = (token) => {
  try { localStorage.setItem(KEY, token); } catch { /* storage unavailable */ }
};
export const clearSession = () => {
  try { localStorage.removeItem(KEY); } catch { /* storage unavailable */ }
};
