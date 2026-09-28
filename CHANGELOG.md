# Upcoming

- Added a React admin SPA as a new self-contained `admin.html` entry point, leaving the vanilla
  labeler pages untouched. It ships permission primitives meant to be reused by every future admin
  page — a `usePermissions()` context fed by the authoritative `GET /api/v1/admin/me` (JWT
  role/permission claims, exposed via a new `getClaims()` helper in `auth.ts`, are treated as stale
  hints only), a `<RequirePermission>` gate, and a sidebar that hides pages the user cannot open —
  plus the first two pages: a sortable, paginated Users table with a role-assignment editor (gated
  by `users:read` / `roles:write`) and a read-only Roles listing (gated by `roles:read`)
  ([#87](https://github.com/pozu-project/pozu/pull/87)).
- Reserved the fit-to-window frame area before the video loads so the page no longer flickers on
  arrival: the loading placeholder (and sidebar) are now sized to the same box the first frame will
  occupy, derived from the default 960×540 dimensions, instead of a small fixed 720×360 placeholder
  that jumped to full size once the frame painted. Smaller or odd-shaped videos are padded into this
  allocation. Applies to both the labeling and box views
  ([#72](https://github.com/pozu-project/pozu/issues/72)).
- Fixed a bug where points placed on the full skeleton (label) view lingered on the frame after
  switching to focus mode; the canvas now resets whenever the labeling context flips between the
  label and focus workflows ([#69](https://github.com/pozu-project/pozu/issues/69)).
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
