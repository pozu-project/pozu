# Pose Zoo

Inspired by Galaxy Zoo, but for pose estimation.

This project is a sibling of [`pozoo`](https://github.com/CodyCBakerPhD/pozoo):
random frames are pulled from a video hosted on EMBER and presented for
keypoint labeling. The difference here is that the labeling page is built
on top of the new v2 [`@talmolab/sleap-io.js`](https://github.com/talmolab/sleap-io.js)
library and its browser-side data model (`Skeleton`, `Instance`, `Point`,
`LabeledFrame`, `Labels`) plus the `loadVideo` / `Mp4BoxVideoBackend`
video reader. See <https://iojs.sleap.ai/latest/#sleap-iojs> for the
upstream docs.

## Layout

- `index.html` — static, dependency-free labeling page. Loads
  `@talmolab/sleap-io.js` from `esm.sh` via an importmap, decodes a
  random frame, lets the user click-to-place skeleton nodes, and POSTs
  the result to the configured backend.
- `backend.py` — Flask + flask-restx annotation receiver. Validates the
  payload, writes it as a JSON file inside a sparse checkout of a
  target GitHub repository, and commits/pushes.
- `.github/workflows/preview.yml` — deploys a per-PR static preview of
  `index.html` to the `gh-pages` branch.

## Run locally

```bash
# Serve the static page (no build step required)
python -m http.server 8000
# → open http://localhost:8000/

# In another terminal, run the receiver
pip install -r requirements.txt
python backend.py
# → http://localhost:5000/docs/
```

Then point the labeling page's "Server endpoint" at
`http://localhost:5000/api/annotations` and provide the API secret you
configured via the `API_SECRET` environment variable.

