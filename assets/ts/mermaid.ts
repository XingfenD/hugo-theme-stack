declare const mermaid: {
    initialize(config: Record<string, any>): void;
    run(options: { nodes: HTMLElement[] }): Promise<void>;
};

interface MermaidConfig {
    transparentBackground?: boolean;
    lightTheme?: string;
    darkTheme?: string;
    lightThemeVariables?: Record<string, any>;
    darkThemeVariables?: Record<string, any>;
    securityLevel?: string;
    look?: string;
    htmlLabels?: boolean;
    maxTextSize?: number;
    maxEdges?: number;
    fontSize?: number;
    fontFamily?: string;
    curve?: string;
    logLevel?: number;
}

type Scheme = 'light' | 'dark';

function getScheme(): Scheme {
    return document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light';
}

function buildThemeConfig(cfg: MermaidConfig, scheme: Scheme) {
    const isLight = scheme === 'light';
    const theme = isLight ? (cfg.lightTheme ?? 'default') : (cfg.darkTheme ?? 'dark');
    const vars = isLight ? (cfg.lightThemeVariables ?? {}) : (cfg.darkThemeVariables ?? {});
    return {
        theme,
        themeVariables: { ...vars, ...(cfg.transparentBackground ? { background: 'transparent' } : {}) },
    };
}

function buildBaseConfig(cfg: MermaidConfig): Record<string, any> {
    const base: Record<string, any> = {
        startOnLoad: false,
        securityLevel: cfg.securityLevel ?? 'strict',
        look: cfg.look ?? 'classic',
        flowchart: { htmlLabels: cfg.htmlLabels ?? true, useMaxWidth: true },
        gantt: { useWidth: 800 },
    };
    const optional: (keyof MermaidConfig)[] = ['maxTextSize', 'maxEdges', 'fontSize', 'fontFamily', 'curve', 'logLevel'];
    for (const key of optional) {
        if (cfg[key] != null) base[key] = cfg[key];
    }
    return base;
}

function initWithTheme(
    scheme: Scheme,
    themes: Record<Scheme, ReturnType<typeof buildThemeConfig>>,
    baseConfig: Record<string, any>,
) {
    const { theme, themeVariables } = themes[scheme];
    mermaid.initialize({
        ...baseConfig,
        theme,
        ...(Object.keys(themeVariables).length && { themeVariables }),
    });
}

async function renderOffscreen(sources: string[]): Promise<string[]> {
    const container = document.createElement('div');
    container.className = 'mermaid-offscreen';
    document.body.appendChild(container);
    const nodes = sources.map(src => {
        const n = document.createElement('pre');
        n.innerHTML = src;
        container.appendChild(n);
        return n;
    });
    await mermaid.run({ nodes });
    const results = nodes.map(n => n.innerHTML);
    container.remove();
    return results;
}

function setupWrappers(elements: NodeListOf<HTMLElement>) {
    elements.forEach((el, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        el.parentNode!.insertBefore(wrapper, el);
        wrapper.appendChild(el);
        wrapper.insertAdjacentHTML(
            'beforeend',
            `<div class="mermaid-toolbar"><button data-idx="${idx}" title="全屏查看"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button></div>`,
        );
    });
}

function setupModal(elements: NodeListOf<HTMLElement>) {
    const modal = document.getElementById('mermaid-modal')!;
    const modalBody = document.getElementById('mermaid-modal-body')!;
    const modalContent = document.getElementById('mermaid-modal-content')!;
    const zoomLabel = document.getElementById('mermaid-zoom-label');

    // Transform state — no library, full control
    let scale = 1;
    let tx = 0;
    let ty = 0;
    let wrapper: HTMLElement | null = null;

    const applyTransform = () => {
        if (!wrapper) return;
        wrapper.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
        if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
    };

    const clampScale = (s: number) => Math.max(0.05, Math.min(10, s));

    const fitToScreen = () => {
        if (!wrapper) return;
        const w = +(wrapper.dataset.nativeWidth ?? 0);
        const h = +(wrapper.dataset.nativeHeight ?? 0);
        const rect = modalContent.getBoundingClientRect();
        scale = clampScale(Math.min((rect.width - 40) / w, (rect.height - 40) / h));
        tx = (rect.width - w * scale) / 2;
        ty = (rect.height - h * scale) / 2;
        applyTransform();
    };

    // Zoom toward a point (cx, cy in container coords)
    const zoomAt = (factor: number, cx: number, cy: number) => {
        const newScale = clampScale(scale * factor);
        const ratio = newScale / scale;
        tx = cx - ratio * (cx - tx);
        ty = cy - ratio * (cy - ty);
        scale = newScale;
        applyTransform();
    };

    const closeModal = () => {
        modal.classList.remove('active');
        document.body.style.overflow = '';
        wrapper = null;
        scale = 1; tx = 0; ty = 0;
        modalContent.innerHTML = '';
    };

    const openModal = (idx: number) => {
        const svg = elements[idx].querySelector('svg');
        if (!svg) return;

        const svgClone = svg.cloneNode(true) as SVGElement;
        const viewBox = svg.getAttribute('viewBox');
        const [w, h] = viewBox
            ? viewBox.split(/[\s,]+/).slice(2).map(Number)
            : [svg.getBoundingClientRect().width || 800, svg.getBoundingClientRect().height || 600];
        svgClone.setAttribute('width', String(w));
        svgClone.setAttribute('height', String(h));

        wrapper = document.createElement('div');
        wrapper.className = 'mermaid-panzoom-container';
        wrapper.dataset.nativeWidth = String(w);
        wrapper.dataset.nativeHeight = String(h);
        wrapper.style.transformOrigin = '0 0';
        wrapper.appendChild(svgClone);

        modalContent.innerHTML = '';
        modalContent.appendChild(wrapper);
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        fitToScreen();
        wrapper.classList.add('ready');

        // --- Drag (pointer events) ---
        let dragging = false;
        let lastX = 0;
        let lastY = 0;

        wrapper.addEventListener('pointerdown', (e) => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            wrapper!.setPointerCapture(e.pointerId);
            e.preventDefault();
        });

        wrapper.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            tx += e.clientX - lastX;
            ty += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            applyTransform();
        });

        wrapper.addEventListener('pointerup', () => { dragging = false; });
        wrapper.addEventListener('pointercancel', () => { dragging = false; });

        // --- Wheel / trackpad two-finger scroll → pan ---
        wrapper.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            // Pinch-to-zoom on trackpad sends wheel with ctrlKey
            if (e.ctrlKey) {
                const rect = modalContent.getBoundingClientRect();
                const cx = e.clientX - rect.left;
                const cy = e.clientY - rect.top;
                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                zoomAt(factor, cx, cy);
            } else {
                // Two-finger scroll → pan
                tx -= e.deltaX;
                ty -= e.deltaY;
                applyTransform();
            }
        }, { passive: false });
    };

    // Event delegation for toolbar buttons
    document.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const toolbarBtn = target.closest('.mermaid-toolbar button') as HTMLElement | null;
        if (toolbarBtn) return openModal(+(toolbarBtn.dataset.idx!));

        const zoomBtn = target.closest('.mermaid-modal-controls button') as HTMLElement | null;
        if (zoomBtn && wrapper) {
            const z = zoomBtn.dataset.zoom;
            const rect = modalContent.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;
            if (z === 'fit') fitToScreen();
            else zoomAt(z === '1' ? 1.5 : 0.67, cx, cy);
        }
    });

    document.getElementById('mermaid-modal-close')!.addEventListener('click', closeModal);
    modalBody.addEventListener('click', (e) => { if (e.target === modalBody) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeModal();
    });
}

export async function initMermaidPage(config: MermaidConfig) {
    const elements = document.querySelectorAll('.mermaid') as NodeListOf<HTMLElement>;
    if (!elements.length) return;

    const sources = Array.from(elements).map(el => el.innerHTML);
    const perDiagramTransparent = sources.map(src => /%%\s*transparent\s*%%/i.test(src));
    const cache: Record<Scheme, string[]> = { light: [], dark: [] };

    const themes = {
        light: buildThemeConfig(config, 'light'),
        dark: buildThemeConfig(config, 'dark'),
    };
    const baseConfig = buildBaseConfig(config);

    const applyTransparency = (el: HTMLElement, i: number) => {
        if (perDiagramTransparent[i]) el.querySelector('svg')?.style.setProperty('background', 'transparent');
    };

    setupWrappers(elements);
    setupModal(elements);

    // Initial render
    const scheme = getScheme();
    initWithTheme(scheme, themes, baseConfig);
    await mermaid.run({ nodes: Array.from(elements) });
    elements.forEach((el, i) => {
        el.style.visibility = '';
        cache[scheme][i] = el.innerHTML;
        applyTransparency(el, i);
    });

    // Pre-render alternate theme during idle time
    const alt: Scheme = scheme === 'dark' ? 'light' : 'dark';
    const idle = window.requestIdleCallback ?? ((fn: IdleRequestCallback) => setTimeout(fn, 1000));
    idle(() => {
        if (cache[alt].length) return;
        initWithTheme(alt, themes, baseConfig);
        renderOffscreen(sources).then(results => { cache[alt] = results; });
    });

    // Swap cached diagrams on theme change
    window.addEventListener('onColorSchemeChange', async () => {
        const newScheme = getScheme();
        if (!cache[newScheme].length) {
            initWithTheme(newScheme, themes, baseConfig);
            cache[newScheme] = await renderOffscreen(sources);
        }
        elements.forEach((el, i) => { el.innerHTML = cache[newScheme][i]; applyTransparency(el, i); });
    });
}
