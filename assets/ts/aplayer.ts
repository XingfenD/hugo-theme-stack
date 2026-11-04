/**
 * APlayer bootstrap for the shortcodes/aplayer.html containers.
 *
 * Replaces the shortcode's former inline <script>/<style>: markup ships
 * data-audio-* attributes, the shared <style> moved into custom.scss, and this
 * module creates the APlayer instance once the container scrolls into view
 * (IntersectionObserver, same lazy behavior as the old inline code).
 *
 * APlayer + jsmediatags are classic <script>s from the CDN injected by the
 * footer partial, so they are expected on window after page load.
 */

import { fetchAndExtract } from './media';

interface PlayerOptions {
    url: string;
    cover: string;
    name: string;
    artist: string;
    theme: string;
    lrc: string;
    autoplay: boolean;
}

/**
 * Resolve once APlayer (a non-deferred CDN script) is available.
 * If it is still missing after the window load event, the promise stays
 * pending — same livelock as the previous inline implementation.
 */
function whenAPlayerAvailable(): Promise<void> {
    if (typeof APlayer !== 'undefined') {
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        window.addEventListener('load', () => resolve());
    });
}

function createPlayer(el: HTMLElement, opts: PlayerOptions): void {
    const loadingEl = el.querySelector('.aplayer-loading');
    if (loadingEl) loadingEl.remove();
    new APlayer({
        container: el,
        theme: opts.theme,
        audio: [{
            name: opts.name,
            artist: opts.artist,
            url: opts.url,
            cover: opts.cover || '',
            lrc: opts.lrc
        }],
        autoplay: opts.autoplay,
        lrcType: opts.lrc ? 1 : 0
    });
}

async function initPlayer(el: HTMLElement): Promise<void> {
    const opts: PlayerOptions = {
        url: el.dataset.audioUrl || '',
        cover: el.dataset.audioCover || '',
        name: el.dataset.audioName || '',
        artist: el.dataset.audioArtist || '',
        theme: el.dataset.audioTheme || '#2980b9',
        lrc: el.dataset.audioLrc || '',
        autoplay: el.dataset.audioAutoplay === 'true'
    };

    await whenAPlayerAvailable();

    if (opts.cover) {
        createPlayer(el, opts);
        return;
    }

    // No explicit cover — fetch the audio blob and extract the ID3 embedded cover
    const { blobUrl, coverDataUrl } = await fetchAndExtract(opts.url);
    createPlayer(el, { ...opts, url: blobUrl, cover: coverDataUrl });
}

function setupAPlayer(): void {
    const containers = document.querySelectorAll('.aplayer-container') as NodeListOf<HTMLElement>;
    if (!containers.length) return;

    containers.forEach(el => {
        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    observer.disconnect();
                    initPlayer(el);
                }
            }, { rootMargin: '200px' });
            observer.observe(el);
        } else {
            // No IntersectionObserver support: the bundle runs long after
            // DOMContentLoaded, so initialize immediately instead of relying
            // on an event that has already fired.
            initPlayer(el);
        }
    });
}

export { setupAPlayer };

declare global {
    // APlayer is injected as a classic CDN <script> by the footer partial
    var APlayer: any;
}
