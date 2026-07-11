/*!
*   Hugo Theme Stack
*
*   @author: Jimmy Cai
*   @website: https://jimmycai.com
*   @link: https://github.com/CaiJimmy/hugo-theme-stack
*/
import menu from './menu';
import createElement from './createElement';
import StackColorScheme from './colorScheme';
import { setupScrollspy } from './scrollspy';
import { setupSmoothAnchors } from './smoothAnchors';
import { setupPaginationJump } from './pagination';
import { setupCodeCopy } from './code-copy';
import { setupFullscreenReading } from './fullscreen-reading';

/**
 * Scroll reveal animation — fade in article content elements as they enter the viewport
 */
const SCROLL_REVEAL_SELECTORS = '.article-content > p, .article-content > h2, .article-content > h3, .article-content > h4, .article-content > ul, .article-content > ol, .article-content > pre, .article-content > .highlight, .article-content > blockquote, .article-content > .table-wrapper, .article-content > figure, .article-content > hr, .article-content > .mermaid-wrapper, .article-content > .aplayer-container, .timeline-year';

let scrollRevealObserver: IntersectionObserver | null = null;

function setupScrollReveal() {
    const elements = document.querySelectorAll(SCROLL_REVEAL_SELECTORS);
    if (!elements.length) return;

    if (!scrollRevealObserver) {
        scrollRevealObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    scrollRevealObserver!.unobserve(entry.target);
                }
            });
        }, { rootMargin: '0px 0px -40px 0px', threshold: 0.1 });
    }

    elements.forEach(el => {
        if (!el.classList.contains('revealed')) {
            scrollRevealObserver!.observe(el);
        }
    });
}

/**
 * Back-to-top button and reading progress bar
 */
function setupInteractions() {
    const backToTop = document.getElementById('back-to-top');
    const progressBar = document.getElementById('reading-progress-bar');

    if (backToTop) {
        backToTop.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    const update = () => {
        const scrollY = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;

        // Back to top visibility
        if (backToTop) {
            if (scrollY > 300) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        }

        // Reading progress
        if (progressBar && docHeight > 0) {
            const progress = Math.min((scrollY / docHeight) * 100, 100);
            progressBar.style.width = progress + '%';
        }
    };

    window.addEventListener('scroll', update, { passive: true });
    update();
}

/**
 * Password gate — SHA-256 hash verification for protected articles
 */
function setupPasswordGate() {
    const gate = document.querySelector('.password-gate') as HTMLElement;
    if (!gate) return;

    const expectedHash = gate.getAttribute('data-password-hash');
    if (!expectedHash) return;

    const input = gate.querySelector('.password-gate-input') as HTMLInputElement;
    const btn = gate.querySelector('.password-gate-btn') as HTMLButtonElement;
    const error = gate.querySelector('.password-gate-error') as HTMLElement;
    const content = gate.querySelector('.password-gate-content') as HTMLElement;
    const overlay = gate.querySelector('.password-gate-overlay') as HTMLElement;

    if (!input || !btn || !error || !content || !overlay) return;

    const unlock = () => {
        overlay.style.display = 'none';
        content.style.display = '';
        // Refresh TOC scrollspy if available
        document.dispatchEvent(new CustomEvent('toc:refresh'));
    };

    const showError = () => {
        error.classList.add('visible');
        input.classList.add('error');
        setTimeout(() => {
            input.classList.remove('error');
        }, 500);
    };

    const verify = async () => {
        const password = input.value;
        if (!password) return;

        try {
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            if (hashHex === expectedHash) {
                unlock();
            } else {
                showError();
            }
        } catch (e) {
            console.error('Password verification failed:', e);
        }
    };

    btn.addEventListener('click', verify);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') verify();
    });
}

/**
 * Set data-lang attribute on code blocks for macOS-style header display
 */
function setupCodeBlockLang() {
    const highlights = document.querySelectorAll('.article-content div.highlight');
    highlights.forEach(highlight => {
        const codeBlock = highlight.querySelector('code[data-lang]');
        if (!codeBlock) return;

        const language = codeBlock.getAttribute('data-lang')?.trim();
        if (language) {
            highlight.setAttribute('data-lang', language.toUpperCase());
        }
    });
}

let Stack = {
    init: () => {
        /**
         * Bind menu event
         */
        menu();

        const articleContent = document.querySelector('.article-content') as HTMLElement;
        if (articleContent) {
            setupSmoothAnchors();
            setupScrollspy();
            setupCodeCopy();
        }

        setupPaginationJump();
        setupScrollReveal();
        setupInteractions();

        // Re-observe elements after Mermaid wraps diagrams
        window.addEventListener('mermaid:wrapped', setupScrollReveal);
        setupPasswordGate();
        setupCodeBlockLang();
        setupFullscreenReading();

        new StackColorScheme(document.getElementById('dark-mode-toggle')!);
    }
}

window.addEventListener('load', () => {
    setTimeout(function () {
        Stack.init();
    }, 0);
})

declare global {
    interface Window {
        createElement: any;
        Stack: any
    }
}

window.Stack = Stack;
window.createElement = createElement;
