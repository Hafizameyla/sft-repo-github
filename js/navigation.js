// All destinations are real HTML links, including when JavaScript is disabled.
(() => {
    const frame = document.querySelector('.visual-page, .monitoring-page, .route-page, .scan-page');
    if (!frame) return;
    const fit = () => { frame.style.zoom = String(Math.min(1, window.innerWidth / 390)); };
    fit();
    window.addEventListener('resize', fit);
})();
