const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3000'
).replace(/\/+$/, '');

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(
      error.name === 'TimeoutError'
        ? 'The request timed out. Check your connection and try again.'
        : 'Cannot reach the API. Check that the backend is running and VITE_API_URL is correct.',
    );
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(
      body.error || `Request failed (${response.status}). Please try again.`,
    );
  }
  return response.status === 204 ? null : response.json();
}

export const api = {
  list: (signal) => request('/api/tasks', { signal }),
  create: (task) =>
    request('/api/tasks', { method: 'POST', body: JSON.stringify(task) }),
  update: (id, task) =>
    request(`/api/tasks/${id}`, { method: 'PUT', body: JSON.stringify(task) }),
  setStatus: (id, status) =>
    request(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  remove: (id) => request(`/api/tasks/${id}`, { method: 'DELETE' }),
};
