# Upcoming

- Widened the main labeling and box views to fill the window: the frame now scales to fill the
  available viewport box (both width and height, upscaling the 960×540 source past native
  resolution when there is room) instead of a fixed 720px cap, the content shell is wider, and the
  frame re-fits on window resize. The skeleton node selector now stays fixed to the right of the
  frame and shrinks alongside it as the window narrows instead of wrapping beneath it
  ([#70](https://github.com/pozu-project/pozu/issues/70)).
- Replaced the GitHub icon on the sign-in button with a plain "Sign in" label; clicking it now
  opens a modal to pick a sign-in method (GitHub only for now) instead of navigating straight to
  the GitHub flow.
- Collapsed the auth nav control into a single button that morphs between "Sign in" and the
  signed-in user (click to sign out), replaced the Center for Open Neuroscience badge SVG with a
  PNG, widened the app content, and removed the last stale `sleap-io.js` references from the boot
  and error messaging.
- Added GitHub OAuth sign-in. A "Sign in with GitHub" control in the top nav starts the
  backend-driven OAuth flow; the returned JWT is captured from the URL fragment, stored, and
  replayed as an `Authorization: Bearer` header on annotation submissions. Signing in is now
  required to submit, and expired sessions (HTTP 401) prompt re-login.
