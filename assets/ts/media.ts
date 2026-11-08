/**
 * Shared audio media helpers: deferred fetch + ID3 cover extraction.
 * Used by music-player.ts and the APlayer shortcode bootstrap (aplayer.ts).
 */

declare global {
    interface Window {
        jsmediatags?: {
            read: (file: Blob, handlers: {
                onSuccess: (tag: { tags?: { picture?: { format: string; data: number[] } } }) => void,
                onError: () => void,
            }) => void;
        };
        APlayer?: any;
    }
}

export function fetchAndExtract(audioUrl: string): Promise<{ blobUrl: string; coverDataUrl: string }> {
    return fetch(audioUrl)
        .then(r => r.arrayBuffer())
        .then(buffer => {
            const blobUrl = URL.createObjectURL(new Blob([buffer]));
            return extractCoverFromBuffer(buffer).then(coverDataUrl => ({ blobUrl, coverDataUrl }));
        })
        .catch(() => ({ blobUrl: audioUrl, coverDataUrl: '' }));
}

export function waitForJsmediatags(timeout = 5000): Promise<boolean> {
    if (typeof window.jsmediatags !== 'undefined') {
        return Promise.resolve(true);
    }
    return new Promise((resolve) => {
        const deadline = Date.now() + timeout;
        const poll = () => {
            if (typeof window.jsmediatags !== 'undefined') {
                return resolve(true);
            }
            if (Date.now() > deadline) {
                return resolve(false);
            }
            setTimeout(poll, 100);
        };
        poll();
    });
}

export function extractCoverFromBuffer(buffer: ArrayBuffer): Promise<string> {
    return waitForJsmediatags().then((ready) => {
        if (!ready) return '';
        return new Promise<string>((resolve) => {
            window.jsmediatags!.read(new Blob([buffer]), {
                onSuccess: (tag) => {
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
        });
    });
}
