# Upcoming

- Added GitHub OAuth sign-in. A "Sign in with GitHub" control in the top nav starts the
  backend-driven OAuth flow; the returned JWT is captured from the URL fragment, stored, and
  replayed as an `Authorization: Bearer` header on annotation submissions. Signing in is now
  required to submit, and expired sessions (HTTP 401) prompt re-login.
