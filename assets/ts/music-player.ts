/**
 * Sidebar music player — initialized on pages with frontmatter `music:` config.
 * Uses native <audio> with first-interaction autoplay and jsmediatags cover extraction.
 *
 * Singleton pattern: a single Audio instance and shared state are reused across
 * multiple DOM instances (article version + sidebar version) so playback survives
 * responsive layout switches.
 *
 * Audio fetch is deferred until first user interaction to avoid blocking page render
 * with a large download on initial load.
 */

function fetchAndExtract(audioUrl: string): Promise<{ blobUrl: string; coverDataUrl: string }> {
    console.log('[music-cover] fetchAndExtract called, url:', audioUrl);
    return fetch(audioUrl)
        .then(r => { console.log('[music-cover] fetch response status:', r.status); return r.arrayBuffer(); })
        .then(buffer => {
            const blobUrl = URL.createObjectURL(new Blob([buffer]));
            console.log('[music-cover] audio blob created, size:', buffer.byteLength);
            return extractCoverFromBuffer(buffer).then(coverDataUrl => {
                console.log('[music-cover] extraction done, coverDataUrl length:', coverDataUrl.length);
                return { blobUrl, coverDataUrl };
            });
        })
        .catch((err) => { console.warn('[music-cover] fetchAndExtract error:', err); return { blobUrl: audioUrl, coverDataUrl: '' }; });
}

function waitForJsmediatags(timeout = 5000): Promise<boolean> {
    if (typeof (window as any).jsmediatags !== 'undefined') {
        console.log('[music-cover] jsmediatags already loaded');
        return Promise.resolve(true);
    }
    console.log('[music-cover] waiting for jsmediatags...');
    return new Promise((resolve) => {
        const deadline = Date.now() + timeout;
        const poll = () => {
            if (typeof (window as any).jsmediatags !== 'undefined') {
                console.log('[music-cover] jsmediatags loaded after', Date.now() - (deadline - timeout), 'ms');
                return resolve(true);
            }
            if (Date.now() > deadline) {
                console.warn('[music-cover] jsmediatags TIMEOUT after', timeout, 'ms');
                return resolve(false);
            }
            setTimeout(poll, 100);
        };
        poll();
    });
}

function extractCoverFromBuffer(buffer: ArrayBuffer): Promise<string> {
    console.log('[music-cover] extractCoverFromBuffer called, buffer size:', buffer.byteLength);
    return waitForJsmediatags().then((ready) => {
        if (!ready) { console.warn('[music-cover] jsmediatags not ready, skipping'); return ''; }
        console.log('[music-cover] jsmediatags ready, reading tags...');
        return new Promise<string>((resolve) => {
            (window as any).jsmediatags.read(new Blob([buffer]), {
                onSuccess: (tag: any) => {
                    console.log('[music-cover] jsmediatags onSuccess, tags:', Object.keys(tag.tags || {}));
                    const pic = tag.tags?.picture;
                    if (!pic) { console.log('[music-cover] no picture in tags'); resolve(''); return; }
                    console.log('[music-cover] picture found, format:', pic.format, 'data length:', pic.data.length);
                    let base64 = '';
                    for (let i = 0; i < pic.data.length; i++) {
                        base64 += String.fromCharCode(pic.data[i]);
                    }
                    const dataUrl = `data:${pic.format};base64,${btoa(base64)}`;
                    console.log('[music-cover] data URL created, length:', dataUrl.length);
                    resolve(dataUrl);
                },
                onError: (err: any) => { console.warn('[music-cover] jsmediatags onError:', err); resolve(''); }
            });
        });
    });
}

// --- Shared singleton state ---
let sharedAudio: HTMLAudioElement | null = null;
let sharedState = { hasStarted: false, coverDataUrl: '', blobUrl: '' };
let sharedFetchPromise: Promise<{ blobUrl: string; coverDataUrl: string }> | null = null;
let firstInteractionBound = false;

function getSharedAudio(): HTMLAudioElement {
    if (!sharedAudio) {
        sharedAudio = new Audio();
        sharedAudio.preload = 'auto';
    }
    return sharedAudio;
}

/**
 * Ensure audio is fetched and ready. Returns a promise that resolves
 * with the blob URL. Only fetches once (cached in sharedFetchPromise).
 * If fetch already completed, resolves immediately.
 */
function ensureAudioReady(audioUrl: string): Promise<string> {
    if (sharedState.blobUrl) { console.log('[music-cover] audio already fetched'); return Promise.resolve(sharedState.blobUrl); }

    if (!sharedFetchPromise) {
        sharedFetchPromise = fetchAndExtract(audioUrl);
    }
    return sharedFetchPromise.then(({ blobUrl, coverDataUrl }) => {
        sharedState.blobUrl = blobUrl;
        if (coverDataUrl && !sharedState.coverDataUrl) {
            sharedState.coverDataUrl = coverDataUrl;
        }
        console.log('[music-cover] ensureAudioReady done, coverDataUrl:', sharedState.coverDataUrl ? `set (${sharedState.coverDataUrl.length} chars)` : 'EMPTY');
        return blobUrl;
    });
}

function bindInstance(el: HTMLElement) {
    const audioUrl = el.dataset.audioUrl;
    const coverUrl = el.dataset.coverUrl;
    if (!audioUrl) return;

    const audio = getSharedAudio();

    const btnPlay = el.querySelector('.music-player-btn-play') as HTMLButtonElement;
    const btnLoop = el.querySelector('.music-player-btn-loop') as HTMLButtonElement;
    const iconPlay = el.querySelector('.icon-play') as SVGElement;
    const iconPause = el.querySelector('.icon-pause') as SVGElement;
    const iconLoading = el.querySelector('.icon-loading') as SVGElement;
    const coverEl = el.querySelector('.music-player-cover') as HTMLElement;
    const placeholder = el.querySelector('.music-player-cover-placeholder') as HTMLElement;
    const progressContainer = el.querySelector('.music-player-progress') as HTMLElement;
    const progressBar = el.querySelector('.music-player-progress-bar') as HTMLElement;

    let isLoading = false;

    function setLoading(loading: boolean) {
        isLoading = loading;
        if (loading) {
            iconPlay.style.display = 'none';
            iconPause.style.display = 'none';
            iconLoading.style.display = '';
            el.classList.add('music-player-loading');
        } else {
            iconLoading.style.display = 'none';
            el.classList.remove('music-player-loading');
            updateUI();
        }
    }

    function updateUI() {
        if (isLoading) return;
        if (audio.paused) {
            iconPlay.style.display = '';
            iconPause.style.display = 'none';
        } else {
            iconPlay.style.display = 'none';
            iconPause.style.display = '';
        }
        if (sharedState.hasStarted) {
            el.classList.add('music-player-active');
        }
    }

    function syncProgress() {
        if (audio.duration) {
            progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        }
    }

    function syncLoop() {
        btnLoop.classList.toggle('active', audio.loop);
    }

    function startPlayback() {
        if (sharedState.hasStarted) return;
        sharedState.hasStarted = true;

        // If audio is already fetched, play immediately; otherwise fetch first
        if (sharedState.blobUrl) {
            audio.src = sharedState.blobUrl;
            audio.play().then(() => updateUI()).catch(() => {});
        } else {
            setLoading(true);
            ensureAudioReady(audioUrl).then(blobUrl => {
                setLoading(false);
                audio.src = blobUrl;
                audio.play().then(() => updateUI()).catch(() => {});
                // Apply cover to ALL instances (article + sidebar)
                if (sharedState.coverDataUrl) {
                    document.querySelectorAll('.sidebar-music-player').forEach(instance => {
                        (instance as any).__applyCover?.(sharedState.coverDataUrl);
                    });
                }
            });
        }
    }

    // Sync UI immediately for already-playing state
    updateUI();
    syncProgress();
    syncLoop();

    // First-interaction autoplay (only bind once globally)
    if (!firstInteractionBound) {
        firstInteractionBound = true;
        const onFirstInteraction = () => {
            document.removeEventListener('click', onFirstInteraction);
            document.removeEventListener('scroll', onFirstInteraction);
            document.removeEventListener('keydown', onFirstInteraction);
            startPlayback();
        };
        document.addEventListener('click', onFirstInteraction, { once: true } as EventListenerOptions);
        document.addEventListener('scroll', onFirstInteraction, { once: true, passive: true } as EventListenerOptions);
        document.addEventListener('keydown', onFirstInteraction, { once: true } as EventListenerOptions);
    }

    // Play/pause button
    btnPlay.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!sharedState.hasStarted) {
            startPlayback();
            return;
        }
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    });

    // Loop button
    btnLoop.addEventListener('click', (e) => {
        e.stopPropagation();
        audio.loop = !audio.loop;
        syncLoop();
    });

    // Audio events — sync this instance's UI
    audio.addEventListener('play', updateUI);
    audio.addEventListener('pause', updateUI);
    audio.addEventListener('timeupdate', syncProgress);
    audio.addEventListener('ended', () => {
        progressBar.style.width = '0%';
        updateUI();
    });

    // Click to seek
    progressContainer.addEventListener('click', (e) => {
        if (!audio.duration) return;
        const rect = progressContainer.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        audio.currentTime = ratio * audio.duration;
        progressBar.style.width = `${ratio * 100}%`;
    });

    // Cover extraction — apply static cover immediately; ID3 cover applied after fetch
    let coverApplied = false;
    function applyCover(dataUrl: string) {
        console.log('[music-cover] applyCover called, coverApplied:', coverApplied, 'dataUrl:', dataUrl ? `${dataUrl.substring(0, 40)}... (${dataUrl.length} chars)` : 'EMPTY');
        if (!dataUrl || coverApplied) return;
        coverApplied = true;
        const img = document.createElement('img');
        img.alt = 'Album cover';
        img.onload = () => {
            console.log('[music-cover] cover image loaded, prepending to DOM');
            coverEl.prepend(img);
            requestAnimationFrame(() => img.classList.add('loaded'));
            placeholder.style.display = 'none';
        };
        img.onerror = (e) => { console.warn('[music-cover] cover image FAILED to load:', e); };
        img.src = dataUrl;
    }

    if (coverUrl) {
        console.log('[music-cover] bindInstance: applying static coverUrl');
        applyCover(coverUrl);
    } else if (sharedState.coverDataUrl) {
        console.log('[music-cover] bindInstance: applying sharedState.coverDataUrl');
        applyCover(sharedState.coverDataUrl);
    } else {
        console.log('[music-cover] bindInstance: no cover available yet, will extract on playback');
    }
    // Register applyCover on element for cross-instance cover broadcast
    (el as any).__applyCover = applyCover;
}

function initMusicPlayer() {
    document.querySelectorAll('.sidebar-music-player').forEach(el => {
        bindInstance(el as HTMLElement);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicPlayer);
} else {
    initMusicPlayer();
}
