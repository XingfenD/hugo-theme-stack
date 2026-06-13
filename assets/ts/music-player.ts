/**
 * Sidebar music player — initialized on pages with frontmatter `music:` config.
 * Uses native <audio> with first-interaction autoplay and jsmediatags cover extraction.
 */

function extractCover(audioUrl: string): Promise<string> {
    return new Promise((resolve) => {
        if (typeof (window as any).jsmediatags === 'undefined') {
            resolve('');
            return;
        }
        fetch(audioUrl)
            .then(r => r.arrayBuffer())
            .then(buffer => {
                (window as any).jsmediatags.read(new Blob([buffer]), {
                    onSuccess: (tag: any) => {
                        const pic = tag.tags?.picture;
                        if (!pic) { resolve(''); return; }
                        let base64 = '';
                        for (let i = 0; i < pic.data.length; i++) {
                            base64 += String.fromCharCode(pic.data[i]);
                        }
                        resolve(`data:${pic.format};base64,${btoa(base64)}`);
                    },
                    onError: () => resolve('')
                });
            })
            .catch(() => resolve(''));
    });
}

function initMusicPlayer() {
    const el = document.querySelector('.sidebar-music-player') as HTMLElement;
    if (!el) return;

    const audioUrl = el.dataset.audioUrl;
    const coverUrl = el.dataset.coverUrl;
    if (!audioUrl) return;

    const audio = new Audio();
    audio.preload = 'auto';

    const btn = el.querySelector('.music-player-btn') as HTMLButtonElement;
    const iconPlay = el.querySelector('.icon-play') as SVGElement;
    const iconPause = el.querySelector('.icon-pause') as SVGElement;
    const coverEl = el.querySelector('.music-player-cover') as HTMLElement;
    const placeholder = el.querySelector('.music-player-cover-placeholder') as HTMLElement;
    const progressContainer = el.querySelector('.music-player-progress') as HTMLElement;
    const progressBar = el.querySelector('.music-player-progress-bar') as HTMLElement;

    let hasStarted = false;

    function updateUI() {
        if (audio.paused) {
            iconPlay.style.display = '';
            iconPause.style.display = 'none';
        } else {
            iconPlay.style.display = 'none';
            iconPause.style.display = '';
        }
    }

    function startPlayback() {
        if (hasStarted) return;
        hasStarted = true;
        audio.src = audioUrl;
        audio.play().then(() => {
            el.classList.add('music-player-active');
            updateUI();
        }).catch(() => {});
    }

    // First-interaction autoplay
    function onFirstInteraction() {
        document.removeEventListener('click', onFirstInteraction);
        document.removeEventListener('scroll', onFirstInteraction);
        document.removeEventListener('keydown', onFirstInteraction);
        startPlayback();
    }
    document.addEventListener('click', onFirstInteraction, { once: true } as EventListenerOptions);
    document.addEventListener('scroll', onFirstInteraction, { once: true, passive: true } as EventListenerOptions);
    document.addEventListener('keydown', onFirstInteraction, { once: true } as EventListenerOptions);

    // Play/pause button
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!hasStarted) {
            startPlayback();
            return;
        }
        if (audio.paused) {
            audio.play();
        } else {
            audio.pause();
        }
    });

    audio.addEventListener('play', updateUI);
    audio.addEventListener('pause', updateUI);

    // Progress bar
    audio.addEventListener('timeupdate', () => {
        if (audio.duration) {
            progressBar.style.width = `${(audio.currentTime / audio.duration) * 100}%`;
        }
    });
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

    // Cover extraction
    if (coverUrl) {
        const img = document.createElement('img');
        img.src = coverUrl;
        img.alt = 'Album cover';
        coverEl.prepend(img);
        placeholder.style.display = 'none';
    } else {
        extractCover(audioUrl).then(dataUrl => {
            if (dataUrl) {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.alt = 'Album cover';
                coverEl.prepend(img);
                placeholder.style.display = 'none';
            }
        });
    }
}

// Auto-init on DOMContentLoaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMusicPlayer);
} else {
    initMusicPlayer();
}
