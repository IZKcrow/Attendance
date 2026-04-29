const AUTH_TOKEN_KEY = 'authToken'

export function getStoredAuthToken() {
  try {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY)
    localStorage.removeItem(AUTH_TOKEN_KEY)
    return token
  } catch (_) {
    return null
  }
}

export function setStoredAuthToken(token) {
  try {
    if (token) {
      sessionStorage.setItem(AUTH_TOKEN_KEY, token)
    } else {
      sessionStorage.removeItem(AUTH_TOKEN_KEY)
    }
  } catch (_) {
  }

  try {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  } catch (_) {
  }
}

export function clearStoredAuthToken() {
  setStoredAuthToken(null)
}
