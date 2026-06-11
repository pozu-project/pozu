export default {
    title: "Navigation/Top Nav",
};

export const Default = () => `
  <header class="top-nav">
    <div class="top-nav-inner">
      <a class="top-nav-brand" href="./index.html" aria-label="Pozu home">
        <img class="top-nav-logo" src="./pozu-logo.svg" alt="" aria-hidden="true" />
        <span>Pozu</span>
      </a>
      <nav class="top-nav-links" aria-label="View modes">
        <div class="nav-section nav-section--label">
          <span class="nav-section-title">Label</span>
          <div class="nav-section-tabs">
            <button class="top-nav-link" type="button">Focus</button>
            <button class="top-nav-link active" type="button">Full Skeleton</button>
            <a class="top-nav-link" href="./box.html">Box</a>
          </div>
        </div>
        <div class="nav-section nav-section--train">
          <span class="nav-section-title">Train</span>
          <div class="nav-section-tabs">
            <button class="top-nav-link" type="button" disabled>Models</button>
            <button class="top-nav-link" type="button" disabled>Inference</button>
          </div>
        </div>
        <div class="nav-section nav-section--curate">
          <span class="nav-section-title">Curate</span>
          <div class="nav-section-tabs">
            <button class="top-nav-link" type="button">Binary</button>
            <button class="top-nav-link" type="button">Track</button>
          </div>
        </div>
      </nav>
    </div>
  </header>
`;
