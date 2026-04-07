import { supabase } from '../Modules/SupabaseClient';
import { secureLogout } from './authSecurity';

/**
 * API Client Utility for calling Supabase Edge Functions.
 * Handles: JWT injection, global error handling (401/429), and response parsing.
 */

const API_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

/**
 * Core request handler
 */
async function request(endpoint, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  // 10 second timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const headers = {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
    signal: controller.signal,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
    clearTimeout(timeoutId);
    return await handleResponse(response);
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. Please try again.');
    }
    throw err;
  }
}

/**
 * Handle API responses and differentiate errors
 */
async function handleResponse(response) {
  if (response.ok) {
    return await response.json();
  }

  // Handle specific status codes
  if (response.status === 401) {
    console.error('[API 401]: Session expired or invalid token');
    await secureLogout();
    throw new Error('Your session has expired. Please log in again.');
  }

  if (response.status === 403) {
    throw new Error('Access denied. You do not have permission for this action.');
  }

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || '60';
    throw new Error(`Rate limit exceeded. Please wait ${retryAfter} seconds before trying again.`);
  }

  // Parse error message from body if available
  try {
    const errorData = await response.json();
    throw new Error(errorData.error || errorData.message || 'An unexpected error occurred');
  } catch (parseError) {
    // If not JSON, throw generic status text
    if (parseError.message.includes('unexpected error')) throw parseError;
    throw new Error(`Server error: ${response.statusText || response.status}`);
  }
}

/**
 * API Client Methods
 */
export const apiClient = {
  get: (endpoint, options) => request(endpoint, { ...options, method: 'GET' }),
  post: (endpoint, body, options) => request(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body, options) => request(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: (endpoint, options) => request(endpoint, { ...options, method: 'DELETE' }),
};
