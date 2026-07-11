/**
 * Fullscreen reading mode for articles
 * Hides sidebars, navigation, and other distractions to focus on content
 */
export function setupFullscreenReading() {
    // Only run on article pages
    if (!document.querySelector('.article-page')) return;

    const articleContent = document.querySelector('.article-content');
    if (!articleContent) return;

    // Create fullscreen toggle button
    const button = document.createElement('button');
    button.id = 'fullscreen-reading-toggle';
    button.setAttribute('aria-label', '全屏阅读');
    button.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
    </svg>`;
    button.title = '全屏阅读';

    // Create exit fullscreen button (hidden by default)
    const exitButton = document.createElement('button');
    exitButton.id = 'fullscreen-reading-exit';
    exitButton.setAttribute('aria-label', '退出全屏');
    exitButton.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
    </svg>
    <span>退出全屏</span>`;
    exitButton.title = '退出全屏 (Esc)';

    // Insert button after the article
    const article = document.querySelector('.main-article');
    if (article) {
        article.appendChild(button);
    }

    // Insert exit button at the top of the body when in fullscreen
    document.body.appendChild(exitButton);

    let isFullscreen = false;

    const enterFullscreen = () => {
        isFullscreen = true;
        document.body.classList.add('fullscreen-reading');
        button.classList.add('active');
        
        // Store scroll position
        button.dataset.scrollY = window.scrollY.toString();
        
        // Scroll to top of article content
        const articleElement = document.querySelector('.main-article');
        if (articleElement) {
            articleElement.scrollIntoView({ behavior: 'smooth' });
        }
    };

    const exitFullscreen = () => {
        isFullscreen = false;
        document.body.classList.remove('fullscreen-reading');
        button.classList.remove('active');
        
        // Restore scroll position
        const scrollY = parseInt(button.dataset.scrollY || '0');
        window.scrollTo({ top: scrollY, behavior: 'smooth' });
    };

    button.addEventListener('click', () => {
        if (isFullscreen) {
            exitFullscreen();
        } else {
            enterFullscreen();
        }
    });

    exitButton.addEventListener('click', exitFullscreen);

    // Exit fullscreen on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && isFullscreen) {
            exitFullscreen();
        }
    });

    // Show/hide toggle button based on scroll position
    const updateButtonVisibility = () => {
        const scrollY = window.scrollY;
        if (scrollY > 300) {
            button.classList.add('visible');
        } else {
            button.classList.remove('visible');
        }
    };

    window.addEventListener('scroll', updateButtonVisibility, { passive: true });
    updateButtonVisibility();
}
