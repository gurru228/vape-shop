/**
 * 选择性动效：data-reveal 区块进场 + 首屏商品图轻微视差。
 * 系统开启「减少动态效果」时全部关闭；视差只在宽度大于 960px 时启用。
 */
(function () {
    const root = document.documentElement;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

    if (reduce.matches || !('IntersectionObserver' in window)) {
        root.classList.remove('motion-ok');
        return;
    }
    root.classList.add('motion-ok');

    const revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            entry.target.classList.add('is-revealed');
            revealObserver.unobserve(entry.target);
        });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.08 });
    document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

    const parallaxItems = Array.from(document.querySelectorAll('[data-parallax]'));
    if (!parallaxItems.length) return;

    const wide = window.matchMedia('(min-width: 961px)');
    const STRENGTH = 0.12;
    const LIMIT = 40;
    let ticking = false;
    let inView = true;

    const visibility = new IntersectionObserver(entries => {
        entries.forEach(entry => { inView = entry.isIntersecting; });
    });
    parallaxItems.forEach(el => visibility.observe(el));

    function update() {
        ticking = false;
        if (!wide.matches || reduce.matches) {
            parallaxItems.forEach(el => el.style.removeProperty('--parallax'));
            return;
        }
        if (!inView) return;
        const y = Math.min(window.scrollY * STRENGTH, LIMIT);
        parallaxItems.forEach(el => el.style.setProperty('--parallax', `${y.toFixed(1)}px`));
    }

    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(update);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    wide.addEventListener('change', update);
    reduce.addEventListener('change', () => {
        if (!reduce.matches) return;
        root.classList.remove('motion-ok');
        update();
    });
    update();
})();
