/**
 * 鸭嘴兽互动区。内容全部来自 data/platypus.json，说明见 data/README.md。
 */
(function () {
    const MAX_TOKENS = 6;
    const KEY_STEP = 10;
    const KEY_STEP_LARGE = 40;
    const LANGS = ['zh', 'es', 'en'];
    const LANG_LABEL = { zh: '中文', es: 'ES', en: 'EN' };

    const state = {
        data: null,
        lang: 'zh',
        selected: [],
        active: null,
        positions: {},
        tipTarget: null
    };

    let mount, tip, live;

    function h(tag, attrs, children) {
        const el = document.createElement(tag);
        if (attrs) {
            for (const [k, v] of Object.entries(attrs)) {
                if (v === undefined || v === null || v === false) continue;
                if (k === 'class') el.className = v;
                else if (k === 'text') el.textContent = v;
                else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
                else el.setAttribute(k, v === true ? '' : v);
            }
        }
        (children || []).forEach(c => c && el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
        return el;
    }

    function t(obj) {
        if (!obj) return '';
        return obj[state.lang] || obj.zh || obj.es || obj.en || '';
    }

    function siteLang() {
        const l = (document.documentElement.lang || 'zh').toLowerCase();
        return l.startsWith('es') ? 'es' : 'zh';
    }

    function flavorById(id) {
        return state.data.flavors.find(f => f.id === id);
    }

    function fill(template, values) {
        return template.replace(/\{(\w+)\}/g, (_, k) => (values[k] !== undefined ? values[k] : ''));
    }

    function flavorTipText(flavor) {
        return fill(t(state.data.ui.flavorTip), {
            name: t(flavor.name),
            tags: (flavor.tags[state.lang] || flavor.tags.zh || []).join(' · '),
            puffs: state.data.puffs
        });
    }

    function announce(text) {
        if (live) live.textContent = text;
    }

    // ---------- tooltip ----------

    function showTip(target) {
        const text = target.dataset.tip;
        if (!text) return;
        state.tipTarget = target;
        tip.textContent = '';
        if (target.dataset.tipTitle) tip.appendChild(h('strong', { text: target.dataset.tipTitle }));
        if (target.dataset.tipPlaceholder === 'true') {
            tip.appendChild(h('span', { class: 'pl-tip-badge', text: t(state.data.ui.placeholder) }));
        }
        tip.appendChild(h('span', { class: 'pl-tip-body', text }));
        tip.hidden = false;
        target.setAttribute('aria-describedby', 'pl-tip');

        const r = target.getBoundingClientRect();
        const tw = tip.offsetWidth;
        const th = tip.offsetHeight;
        let left = r.left + r.width / 2 - tw / 2;
        left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
        let top = r.top - th - 10;
        if (top < 8) top = r.bottom + 10;
        tip.style.left = `${Math.round(left)}px`;
        tip.style.top = `${Math.round(top)}px`;
    }

    function hideTip() {
        if (state.tipTarget) state.tipTarget.removeAttribute('aria-describedby');
        state.tipTarget = null;
        if (tip) tip.hidden = true;
    }

    function bindTip(el) {
        el.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showTip(el); });
        el.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hideTip(); });
        el.addEventListener('focus', () => showTip(el));
        el.addEventListener('blur', hideTip);
    }

    // ---------- selection ----------

    function selectFlavor(id) {
        const already = state.selected.includes(id);
        if (already && state.active === id) {
            removeToken(id);
            return;
        }
        if (!already) {
            if (state.selected.length >= MAX_TOKENS) state.selected.shift();
            state.selected.push(id);
            const n = state.selected.length - 1;
            state.positions[id] = state.positions[id] || { x: 12 + (n % 3) * 110, y: 14 + Math.floor(n / 3) * 52 };
        }
        state.active = id;
        render();
        announce(`${t(state.data.ui.selected)}: ${t(flavorById(id).name)}`);
    }

    function removeToken(id) {
        state.selected = state.selected.filter(x => x !== id);
        delete state.positions[id];
        if (state.active === id) state.active = state.selected[state.selected.length - 1] || null;
        render();
    }

    // ---------- drag ----------

    function clampToBoard(board, token, x, y) {
        const maxX = Math.max(0, board.clientWidth - token.offsetWidth);
        const maxY = Math.max(0, board.clientHeight - token.offsetHeight);
        return { x: Math.max(0, Math.min(x, maxX)), y: Math.max(0, Math.min(y, maxY)) };
    }

    function placeToken(token, pos) {
        token.style.transform = `translate(${Math.round(pos.x)}px, ${Math.round(pos.y)}px)`;
    }

    function bindDrag(token, board, id) {
        let start = null;

        token.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            hideTip();
            start = { px: e.clientX, py: e.clientY, x: state.positions[id].x, y: state.positions[id].y, moved: false };
            token.setPointerCapture(e.pointerId);
            token.classList.add('is-dragging');
        });

        token.addEventListener('pointermove', e => {
            if (!start) return;
            const dx = e.clientX - start.px;
            const dy = e.clientY - start.py;
            if (Math.abs(dx) + Math.abs(dy) > 3) start.moved = true;
            const pos = clampToBoard(board, token, start.x + dx, start.y + dy);
            state.positions[id] = pos;
            placeToken(token, pos);
        });

        const end = e => {
            if (!start) return;
            const moved = start.moved;
            start = null;
            token.classList.remove('is-dragging');
            if (token.hasPointerCapture && token.hasPointerCapture(e.pointerId)) token.releasePointerCapture(e.pointerId);
            if (!moved && state.active !== id) {
                state.active = id;
                render();
                const again = mount.querySelector(`.pl-token[data-id="${CSS.escape(id)}"]`);
                if (again) again.focus();
            }
        };
        token.addEventListener('pointerup', end);
        token.addEventListener('pointercancel', end);

        token.addEventListener('keydown', e => {
            const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
            const pos = { ...state.positions[id] };
            if (e.key === 'ArrowLeft') pos.x -= step;
            else if (e.key === 'ArrowRight') pos.x += step;
            else if (e.key === 'ArrowUp') pos.y -= step;
            else if (e.key === 'ArrowDown') pos.y += step;
            else if (e.key === 'Delete' || e.key === 'Backspace') {
                e.preventDefault();
                removeToken(id);
                const next = mount.querySelector('.pl-token') || mount.querySelector('.pl-chip');
                if (next) next.focus();
                return;
            } else if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                state.active = id;
                render();
                const again = mount.querySelector(`.pl-token[data-id="${CSS.escape(id)}"]`);
                if (again) again.focus();
                return;
            } else if (e.key === 'Escape') {
                hideTip();
                return;
            } else {
                return;
            }
            e.preventDefault();
            state.positions[id] = clampToBoard(board, token, pos.x, pos.y);
            placeToken(token, state.positions[id]);
            showTip(token);
        });
    }

    // ---------- render ----------

    function renderLangSwitch() {
        return h('div', { class: 'pl-lang', role: 'group', 'aria-label': 'Idioma / 语言 / Language' },
            LANGS.map(l => h('button', {
                type: 'button',
                class: 'pl-lang-btn',
                'aria-pressed': String(state.lang === l),
                lang: l === 'zh' ? 'zh-CN' : l,
                text: LANG_LABEL[l],
                onclick: () => { state.lang = l; render(); }
            }))
        );
    }

    function renderStage(d, activeFlavor) {
        const img = activeFlavor ? activeFlavor.image : d.defaultImage;
        const alt = activeFlavor ? `${t(d.ui.title)} · ${t(activeFlavor.name)}` : t(d.ui.title);
        const hotspots = d.hotspots.map(hs => {
            const btn = h('button', {
                type: 'button',
                class: `pl-hotspot${hs.placeholder ? ' is-placeholder' : ''}`,
                style: `left:${Number(hs.x)}%;top:${Number(hs.y)}%`,
                'aria-label': t(hs.label),
                'data-tip': `${t(hs.info)} ${puffLine(d)}`,
                'data-tip-title': t(hs.label),
                'data-tip-placeholder': String(!!hs.placeholder),
                onclick: () => showTip(btn)
            }, [h('span', { class: 'pl-hotspot-dot', 'aria-hidden': 'true' })]);
            bindTip(btn);
            return btn;
        });
        return h('figure', { class: 'pl-stage' }, [
            h('div', { class: 'pl-photo' }, [
                h('img', { src: img, alt, width: '400', height: '600', loading: 'lazy', decoding: 'async' }),
                ...hotspots
            ]),
            h('figcaption', { class: 'pl-note', text: t(d.ui.positionNote) })
        ]);
    }

    function puffLine(d) {
        return fill(t(d.ui.puffLine), { puffs: d.puffs });
    }

    function renderSelected(d, activeFlavor) {
        const box = h('div', { class: 'pl-selected', 'aria-live': 'off' }, [
            h('p', { class: 'pl-selected-label', text: t(d.ui.selected) })
        ]);
        if (activeFlavor) {
            box.appendChild(h('p', { class: 'pl-selected-name', text: t(activeFlavor.name) }));
            box.appendChild(h('p', { class: 'pl-selected-tags', text: (activeFlavor.tags[state.lang] || activeFlavor.tags.zh).join(' · ') }));
        } else {
            box.appendChild(h('p', { class: 'pl-selected-name is-empty', text: t(d.ui.noneSelected) }));
        }
        return box;
    }

    function renderChips(d) {
        return h('div', { class: 'pl-chips', role: 'group', 'aria-label': t(d.ui.title) },
            d.flavors.map(f => {
                const chip = h('button', {
                    type: 'button',
                    class: `pl-chip${state.active === f.id ? ' is-active' : ''}`,
                    'aria-pressed': String(state.selected.includes(f.id)),
                    'data-id': f.id,
                    'data-tip': flavorTipText(f),
                    'data-tip-title': t(f.name),
                    text: t(f.name),
                    onclick: () => {
                        selectFlavor(f.id);
                        const again = mount.querySelector(`.pl-chip[data-id="${CSS.escape(f.id)}"]`);
                        if (again) { again.focus(); showTip(again); }
                    }
                });
                bindTip(chip);
                return chip;
            })
        );
    }

    function renderBoard(d) {
        const board = h('div', { class: 'pl-board', role: 'group', 'aria-label': t(d.ui.dragHint) });
        if (!state.selected.length) board.appendChild(h('p', { class: 'pl-board-empty', text: t(d.ui.boardEmpty) }));
        state.selected.forEach(id => {
            const f = flavorById(id);
            if (!f) return;
            const token = h('button', {
                type: 'button',
                class: `pl-token${state.active === id ? ' is-active' : ''}`,
                'data-id': id,
                'data-tip': flavorTipText(f),
                'data-tip-title': t(f.name),
                'aria-roledescription': t(d.ui.tokenRole),
                'aria-keyshortcuts': 'ArrowUp ArrowDown ArrowLeft ArrowRight Delete'
            }, [
                h('img', { src: f.image, alt: '', width: '28', height: '42', loading: 'lazy', 'aria-hidden': 'true' }),
                h('span', { text: t(f.name) })
            ]);
            board.appendChild(token);
            bindTip(token);
            bindDrag(token, board, id);
        });
        return board;
    }

    function render() {
        const d = state.data;
        if (!d) return;
        const focusedId = document.activeElement && mount.contains(document.activeElement) ? document.activeElement.dataset.id : null;
        hideTip();
        const activeFlavor = state.active ? flavorById(state.active) : null;
        const price = `€${(d.priceCents / 100).toFixed(2)}`;

        mount.textContent = '';
        mount.setAttribute('lang', state.lang === 'zh' ? 'zh-CN' : state.lang);
        mount.appendChild(h('div', { class: 'pl-head' }, [
            h('div', {}, [
                h('p', { class: 'pl-kicker', text: t(d.ui.kicker) }),
                h('h2', { id: 'platypus-title', class: 'section-title', text: t(d.ui.title) }),
                h('p', { class: 'pl-desc', text: t(d.description) })
            ]),
            h('div', { class: 'pl-head-side' }, [
                renderLangSwitch(),
                h('p', { class: 'pl-price' }, [h('span', { text: t(d.ui.priceLabel) }), h('strong', { text: price })])
            ])
        ]));
        mount.appendChild(h('div', { class: 'pl-body' }, [
            renderStage(d, activeFlavor),
            h('div', { class: 'pl-panel' }, [
                renderSelected(d, activeFlavor),
                renderChips(d),
                h('p', { class: 'pl-hint', text: t(d.ui.dragHint) }),
                renderBoard(d)
            ])
        ]));

        requestAnimationFrame(() => {
            mount.querySelectorAll('.pl-token').forEach(token => {
                const id = token.dataset.id;
                const board = token.parentElement;
                state.positions[id] = clampToBoard(board, token, state.positions[id].x, state.positions[id].y);
                placeToken(token, state.positions[id]);
            });
        });

        if (focusedId) {
            const again = mount.querySelector(`[data-id="${CSS.escape(focusedId)}"]`);
            if (again) again.focus({ preventScroll: true });
        }
    }

    function renderError() {
        mount.textContent = '';
        mount.appendChild(h('p', { class: 'pl-error', text: '鸭嘴兽互动区数据加载失败（data/platypus.json）。 / No se pudo cargar data/platypus.json.' }));
    }

    async function initPlatypus() {
        mount = document.getElementById('platypus-mount');
        if (!mount) return;
        tip = h('div', { id: 'pl-tip', class: 'pl-tip', role: 'tooltip', hidden: true });
        live = h('p', { class: 'pl-live', 'aria-live': 'polite' });
        document.body.appendChild(tip);
        mount.parentElement.appendChild(live);

        document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
        document.addEventListener('pointerdown', e => {
            if (state.tipTarget && !state.tipTarget.contains(e.target)) hideTip();
        });
        window.addEventListener('scroll', hideTip, { passive: true });
        window.addEventListener('resize', hideTip);

        state.lang = siteLang();
        new MutationObserver(() => {
            const next = siteLang();
            if (next !== state.lang) { state.lang = next; render(); }
        }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });

        try {
            const res = await fetch('data/platypus.json', { cache: 'no-cache' });
            if (!res.ok) throw new Error(String(res.status));
            state.data = await res.json();
            render();
        } catch (e) {
            renderError();
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlatypus);
    else initPlatypus();
})();
