// ===== Supabase 客户端（用户Auth + 查询自己的订单） =====
const _SB_URL = 'https://ehbdpuwfdnbdeskezevg.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYmRwdXdmZG5iZGVza2V6ZXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Mjk1MTksImV4cCI6MjA5MTQwNTUxOX0.bRDaEu0GA0GaWbdjceYbqMcybkW1lii6DzeG2EQeWMY';
let sbClient = null;
let currentUser = null;

let supabaseLoading = null;
function loadSupabaseSdk() {
    if (window.supabase?.createClient) return Promise.resolve();
    if (supabaseLoading) return supabaseLoading;
    supabaseLoading = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Supabase SDK failed'));
        document.head.appendChild(script);
    });
    return supabaseLoading;
}

async function initSupabase() {
    try {
        await loadSupabaseSdk();
        if (!window.supabase) throw new Error('Supabase SDK未加载');
        sbClient = window.supabase.createClient(_SB_URL, _SB_KEY);
        initAuth();
    } catch (e) {
        console.error('Supabase init error:', e);
    }
}

// ===== 配置信息 =====
const SHOP_CONTACT = (typeof window !== 'undefined' && window.SHOP_CONTACT) || require('./lib/contact');

const CONFIG = {
    whatsappPhone: SHOP_CONTACT.WHATSAPP_PHONE,
    defaultCurrency: '€',
    storeName: '口粮专卖店'
};

function icon(name) {
    return `<svg class="icon" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

// ===== 优惠码系统 =====
const DISCOUNT_CODES = {}; // 优惠码活动暂停

let activeDiscount = null; // { code, percent, label }

function getUsedCodes() {
    try { return JSON.parse(localStorage.getItem('used_discount_codes') || '[]'); } catch { return []; }
}

function markCodeAsUsed(code) {
    const used = getUsedCodes();
    if (!used.includes(code)) {
        used.push(code);
        localStorage.setItem('used_discount_codes', JSON.stringify(used));
    }
}

function applyDiscountCode(code) {
    const upper = code.trim().toUpperCase();
    const found = DISCOUNT_CODES[upper];
    if (!found) return { ok: false, reason: 'invalid' };
    if (getUsedCodes().includes(upper)) return { ok: false, reason: 'used' };
    activeDiscount = { code: upper, ...found };
    return { ok: true, ...found };
}

function clearDiscount() {
    activeDiscount = null;
}

// ===== 满减活动（自动，无需优惠码）=====
// 阶梯取最高可用档；与运费规则独立
const TIERED_DISCOUNTS = [
    { threshold: 180, amount: 20 },
    { threshold: 90, amount: 8 },
];

function getTieredDiscount(original) {
    for (const tier of TIERED_DISCOUNTS) {
        if (original >= tier.threshold) return tier;
    }
    return null;
}

function getTieredDiscountAmount(original) {
    const tier = getTieredDiscount(original);
    return tier ? tier.amount : 0;
}

function getDiscountedTotal(original) {
    let total = original;
    if (activeDiscount) {
        total = total * (1 - activeDiscount.percent / 100);
    }
    total = total - getTieredDiscountAmount(original);
    return +Math.max(0, total).toFixed(2);
}

const SHIPPING_FEE = 9.99;
const FREE_SHIPPING_THRESHOLD = 150;

function getNonFreeQuantity() {
    return cart.filter(i => !i.isFree).reduce((s, i) => s + i.quantity, 0);
}

function isShippingQuoteRequired() {
    const isPostal = document.getElementById('btn-postal')?.classList.contains('active');
    if (!isPostal) return false;
    const country = document.getElementById('checkout-postal-country')?.value || 'ES';
    return country !== 'ES';
}

function getShippingFee() {
    const isPostal = document.getElementById('btn-postal')?.classList.contains('active');
    if (!isPostal) return 0;
    // 西班牙以外的欧盟国家：结账不收运费，下单后通过 WhatsApp 询价补收
    if (isShippingQuoteRequired()) return 0;
    const subtotal = cart.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.quantity, 0);
    const discounted = getDiscountedTotal(subtotal);
    return discounted >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
}

let latestQuote = null;
let quoteSeq = 0;
let quoteTimer = null;

function cartRequestItems() {
    return cart.filter(item => !item.isFree).map(item => ({
        id: String(item.id),
        quantity: item.quantity
    }));
}

function currentDeliveryContext() {
    const isDelivery = document.getElementById('btn-delivery')?.classList.contains('active');
    const isPostal = document.getElementById('btn-postal')?.classList.contains('active');
    return {
        deliveryType: isDelivery ? 'delivery' : isPostal ? 'postal' : 'pickup',
        country: document.getElementById('checkout-postal-country')?.value || 'ES'
    };
}

function selectedDeliverySlot() {
    const active = document.querySelector('#time-slots .time-slot.active');
    if (!active) return '10:00 - 14:00';
    return `${active.dataset.from} - ${active.dataset.to}`;
}

function collectCheckoutFields() {
    const name = document.getElementById('checkout-customer-name')?.value.trim() || '';
    const phone = document.getElementById('checkout-customer-phone')?.value.trim() || '';
    const { deliveryType, country } = currentDeliveryContext();
    const street = document.getElementById('checkout-delivery-street')?.value.trim() || '';
    const floor = document.getElementById('checkout-delivery-floor')?.value.trim() || '';
    const district = document.getElementById('checkout-delivery-district')?.value.trim() || '';
    const deliveryAddress = [street + (floor ? `, ${floor}` : ''), district ? `Madrid – ${district}` : (street ? 'Madrid' : '')].filter(Boolean).join('\n');
    const recipient = document.getElementById('checkout-postal-recipient')?.value.trim() || '';
    const postalStreet = document.getElementById('checkout-postal-street')?.value.trim() || '';
    const postalFloor = document.getElementById('checkout-postal-floor')?.value.trim() || '';
    const cp = document.getElementById('checkout-postal-cp')?.value.trim() || '';
    const city = document.getElementById('checkout-postal-city')?.value.trim() || '';
    const province = document.getElementById('checkout-postal-province')?.value.trim() || '';
    const countrySel = document.getElementById('checkout-postal-country');
    const countryLabel = countrySel?.selectedOptions?.[0]?.textContent.trim() || '';
    const quoteFlag = country !== 'ES' ? '运费另询 / Envío a confirmar' : '';
    const postalAddress = [recipient, postalStreet + (postalFloor ? ` ${postalFloor}` : ''), `${cp} ${city}`.trim(), province, countryLabel, quoteFlag].filter(Boolean).join('\n');
    const address = deliveryType === 'delivery' ? deliveryAddress : deliveryType === 'postal' ? postalAddress : '';
    return {
        name, phone, deliveryType, country, address,
        isDelivery: deliveryType === 'delivery',
        isPostal: deliveryType === 'postal',
        deliveryTime: deliveryType === 'delivery' ? selectedDeliverySlot() : ''
    };
}

function quoteErrorMessage(code) {
    const messages = {
        unknown_item: '有商品无法计价，请删除后重新添加 / Hay un producto no disponible. Quítelo y vuelva a añadirlo',
        invalid_quantity: '数量无效 / Cantidad no válida',
        empty_cart: '购物车是空的 / El carrito está vacío',
        delivery_minimum: '外送至少需要5件商品 / Se necesitan mínimo 5 unidades para entrega a domicilio',
        missing_customer: '请填写姓名和手机号 / Por favor complete su nombre y teléfono',
        missing_street: '请填写街道和门牌号 / Por favor introduzca la calle y número',
        missing_postal: '请填写完整邮寄地址（收件人、街道、邮编、城市）/ Rellene todos los campos de dirección postal',
        save_failed: '订单没有提交成功，请稍后再试一次 / No se pudo enviar el pedido. Inténtelo de nuevo'
    };
    return messages[code] || '价格计算失败，请稍后重试 / No se pudo calcular el precio';
}

async function fetchServerQuote(extra) {
    const items = cartRequestItems();
    if (!items.length) {
        quoteSeq += 1;
        latestQuote = null;
        return null;
    }
    const seq = ++quoteSeq;
    const res = await fetch('/.netlify/functions/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, ...currentDeliveryContext(), ...(extra || {}) })
    });
    const data = await res.json().catch(() => ({}));
    if (seq !== quoteSeq) return null;
    if (!res.ok || data.ok === false || data.error) {
        latestQuote = null;
        const err = new Error(quoteErrorMessage(data.error));
        err.code = data.error;
        throw err;
    }
    latestQuote = data;
    return data;
}

function scheduleServerQuote() {
    clearTimeout(quoteTimer);
    quoteTimer = setTimeout(() => {
        fetchServerQuote().then(quote => {
            if (quote) applyServerQuote(quote);
        }).catch(err => {
            const totalEl = document.getElementById('cart-total-price');
            if (totalEl) totalEl.textContent = '—';
            const errorEl = document.getElementById('checkout-error');
            if (errorEl && document.getElementById('checkout-modal')?.style.display === 'flex') {
                errorEl.textContent = err.message;
                errorEl.style.display = 'block';
            }
        });
    }, 160);
}

function applyServerQuote(quote) {
    const totalEl = document.getElementById('cart-total-price');
    if (totalEl) totalEl.textContent = `${CONFIG.defaultCurrency}${Number(quote.total).toFixed(2)}`;

    document.querySelectorAll('.cart-item').forEach(row => {
        const line = quote.lines.find(item => item.id === String(row.dataset.productId));
        if (!line) return;
        const nameEl = row.querySelector('.cart-item-name');
        const subEl = row.querySelector('.cart-item-subtotal');
        if (nameEl) nameEl.textContent = line.name;
        if (subEl) subEl.textContent = `${CONFIG.defaultCurrency}${Number(line.lineTotal).toFixed(2)}`;
    });

    const hintEl = document.getElementById('cart-tier-hint');
    if (hintEl) {
        if (quote.appliedDiscount) {
            let msg = `已省 ${CONFIG.defaultCurrency}${quote.appliedDiscount.amount} / Ahorras ${CONFIG.defaultCurrency}${quote.appliedDiscount.amount}`;
            if (quote.nextTier) {
                msg += `　再买 ${CONFIG.defaultCurrency}${Number(quote.nextTier.remaining).toFixed(2)} 省 ${CONFIG.defaultCurrency}${quote.nextTier.amount}`;
            }
            hintEl.innerHTML = `${icon('gift')} ${msg}`;
            hintEl.classList.add('active');
            hintEl.style.display = 'flex';
        } else if (quote.nextTier) {
            const remaining = Number(quote.nextTier.remaining).toFixed(2);
            hintEl.innerHTML = `${icon('gift')} 再买 ${CONFIG.defaultCurrency}${remaining} 立减 ${CONFIG.defaultCurrency}${quote.nextTier.amount} / Gasta ${CONFIG.defaultCurrency}${remaining} más y ahorra ${CONFIG.defaultCurrency}${quote.nextTier.amount}`;
            hintEl.classList.remove('active');
            hintEl.style.display = 'flex';
        } else {
            hintEl.style.display = 'none';
        }
    }

    const summaryEl = document.getElementById('checkout-cart-summary');
    if (summaryEl && document.getElementById('checkout-modal')?.style.display === 'flex') {
        summaryEl.innerHTML = quote.lines.map(line => `
            <div class="checkout-summary-item">
                <span>${line.name} ×${line.quantity}</span>
                <span>${CONFIG.defaultCurrency}${Number(line.lineTotal).toFixed(2)}</span>
            </div>
        `).join('');
    }

    const tieredRow = document.getElementById('tiered-discount-row');
    const tieredEl = document.getElementById('tiered-discount-display');
    if (tieredRow && tieredEl) {
        if (quote.discountAmount > 0) {
            tieredEl.textContent = `-€${Number(quote.discountAmount).toFixed(2)}`;
            tieredRow.style.display = 'flex';
        } else {
            tieredRow.style.display = 'none';
        }
    }
    const totalDisplay = document.getElementById('checkout-total-display');
    const originalEl = document.getElementById('checkout-original-price');
    if (totalDisplay) totalDisplay.textContent = `€${Number(quote.total).toFixed(2)}`;
    if (originalEl) {
        if (quote.discountAmount > 0) {
            originalEl.textContent = `€${(Number(quote.subtotal) + Number(quote.shippingFee)).toFixed(2)}`;
            originalEl.style.display = 'block';
        } else {
            originalEl.style.display = 'none';
        }
    }
    const shippingRow = document.getElementById('shipping-row');
    const shippingEl = document.getElementById('shipping-fee-display');
    if (shippingRow && shippingEl) {
        if (quote.shippingFee > 0) {
            shippingEl.textContent = `€${Number(quote.shippingFee).toFixed(2)}`;
            shippingRow.style.display = 'flex';
        } else if (quote.shippingQuoteRequired) {
            shippingEl.textContent = '另询 WhatsApp / A confirmar';
            shippingRow.style.display = 'flex';
        } else if (quote.deliveryType === 'postal') {
            shippingEl.textContent = '免费 / Gratis';
            shippingRow.style.display = 'flex';
        } else {
            shippingRow.style.display = 'none';
        }
    }
}

function validateCheckoutFields() {
    const value = id => document.getElementById(id)?.value.trim() || '';
    const { deliveryType } = currentDeliveryContext();
    if (!value('checkout-customer-name') || !value('checkout-customer-phone')) return 'missing_customer';
    if (deliveryType === 'delivery') {
        if (getNonFreeQuantity() < 5) return 'delivery_minimum';
        if (!value('checkout-delivery-street')) return 'missing_street';
    }
    if (deliveryType === 'postal' && ['checkout-postal-recipient', 'checkout-postal-street', 'checkout-postal-cp', 'checkout-postal-city'].some(id => !value(id))) {
        return 'missing_postal';
    }
    return null;
}

// 只登记订单：服务器保存后经 Telegram 通知卖家，由卖家联系客户
async function submitOrder() {
    const errorEl = document.getElementById('checkout-error');
    const submitBtn = document.getElementById('checkout-submit');
    const showError = (message) => {
        errorEl.textContent = message;
        errorEl.style.display = 'block';
    };
    if (!cartRequestItems().length) {
        showError(quoteErrorMessage('empty_cart'));
        return;
    }
    const invalid = validateCheckoutFields();
    if (invalid) {
        showError(quoteErrorMessage(invalid));
        return;
    }
    errorEl.style.display = 'none';

    const fields = collectCheckoutFields();
    const orderNumber = 'ORD-' + Date.now();
    const label = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.textContent = TRANSLATIONS[currentLanguage].checkout_submitting;
    try {
        const quote = await fetchServerQuote({
            customerName: fields.name,
            customerPhone: fields.phone,
            address: fields.address,
            deliveryTime: fields.deliveryTime,
            orderNumber
        });
        if (!quote) throw new Error(quoteErrorMessage('empty_cart'));
        applyServerQuote(quote);
        const res = await fetch('/.netlify/functions/submit-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                items: cartRequestItems(),
                customerName: fields.name,
                customerPhone: fields.phone,
                deliveryType: fields.deliveryType,
                address: fields.address,
                deliveryTime: fields.deliveryTime,
                country: fields.country,
                orderNumber,
                agentRef: sessionStorage.getItem('agent_ref') || '',
                ...(currentUser ? { userId: currentUser.id } : {})
            })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) throw new Error(quoteErrorMessage(data.error || 'save_failed'));
        if (data.saved === false) throw new Error(quoteErrorMessage('save_failed'));
        if (activeDiscount) markCodeAsUsed(activeDiscount.code);
        clearCart();
        showOrderDone(data.orderNumber || orderNumber);
    } catch (err) {
        showError(err.message || quoteErrorMessage('save_failed'));
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = label;
    }
}

function showOrderDone(orderNumber) {
    document.getElementById('checkout-step-info').style.display = 'none';
    const done = document.getElementById('checkout-step-done');
    document.getElementById('checkout-done-order').textContent = orderNumber;
    done.style.display = 'block';
    done.focus({ preventScroll: true });
    document.getElementById('checkout-done-close').onclick = () => {
        document.getElementById('checkout-modal').style.display = 'none';
        showPostCheckoutPrompt(orderNumber);
    };
}

// ===== 购物车系统 =====
let cart = [];
const CART_STORAGE_KEY = 'vape_shop_cart';

// 购物车功能
function initCart() {
    loadCartFromStorage();
    updateCartUI();
    setupCartEventListeners();
}

function loadCartFromStorage() {
    try {
        const savedCart = localStorage.getItem(CART_STORAGE_KEY);
        if (savedCart) {
            cart = JSON.parse(savedCart);
            const activeCart = cart.filter(item => !item.isFree);
            if (activeCart.length !== cart.length) {
                cart = activeCart;
                localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
            }
        }
    } catch (error) {
        console.error('加载购物车数据失败:', error);
        cart = [];
    }
}

function saveCartToStorage() {
    try {
        localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    } catch (error) {
        console.error('保存购物车数据失败:', error);
    }
}

function addToCart(product, quantity = 1) {
    const existingItem = cart.find(item => item.id === product.id);

    if (existingItem) {
        existingItem.quantity += quantity;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image || '',
            quantity: quantity
        });
    }

    saveCartToStorage();
    updateCartUI();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCartToStorage();
    updateCartUI();
}

function updateCartItemQuantity(productId, quantity) {
    const item = cart.find(item => item.id === productId);
    if (item) {
        if (quantity <= 0) {
            removeFromCart(productId);
        } else {
            item.quantity = quantity;
            saveCartToStorage();
            updateCartUI();
        }
    }
}

function clearCart() {
    cart = [];
    saveCartToStorage();
    updateCartUI();
}

function getCartTotalItems() {
    return cart.reduce((total, item) => total + item.quantity, 0);
}

function getCartTotalPrice() {
    return cart.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function updateCartUI() {
    // 更新购物车数量
    const cartCount = document.getElementById('cart-count');
    if (cartCount) {
        const totalItems = getCartTotalItems();
        const prev = parseInt(cartCount.textContent) || 0;
        cartCount.textContent = totalItems;
        cartCount.style.display = totalItems > 0 ? 'flex' : 'none';
        // 数字增加时触发跳动动画
        if (totalItems > prev) {
            cartCount.classList.remove('bounce');
            void cartCount.offsetWidth; // 强制重绘
            cartCount.classList.add('bounce');
            cartCount.addEventListener('animationend', () => cartCount.classList.remove('bounce'), { once: true });
        }
    }

    // 更新购物车侧边栏
    updateCartSidebar();
}

function updateCartSidebar() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartEmpty = document.getElementById('cart-empty');
    const cartTotalPrice = document.getElementById('cart-total-price');

    if (!cartItemsContainer || !cartEmpty || !cartTotalPrice) return;

    if (cart.length === 0) {
        cartEmpty.style.display = 'flex';
        cartItemsContainer.style.display = 'none';
    } else {
        cartEmpty.style.display = 'none';
        cartItemsContainer.style.display = 'flex';

        // 清空现有内容
        cartItemsContainer.innerHTML = '';

        // 添加购物车商品
        cart.forEach(item => {
            const cartItemElement = createCartItemElement(item);
            cartItemsContainer.appendChild(cartItemElement);
        });
    }

    if (cart.length === 0) {
        cartTotalPrice.textContent = `${CONFIG.defaultCurrency}0.00`;
        const hintEl = document.getElementById('cart-tier-hint');
        if (hintEl) hintEl.style.display = 'none';
        return;
    }
    cartTotalPrice.textContent = '…';
    scheduleServerQuote();
}

function createCartItemElement(item) {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    itemElement.dataset.productId = item.id;

    const itemImage = item.image || '';
    const imageHtml = itemImage ?
        `<img src="${itemImage}" alt="${item.name}" class="cart-item-image" loading="lazy" decoding="async">` :
        `<div class="product-image-placeholder">
            <svg class="icon" aria-hidden="true"><use href="#i-spark" xlink:href="#i-spark"></use></svg>
        </div>`;

    const quoted = latestQuote?.lines?.find(line => line.id === String(item.id));
    const subtotalText = quoted ? `${CONFIG.defaultCurrency}${Number(quoted.lineTotal).toFixed(2)}` : '…';

    itemElement.innerHTML = `
        <div class="cart-item-image-container">
            ${imageHtml}
        </div>
        <div class="cart-item-details">
            <div class="cart-item-name">${item.name}${item.isFree ? ' <span class="free-badge">免费</span>' : ''}</div>
            <div class="cart-item-subtotal">${item.isFree ? '<span style="color:#16a34a;font-weight:600">免费赠品</span>' : subtotalText}</div>
            <div class="cart-item-controls">
                ${item.isFree ? '' : `
                <div class="quantity-control">
                    <button class="quantity-btn minus" data-product-id="${item.id}">-</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn plus" data-product-id="${item.id}">+</button>
                </div>`}
                <button class="remove-item-btn" data-product-id="${item.id}">
                    <svg class="icon" aria-hidden="true"><use href="#i-trash" xlink:href="#i-trash"></use></svg>
                    <span data-lang-key="remove_from_cart">${TRANSLATIONS[currentLanguage].remove_from_cart}</span>
                </button>
            </div>
        </div>
    `;

    // 添加事件监听器
    const minusBtn = itemElement.querySelector('.quantity-btn.minus');
    const plusBtn = itemElement.querySelector('.quantity-btn.plus');
    const removeBtn = itemElement.querySelector('.remove-item-btn');

    if (minusBtn) minusBtn.addEventListener('click', () => {
        updateCartItemQuantity(item.id, item.quantity - 1);
    });

    if (plusBtn) plusBtn.addEventListener('click', () => {
        const stock = getStockForCartItem(item);
        if (stock !== null && item.quantity >= stock) {
            showStockWarning(stock === 0 ? `${item.name} 已售罄` : `库存不足，仅剩 ${stock} 个`);
            return;
        }
        updateCartItemQuantity(item.id, item.quantity + 1);
    });

    removeBtn.addEventListener('click', () => {
        removeFromCart(item.id);
    });

    return itemElement;
}

function flyToCart(btn, imageSrc) {
    const cartIcon = document.getElementById('cart-toggle');
    if (!cartIcon) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const btnRect = btn.getBoundingClientRect();
    const cartRect = cartIcon.getBoundingClientRect();

    const FLY_SIZE = 72;
    const flyEl = document.createElement('div');
    flyEl.className = 'fly-item';
    if (imageSrc) {
        const img = document.createElement('img');
        img.src = imageSrc;
        img.alt = '';
        flyEl.appendChild(img);
    } else {
        flyEl.classList.add('fly-item--dot');
    }
    document.body.appendChild(flyEl);

    const startX = btnRect.left + btnRect.width / 2 - FLY_SIZE / 2;
    const startY = btnRect.top + btnRect.height / 2 - FLY_SIZE / 2;
    const endX = cartRect.left + cartRect.width / 2 - FLY_SIZE / 2;
    const endY = cartRect.top + cartRect.height / 2 - FLY_SIZE / 2;

    flyEl.style.left = `${startX}px`;
    flyEl.style.top = `${startY}px`;

    const duration = 620;
    const startTime = performance.now();

    function animate(now) {
        const t = Math.min((now - startTime) / duration, 1);
        const ease = 1 - Math.pow(1 - t, 4);
        const arc = Math.sin(Math.PI * t) * -80;
        const x = (endX - startX) * ease;
        const y = (endY - startY) * ease + arc;
        const scale = 1 - t * 0.65;
        const opacity = t > 0.85 ? (1 - t) / 0.15 : 1;
        flyEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
        flyEl.style.opacity = opacity;
        if (t < 1) {
            requestAnimationFrame(animate);
        } else {
            flyEl.remove();
            // 购物车图标弹一下
            cartIcon.classList.remove('cart-bump');
            void cartIcon.offsetWidth;
            cartIcon.classList.add('cart-bump');
        }
    }
    requestAnimationFrame(animate);
}

function showCartNotification(productName, quantity) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.innerHTML = `
        <svg class="icon" aria-hidden="true"><use href="#i-check-circle" xlink:href="#i-check-circle"></use></svg>
        <span>${quantity} × ${productName} 已添加到购物车</span>
    `;

    // 样式
    notification.style.position = 'fixed';
    notification.style.top = '20px';
    notification.style.right = '20px';
    notification.style.backgroundColor = 'var(--color-black)';
    notification.style.color = 'var(--color-white)';
    notification.style.padding = 'var(--space-md) var(--space-lg)';
    notification.style.borderRadius = 'var(--radius-md)';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.style.zIndex = '1002';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.gap = 'var(--space-sm)';
    notification.style.animation = 'slideIn 0.3s ease';

    document.body.appendChild(notification);

    // 3秒后移除
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function setupCartEventListeners() {
    // 购物车切换按钮
    const cartToggle = document.getElementById('cart-toggle');
    const cartClose = document.getElementById('cart-close');
    const cartOverlay = document.getElementById('cart-overlay');
    const cartCheckout = document.getElementById('cart-checkout');
    const cartClear = document.getElementById('cart-clear');

    if (cartToggle) {
        cartToggle.addEventListener('click', toggleCartSidebar);
    }

    if (cartClose) {
        cartClose.addEventListener('click', toggleCartSidebar);
    }

    if (cartOverlay) {
        cartOverlay.addEventListener('click', toggleCartSidebar);
    }

    // 窗口resize时同步遮罩状态
    window.addEventListener('resize', () => {
        const sidebar = document.getElementById('cart-sidebar');
        const overlay = document.getElementById('cart-overlay');
        if (!sidebar || !overlay) return;
        if (sidebar.classList.contains('open')) {
            if (window.innerWidth >= 1100) overlay.classList.remove('show');
            else overlay.classList.add('show');
        }
    });

    if (cartCheckout) {
        cartCheckout.addEventListener('click', async () => {
            if (cart.length === 0) {
                alert(TRANSLATIONS[currentLanguage].cart_empty);
                return;
            }
            // 结账前刷新库存，确保数据最新
            await loadInventory();
            // 检查所有商品库存
            const insufficient = cart.filter(item => {
                if (item.isFree) return false;
                const stock = getStockForCartItem(item);
                return stock !== null && item.quantity > stock;
            });
            if (insufficient.length > 0) {
                const msg = insufficient.map(item => {
                    const stock = getStockForCartItem(item);
                    return stock === 0 ? `「${item.name}」已售罄` : `「${item.name}」库存不足，仅剩 ${stock} 个`;
                }).join('\n');
                showStockWarning(msg.replace(/\n/g, ' / '));
                return;
            }
            // 关闭购物车侧边栏
            const cartSidebar = document.getElementById('cart-sidebar');
            const cartOverlay = document.getElementById('cart-overlay');
            if (cartSidebar) { cartSidebar.classList.remove('open'); document.body.classList.remove('cart-open'); }
            if (cartOverlay) cartOverlay.classList.remove('show');
            openCartCheckoutModal();
        });
    }

    if (cartClear) {
        cartClear.addEventListener('click', () => {
            if (cart.length === 0) return;
            if (confirm('确定要清空购物车吗？')) {
                clearCart();
            }
        });
    }

    document.getElementById('time-slots')?.addEventListener('click', (event) => {
        const btn = event.target.closest('.time-slot');
        if (!btn) return;
        document.querySelectorAll('#time-slots .time-slot').forEach(el => {
            el.classList.toggle('active', el === btn);
        });
    });
}

function toggleCartSidebar() {
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    if (!cartSidebar) return;
    const isOpen = cartSidebar.classList.contains('open');
    if (isOpen) {
        cartSidebar.classList.remove('open');
        if (cartOverlay) cartOverlay.classList.remove('show');
        document.body.classList.remove('cart-open');
    } else {
        cartSidebar.classList.add('open');
        // 仅在移动端显示遮罩
        if (window.innerWidth < 1100 && cartOverlay) cartOverlay.classList.add('show');
        document.body.classList.add('cart-open');
    }
}

function openCartSidebar() {
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');
    if (!cartSidebar || cartSidebar.classList.contains('open')) return;
    cartSidebar.classList.add('open');
    if (window.innerWidth < 1100 && cartOverlay) cartOverlay.classList.add('show');
    document.body.classList.add('cart-open');
}

function openCartCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    const summaryEl = document.getElementById('checkout-cart-summary');
    const totalEl = document.getElementById('checkout-total-display');
    const errorEl = document.getElementById('checkout-error');
    const stepInfo = document.getElementById('checkout-step-info');

    // 重置状态
    stepInfo.style.display = 'block';
    document.getElementById('checkout-step-done').style.display = 'none';
    errorEl.style.display = 'none';
    document.getElementById('checkout-customer-name').value = '';
    document.getElementById('checkout-customer-phone').value = '';
    // 重置优惠码
    clearDiscount();
    const couponInput = document.getElementById('coupon-input');
    const couponResult = document.getElementById('coupon-result');
    const couponBtn = document.getElementById('coupon-apply-btn');
    if (couponInput) { couponInput.value = ''; couponInput.disabled = false; }
    if (couponResult) { couponResult.style.display = 'none'; }
    if (couponBtn) { couponBtn.textContent = '使用'; couponBtn.disabled = false; }
    ['checkout-delivery-street','checkout-delivery-floor','checkout-delivery-district'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('address-group').style.display = 'none';
    document.getElementById('time-group').style.display = 'none';
    document.getElementById('postal-group').style.display = 'none';
    document.getElementById('pickup-info-group').style.display = 'block';
    ['checkout-postal-recipient','checkout-postal-street','checkout-postal-floor','checkout-postal-cp','checkout-postal-city','checkout-postal-province'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const postalCountry = document.getElementById('checkout-postal-country');
    const postalQuoteNote = document.getElementById('postal-quote-note');
    function refreshPostalCountryUI() {
        if (postalQuoteNote) postalQuoteNote.style.display = isShippingQuoteRequired() ? 'block' : 'none';
        updateCheckoutTotal();
    }
    if (postalCountry) {
        postalCountry.value = 'ES';
        postalCountry.onchange = refreshPostalCountryUI;
    }
    refreshPostalCountryUI();
    document.getElementById('btn-pickup').classList.add('active');
    document.getElementById('btn-delivery').classList.remove('active');
    document.getElementById('btn-postal').classList.remove('active');

    const setDeliveryMode = (mode) => {
        ['btn-pickup', 'btn-delivery', 'btn-postal'].forEach(id => document.getElementById(id).classList.remove('active'));
        document.getElementById(`btn-${mode}`).classList.add('active');
        document.getElementById('pickup-info-group').style.display = mode === 'pickup' ? 'block' : 'none';
        document.getElementById('address-group').style.display = mode === 'delivery' ? 'block' : 'none';
        document.getElementById('time-group').style.display = mode === 'delivery' ? 'block' : 'none';
        document.getElementById('postal-group').style.display = mode === 'postal' ? 'block' : 'none';
        updateCheckoutTotal();
        errorEl.style.display = 'none';
    };

    // 自取 / 外送 / 邮寄切换
    const totalQty = getNonFreeQuantity();
    document.getElementById('btn-pickup').onclick = () => setDeliveryMode('pickup');
    document.getElementById('btn-delivery').onclick = () => {
        if (totalQty < 5) {
            errorEl.textContent = '外送至少需要5件商品 / Se necesitan mínimo 5 unidades para entrega a domicilio';
            errorEl.style.display = 'block';
            return;
        }
        setDeliveryMode('delivery');
    };
    document.getElementById('btn-postal').onclick = () => setDeliveryMode('postal');

    // 填充购物车摘要
    summaryEl.innerHTML = '<div class="checkout-summary-item"><span>正在计算价格… / Calculando…</span></div>';
    updateCheckoutTotal();

    modal.style.display = 'flex';

    // 关闭/返回按钮
    document.getElementById('checkout-modal-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    document.getElementById('checkout-back-to-cart').onclick = () => {
        modal.style.display = 'none';
        openCartSidebar();
    };
    document.getElementById('checkout-submit').onclick = () => submitOrder();
    document.getElementById('checkout-customer-name').focus({ preventScroll: true });
}

// ===== 双语文本数据 =====
const TRANSLATIONS = {
    es: {
        // 导航
        store_name: '口粮专卖店',
        logo_subtitle: '口粮专卖店',
        products: 'Productos',
        about: 'Nosotros',
        contact: 'Contacto',

        // 英雄区域
        hero_kicker: 'Selección para adultos',
        hero_title: 'Dash',
        hero_subtitle: '4000 puffs · Consulte sabores, disponibilidad y especificaciones',
        hero_spec_puffs: 'puffs',
        hero_spec_flavors: 'sabores',
        hero_spec_price: 'precio',
        hero_cta_flavors: 'Elegir sabor',
        hero_cta_all: 'Ver todo',

        // 产品区域
        products_title: 'Productos Destacados',
        products_subtitle: 'Múltiples tipos, múltiples sabores — encuentra el tuyo',

        // 产品描述
        dash_desc: '4000 puffs · Consulte sabores, disponibilidad y especificaciones',
        icemax_desc: 'Sabor intenso a menta con efecto refrescante',
        lil_black_desc: 'Compacto y discreto, ideal para llevar',
        iceking_desc: 'Sabor frío potente, experiencia refrescante extrema',

        // 联系
        contact_title: 'Contacto',
        contact_lede: 'Tras recibir su pedido, el vendedor se pondrá en contacto con usted para confirmar los productos y la hora de recogida o entrega. Si prefiere una atención personalizada, escríbanos por WhatsApp.',
        whatsapp_cta: 'Escríbanos por WhatsApp',
        whatsapp_question: '¿Alguna duda? Pregúntenos por WhatsApp',

        // 管理员区域
        admin_title: 'Gestión de Productos',
        admin_subtitle: 'Añadir o editar información de productos',
        product_name: 'Nombre del Producto',
        price: 'Precio (€)',
        desc_es: 'Descripción en Español',
        desc_zh: 'Descripción en Chino',
        image_url: 'URL de la Imagen',
        add_product: 'Añadir Producto',
        clear: 'Limpiar',

        // 按钮
        buy_now: 'Comprar Ahora',
        edit_product: 'Editar',
        delete_product: 'Eliminar',

        // 下单
        checkout_submit: 'Enviar pedido',
        checkout_submitting: 'Enviando…',
        order_done_title: 'Pedido enviado',
        order_number_label: 'Pedido',
        order_done_contact: 'El vendedor se pondrá en contacto con usted para confirmar los productos y la hora de recogida o entrega.',
        order_done_whatsapp: 'Si prefiere una atención personalizada, también puede escribirnos por WhatsApp.',
        order_done_close: 'Cerrar',
        cancel: 'Cancelar',

        // 关于
        about_title: 'Sobre Nosotros',
        about_speed_title: 'Entrega Express el Mismo Día',
        about_speed_desc: 'Procesamos tu pedido al instante. Entrega en Madrid el mismo día — llegar rápido no es una opción, es nuestra promesa.',
        about_quality_title: 'Productos de Calidad Seleccionados',
        about_quality_desc: 'Evaluamos regularmente a nuestros proveedores para garantizar que cada producto cumpla con los más altos estándares de calidad.',
        about_service_title: 'Atención Rápida y Cercana',
        about_service_desc: 'Respondemos a cada mensaje sin demora. Olvídate de esperar — nuestro equipo está siempre disponible para atenderte.',
        about_offers_title: 'Precios transparentes',
        about_offers_desc: 'Todos los precios se muestran claramente para que puedas confirmar el producto y los gastos de envío antes de comprar.',

        // 页脚
        footer_desc: 'Tienda de vapeadores premium en España',
        copyright: '© 2026 口粮专卖店. Todos los derechos reservados.',

        // 购物车
        cart_title: 'Carrito de compras',
        cart_empty: 'El carrito está vacío',
        cart_total: 'Total:',
        cart_checkout: 'Tramitar pedido',
        cart_clear: 'Vaciar carrito',
        add_to_cart: 'Añadir al carrito',
        added_to_cart: 'Añadido',
        remove_from_cart: 'Eliminar',
        quantity: 'Cantidad',
        subtotal: 'Subtotal'
    },

    zh: {
        // 导航
        store_name: '口粮专卖店',
        logo_subtitle: '西班牙优质电子烟',
        products: '产品',
        about: '关于',
        contact: '联系',

        // 英雄区域
        hero_kicker: '成年人精选',
        hero_title: '鸭嘴兽 Dash',
        hero_subtitle: '4000口量 · 查看口味、库存与产品规格',
        hero_spec_puffs: '口（整机）',
        hero_spec_flavors: '种口味',
        hero_spec_price: '目录价',
        hero_cta_flavors: '选择口味',
        hero_cta_all: '全部产品',

        // 产品区域
        products_title: '精选产品',
        products_subtitle: '多种类型，多种口味，总有一款适合您',

        // 产品描述
        dash_desc: '人体工学设计，口感柔和持久',
        icemax_desc: '强劲薄荷口味，清凉感十足',
        lil_black_desc: '小巧隐蔽，便携设计',
        iceking_desc: '极强冰感，极致清凉体验',

        // 联系
        contact_title: '联系我们',
        contact_lede: '下单后，卖家会主动联系您确认商品、取货或配送时间。想一对一沟通，可以直接在 WhatsApp 上给我们发消息。',
        whatsapp_cta: '在 WhatsApp 上联系我们',
        whatsapp_question: '有疑问？在 WhatsApp 上问我们',

        // 管理员区域
        admin_title: '产品管理',
        admin_subtitle: '添加或编辑产品信息',
        product_name: '产品名称',
        price: '价格 (€)',
        desc_es: '西班牙语描述',
        desc_zh: '中文描述',
        image_url: '图片URL',
        add_product: '添加产品',
        clear: '清空',

        // 按钮
        buy_now: '立即购买',
        edit_product: '编辑',
        delete_product: '删除',

        // 下单
        checkout_submit: '提交订单',
        checkout_submitting: '提交中…',
        order_done_title: '订单已提交',
        order_number_label: '订单号',
        order_done_contact: '卖家会尽快联系您，确认商品和取货或配送时间。',
        order_done_whatsapp: '如需一对一处理，也可以直接在 WhatsApp 上给我们发消息。',
        order_done_close: '完成',
        cancel: '取消',

        // 关于
        about_title: '关于我们',
        about_speed_title: '当天极速配送',
        about_speed_desc: '收到订单立即处理，马德里范围内当天送达，以最快的速度送到您手中是我们的初衷。',
        about_quality_title: '严选优质产品',
        about_quality_desc: '我们定期严格筛选合作工厂，每一支产品都经过品质把关，只将最好的带给您。',
        about_service_title: '高效贴心服务',
        about_service_desc: '告别消息不回、久等不达。我们与客户之间的对接极为迅速，您的每一条消息都会得到及时回复。',
        about_offers_title: '价格透明',
        about_offers_desc: '所有商品价格清晰标示，下单前即可确认商品与配送费用。',

        // 页脚
        footer_desc: '西班牙优质口粮专卖店',
        copyright: '© 2026 口粮专卖店. 保留所有权利。',

        // 购物车
        cart_title: '购物车',
        cart_empty: '购物车是空的',
        cart_total: '总计:',
        cart_checkout: '确认订单',
        cart_clear: '清空购物车',
        add_to_cart: '加入购物车',
        added_to_cart: '已加入',
        remove_from_cart: '删除',
        quantity: '数量',
        subtotal: '小计'
    }
};

// ===== 产品数据 =====
let products = [
    {
        id: 1,
        name: '鸭嘴兽 (Dash)',
        price: 17.9,
        description: {
            es: '4000 puffs · Consulte sabores, disponibilidad y especificaciones',
            zh: '4000口量 · 查看口味、库存与产品规格'
        },
        image: 'images/dash/coconut-water.webp',
        flavors: [
            { name: 'Jasmine LongJing Tea', nameCn: '龙井', image: 'images/dash/jasmine-longjing.webp', tags: [{t:'清新',c:'fresh'},{t:'茶香',c:'fresh'}] },
            { name: 'Lemon Tea', nameCn: '柠檬茶', image: 'images/dash/sparkling-iced-lemon-tea.webp', tags: [{t:'酸甜',c:'sour'},{t:'清爽',c:'fresh'}] },
            { name: 'Green Grape', nameCn: '青提', image: 'images/dash/green-grape.webp', tags: [{t:'甜润',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Sweet Honeydew', nameCn: '甜蜜瓜', image: 'images/dash/sweet-honeydew.webp', tags: [{t:'甜',c:'sweet'},{t:'清甜',c:'sweet'}] },
            { name: 'Crystal Grape', nameCn: '紫晶葡萄', image: 'images/dash/tangy-grape.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Mineral Water', nameCn: '矿泉水', image: 'images/dash/mineral-water.webp', tags: [{t:'清淡',c:'fresh'},{t:'清爽',c:'fresh'}] },
            { name: 'Coconut Water', nameCn: '椰子水', image: 'images/dash/coconut-water.webp', tags: [{t:'清甜',c:'sweet'},{t:'椰香',c:'rich'}] },
            { name: 'Alpine White Peach', nameCn: '高山白桃', image: 'images/dash/alpine-white-peach.webp', tags: [{t:'清甜',c:'sweet'},{t:'果香',c:'sweet'},{t:'清爽',c:'fresh'}] },
            { name: 'Floral Oolong', nameCn: '花香乌龙', image: 'images/dash/floral-oolong.webp', tags: [{t:'花香',c:'fresh'},{t:'茶香',c:'fresh'},{t:'醇厚',c:'rich'}] },
            { name: 'Honey Yuzu Tea', nameCn: '蜂蜜柚子茶', image: 'images/dash/honey-yuzu-tea.webp', tags: [{t:'酸甜',c:'sour'},{t:'蜜香',c:'rich'},{t:'茶香',c:'fresh'}] },
            { name: 'Salted Fizz', nameCn: '海盐气泡', image: 'images/dash/salted-fizz.webp', tags: [{t:'酸甜',c:'sour'},{t:'咸甜',c:'rich'},{t:'清爽',c:'fresh'}] },
            { name: 'Kiwi Ice', nameCn: '猕猴桃冰', image: 'images/dash/kiwi-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Red Wine Ice', nameCn: '红酒冰', image: 'images/dash/red-wine-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'醇厚',c:'rich'},{t:'果香',c:'sweet'}] },
            { name: 'Matcha Smoothie', nameCn: '抹茶思慕雪', image: 'images/dash/matcha-smoothie.webp', tags: [{t:'醇厚',c:'rich'},{t:'茶香',c:'fresh'}] },
            { name: 'Peach Ice', nameCn: '水蜜桃冰', image: 'images/dash/peach-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Pink Guava', nameCn: '粉红番石榴', image: 'images/dash/pink-guava.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Black Dragon Ice', nameCn: '黑龙冰', image: 'images/dash/black-dragon-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'清爽',c:'fresh'}] },
            { name: 'Corn Gelato', nameCn: '玉米冰激凌', image: 'images/dash/corn-gelato.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: 'White Freeze', nameCn: '老冰棍', image: 'images/dash/white-freeze.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Passion Grapefruit', nameCn: '百香西柚', image: 'images/dash/passion-grapefruit.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Lush Ice', nameCn: '西瓜冰', image: 'images/dash/lush-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Lemon Pineapple', nameCn: '柠檬菠萝', image: 'images/dash/lemon-pineapple.webp', tags: [{t:'酸甜',c:'sour'},{t:'清爽',c:'fresh'}] },
            { name: 'Green Apple Ice', nameCn: '青苹果冰', image: 'images/dash/green-apple-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸甜',c:'sour'}] },
            { name: 'Tea Guan Yin King', nameCn: '铁观音', image: 'images/dash/tea-guan-yin-king.webp', tags: [{t:'茶香',c:'fresh'},{t:'醇厚',c:'rich'}] },
            { name: 'Taro Ice', nameCn: '香芋冰', image: 'images/dash/taro-ice.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/dash/lychee-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Hibiscus Ice Tea', nameCn: '洛神花冰茶', image: 'images/dash/hibiscus-ice-tea.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸甜',c:'sour'},{t:'花香',c:'fresh'}] },
            { name: 'Ludou Ice', nameCn: '绿豆冰', image: 'images/dash/ludou-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'清甜',c:'sweet'}] },
            { name: 'Lime Ice', nameCn: '青柠冰', image: 'images/dash/lime-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸',c:'sour'},{t:'清爽',c:'fresh'}] }
        ]
    },
    {
        id: 2,
        name: '冰爆 (IceMax)',
        price: 22.9,
        description: {
            es: 'Ultra Freeze Taste · 12000 puffs · 3% Nicotine',
            zh: '极致冰爽口感 · 12000口 · 3%尼古丁'
        },
        image: 'images/icemax/passion-grapefruit.webp',
        flavors: [
            { name: 'Passion Grapefruit', nameCn: '百香西柚', image: 'images/icemax/passion-grapefruit.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'},{t:'冰凉',c:'ice'}] },
            { name: 'Jasmine Milk Tea', nameCn: '茉莉奶茶', image: 'images/icemax/jasmine-milk-tea.webp', tags: [{t:'醇厚',c:'rich'},{t:'花香',c:'fresh'},{t:'冰凉',c:'ice'}] },
            { name: 'Iced Pocari', nameCn: '冰镇宝矿力', image: 'images/icemax/iced-pocari.webp', tags: [{t:'冰凉',c:'ice'},{t:'清爽',c:'fresh'}] },
            { name: 'Coconut Water', nameCn: '椰子水', image: 'images/icemax/coconut-water.webp', tags: [{t:'清甜',c:'sweet'},{t:'椰香',c:'rich'},{t:'冰凉',c:'ice'}] },
            { name: 'Miami Mint', nameCn: '迈阿密薄荷', image: 'images/icemax/miami-mint.webp', tags: [{t:'强冰',c:'ice'},{t:'清凉',c:'fresh'}] },
            { name: 'Longjing Ice Tea', nameCn: '龙井冰茶', image: 'images/icemax/longjing-ice-tea.webp', tags: [{t:'冰凉',c:'ice'},{t:'茶香',c:'fresh'}] },
            { name: 'Green Grape Ice', nameCn: '青葡萄冰', image: 'images/icemax/green-grape-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Fresh Lemon', nameCn: '新鲜柠檬', image: 'images/icemax/fresh-lemon.webp', tags: [{t:'酸',c:'sour'},{t:'清爽',c:'fresh'},{t:'冰凉',c:'ice'}] },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/icemax/lychee-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Peach Oolong', nameCn: '水蜜桃乌龙', image: 'images/icemax/peach-oolong.webp', tags: [{t:'甜',c:'sweet'},{t:'茶香',c:'fresh'},{t:'冰凉',c:'ice'}] },
            { name: 'Lemon Pineapple', nameCn: '柠檬菠萝', image: 'images/icemax/lemon-pineapple.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'},{t:'冰凉',c:'ice'}] },
            { name: 'Sour Guava Ice', nameCn: '巨峰葡萄', image: 'images/icemax/sour-guava-ice.webp', tags: [{t:'酸',c:'sour'},{t:'清爽',c:'fresh'},{t:'冰凉',c:'ice'}] },
            { name: 'Tangy Grape', nameCn: '番石榴', image: 'images/icemax/tangy-grape.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'},{t:'冰凉',c:'ice'}] }
        ]
    },
    {
        id: 3,
        name: '小黑条 (Quik)',
        price: 17.9,
        description: {
            es: 'Quik 5000 puffs · Compacto y discreto, ideal para llevar',
            zh: 'Quik 5000口 · 小巧便携，随时随地'
        },
        image: 'images/lilblack/peach.webp',
        flavors: [
            { name: 'Longan', nameCn: '龙眼', image: 'images/lilblack/longan.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Banana', nameCn: '香蕉', image: 'images/lilblack/banana.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: 'Durian', nameCn: '榴莲', image: 'images/lilblack/durian.webp', tags: [{t:'浓郁',c:'rich'},{t:'醇厚',c:'rich'}] },
            { name: 'Honeydew', nameCn: '蜜露', image: 'images/lilblack/honeydew.webp', tags: [{t:'清甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Mango', nameCn: '芒果', image: 'images/lilblack/mango.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Coconut Ice', nameCn: '椰子冰', image: 'images/lilblack/coconut-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'椰香',c:'rich'}] },
            { name: 'Peach', nameCn: '水蜜桃', image: 'images/lilblack/peach.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Guava', nameCn: '番石榴', image: 'images/lilblack/guava.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Lychee', nameCn: '荔枝', image: 'images/lilblack/lychee.webp', tags: [{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] }
        ]
    },
    {
        id: 4,
        name: '冰王 (Elfbar IceKing)',
        price: 45,
        description: {
            es: 'Elfbar IceKing · 40000 caladas · Sabor frío potente, experiencia refrescante extrema',
            zh: 'Elfbar IceKing · 40000口 · 极强冰感，极致清凉体验'
        },
        image: 'images/iceking/grape-ice.webp',
        flavors: [
            { name: 'Jasmine Longjing', nameCn: '茉莉龙井', image: 'images/iceking/jasmine-longjing.webp', tags: [{t:'花香',c:'fresh'},{t:'茶香',c:'fresh'},{t:'冰凉',c:'ice'}] },
            { name: 'Salted Lemon', nameCn: '海盐柠檬', image: 'images/iceking/salted-lemon.webp', tags: [{t:'酸',c:'sour'},{t:'咸甜',c:'rich'},{t:'冰凉',c:'ice'}] },
            { name: 'Tieguanyin', nameCn: '铁观音', image: 'images/iceking/tieguanyin.webp', tags: [{t:'茶香',c:'fresh'},{t:'醇厚',c:'rich'},{t:'冰凉',c:'ice'}] },
            { name: 'Grape Ice', nameCn: '黑葡萄冰', image: 'images/iceking/grape-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Green Grape Ice', nameCn: '青葡萄冰', image: 'images/iceking/green-grape-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'清甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Green Tea', nameCn: '绿茶', image: 'images/iceking/green-tea.webp', tags: [{t:'清新',c:'fresh'},{t:'茶香',c:'fresh'},{t:'冰凉',c:'ice'}] }
        ]
    },
    {
        id: 5,
        name: '高维 (GOwif)',
        price: 25.9,
        description: {
            es: 'GOwif · 18000 caladas · Sabores únicos y refrescantes',
            zh: 'GOwif · 18000口 · 独特清爽口味'
        },
        image: 'images/gowif/passion-fruit.webp',
        flavors: [
            { name: 'Peach Tea', nameCn: '桃茶', image: 'images/gowif/peach-tea.webp', tags: [{t:'甜',c:'sweet'},{t:'茶香',c:'fresh'}] },
            { name: 'Passion Fruit', nameCn: '百香果', image: 'images/gowif/passion-fruit.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Green Bean Ice', nameCn: '绿豆', image: 'images/gowif/green-bean-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'清甜',c:'sweet'}] },
            { name: 'Crispy Apple', nameCn: '脆苹果', image: 'images/gowif/crispy-apple.webp', tags: [{t:'酸甜',c:'sour'},{t:'清爽',c:'fresh'}] },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/gowif/lychee-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Plum Pineapple', nameCn: '话梅菠萝', image: 'images/gowif/plum-pineapple.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Fresh Mint', nameCn: '清凉薄荷', image: 'images/gowif/fresh-mint.webp', tags: [{t:'强冰',c:'ice'},{t:'清凉',c:'fresh'}] },
            { name: 'Watermelon Ice', nameCn: '西瓜冰', image: 'images/gowif/watermelon-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Green Grape', nameCn: '青葡萄', image: 'images/gowif/green-grape.webp', tags: [{t:'清甜',c:'sweet'},{t:'果香',c:'sweet'}] },
            { name: 'Lime Ice', nameCn: '青柠冰', image: 'images/gowif/lime-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸',c:'sour'},{t:'清爽',c:'fresh'}] },
            { name: 'Jasmine Longjing', nameCn: '茉莉龙井', image: 'images/gowif/jasmine-longjing.webp', tags: [{t:'花香',c:'fresh'},{t:'茶香',c:'fresh'}] },
            { name: 'Blueberry Raspberry', nameCn: '蓝莓覆盆子', image: 'images/gowif/blueberry-raspberry.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Bayberry Green Salt', nameCn: '杨梅绿盐', image: 'images/gowif/bayberry-green-salt.webp', tags: [{t:'酸甜',c:'sour'},{t:'咸甜',c:'rich'}] },
            { name: 'Taro Ice Cream', nameCn: '香芋冰淇淋', image: 'images/gowif/taro-ice-cream.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: '100 Plus', nameCn: '100 Plus', image: 'images/gowif/100-plus.webp', tags: [{t:'清爽',c:'fresh'},{t:'果香',c:'sweet'}] }
        ]
    },
    {
        id: 6,
        name: 'RELX 悦刻幻五代烟弹 (3支装)',
        price: 14.9,
        description: {
            es: 'RELX Phantom Pod · 3 unidades · Compatible con RELX Phantom · Sabores premium',
            zh: 'RELX 幻五代烟弹 · 3支装 · 适配幻五代主机 · 精选口味'
        },
        image: 'images/relx/mixed-berries.webp',
        flavors: [
            { name: 'Mixed Berries', nameCn: '混合浆果', image: 'images/relx/mixed-berries.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Taro Ice Cream', nameCn: '香芋冰淇淋', image: 'images/relx/taro-ice-cream.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: 'Tieguanyin', nameCn: '铁观音', image: 'images/relx/tieguanyin.webp', tags: [{t:'茶香',c:'fresh'},{t:'醇厚',c:'rich'}] },
            { name: 'Mineral Water', nameCn: '矿泉水', image: 'images/relx/mineral-water.webp', tags: [{t:'清淡',c:'fresh'},{t:'清爽',c:'fresh'}] },
            { name: 'Coconut Ice', nameCn: '椰子冰', image: 'images/relx/coconut-ice.webp', tags: [{t:'冰凉',c:'ice'},{t:'椰香',c:'rich'}] },
            { name: 'Sprite Lime', nameCn: '雪碧', image: 'images/relx/sprite-lime.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸甜',c:'sour'},{t:'清爽',c:'fresh'}] },
            { name: 'Yogurt', nameCn: '酸奶', image: 'images/relx/yogurt.webp', tags: [{t:'甜',c:'sweet'},{t:'醇厚',c:'rich'}] },
            { name: 'Plum', nameCn: '西梅', image: 'images/relx/plum.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Lemon Cherry', nameCn: '爆柠樱桃', image: 'images/relx/lemon-cherry.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'},{t:'冰凉',c:'ice'}] },
            { name: 'Peach Oolong', nameCn: '桃气乌龙', image: 'images/relx/peach-oolong.webp', tags: [{t:'甜',c:'sweet'},{t:'茶香',c:'fresh'}] },
            { name: 'Guava', nameCn: '番石榴', image: 'images/relx/guava.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Coffee', nameCn: '咖啡', image: 'images/relx/coffee.webp', tags: [{t:'醇厚',c:'rich'},{t:'苦香',c:'rich'}] },
            { name: 'Mojito', nameCn: '莫吉托', image: 'images/relx/mojito.webp', tags: [{t:'清爽',c:'fresh'},{t:'酸甜',c:'sour'}] },
            { name: 'Iced Black Tea', nameCn: '冰红茶', image: 'images/relx/iced-black-tea.webp', tags: [{t:'冰凉',c:'ice'},{t:'茶香',c:'fresh'}] },
            { name: 'Passion Fruit', nameCn: '百香果', image: 'images/relx/passion-fruit.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] },
            { name: 'Ice Pop', nameCn: '冰棍', image: 'images/relx/ice-pop.webp', tags: [{t:'冰凉',c:'ice'},{t:'甜',c:'sweet'}] },
            { name: 'Mung Bean', nameCn: '绿豆', image: 'images/relx/mung-bean.webp', tags: [{t:'冰凉',c:'ice'},{t:'清甜',c:'sweet'}] },
            { name: 'Longjing', nameCn: '龙井', image: 'images/relx/longjing.webp', tags: [{t:'茶香',c:'fresh'},{t:'清新',c:'fresh'}] },
            { name: 'Iced Lemon Mint', nameCn: '冰柠薄荷', image: 'images/relx/iced-lemon-mint.webp', tags: [{t:'冰凉',c:'ice'},{t:'酸',c:'sour'},{t:'清凉',c:'fresh'}] },
            { name: 'Jasmine Tea', nameCn: '茉莉花茶', image: 'images/relx/jasmine-tea.webp', tags: [{t:'花香',c:'fresh'},{t:'茶香',c:'fresh'}] },
            { name: 'Vitamin C Orange', nameCn: 'C味鲜橙', image: 'images/relx/vitamin-c-orange.webp', tags: [{t:'酸甜',c:'sour'},{t:'果香',c:'sweet'}] }
        ]
    }
];

// ===== 状态管理 =====
let currentLanguage = detectLanguage();

// ===== DOM 元素 =====
const domElements = {
    productsGrid: document.getElementById('products-grid')
};

// ===== 语言切换功能 =====
function detectLanguage() {
    try {
        const saved = localStorage.getItem('shop_lang');
        if (saved === 'zh' || saved === 'es') return saved;
    } catch (e) {}
    const browserLang = (navigator.language || 'zh').toLowerCase();
    if (browserLang.startsWith('es')) return 'es';
    if (browserLang.startsWith('zh')) return 'zh';
    return 'zh';
}

function initLanguageSwitcher() {
    document.querySelectorAll('.lang-btn').forEach(button => {
        button.addEventListener('click', () => {
            try { localStorage.setItem('shop_lang', button.dataset.lang); } catch (e) {}
            switchLanguage(button.dataset.lang);
        });
    });
}

function switchLanguage(lang) {
    currentLanguage = lang;
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === lang);
    });

    // 更新html lang属性
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'es';

    // 更新body类名
    document.body.classList.remove('es', 'zh');
    document.body.classList.add(lang);

    // 更新所有带data-lang-key的元素
    document.querySelectorAll('[data-lang-key]').forEach(element => {
        const key = element.dataset.langKey;
        if (TRANSLATIONS[lang][key]) {
            element.textContent = TRANSLATIONS[lang][key];
        }
    });

    // 重新渲染产品卡片
    renderProducts();
    applyInventoryToUI();
}

// ===== 产品渲染功能 =====
function renderProducts() {
    if (!domElements.productsGrid) return;
    domElements.productsGrid.innerHTML = '';

    const homeProductOrder = [1, 5, 2, 6, 3, 4];

    // 产品排序：全部售罄的排最后
    const sorted = products.filter(product => homeProductOrder.includes(product.id)).sort((a, b) => {
        const allSoldOut = p => p.flavors
            ? p.flavors.every(f => isSoldOut(p.id, f.name))
            : isSoldOut(p.id, 'default');
        return allSoldOut(a) - allSoldOut(b) || homeProductOrder.indexOf(a.id) - homeProductOrder.indexOf(b.id);
    });

    sorted.forEach(product => {
        domElements.productsGrid.appendChild(createProductCard(product));
    });
}

function syncQuickAdd(card, product, flavor) {
    const btn = card.querySelector('.add-to-cart-btn');
    if (!btn || !flavor) return;
    const soldOut = isSoldOut(product.id, flavor.name);
    btn.disabled = soldOut;
    const flavorLabel = currentLanguage === 'zh' ? flavor.nameCn : flavor.name;
    btn.setAttribute('aria-label', soldOut
        ? `${product.name} ${flavorLabel} 已售罄 / Agotado`
        : `${TRANSLATIONS[currentLanguage].add_to_cart}: ${product.name} ${flavorLabel}`);
}

function confirmCardAdd(btn) {
    const label = btn.querySelector('.card-add-label');
    if (!label) return;
    clearTimeout(btn._addedTimer);
    btn.classList.add('is-added');
    label.textContent = TRANSLATIONS[currentLanguage].added_to_cart;
    btn._addedTimer = setTimeout(() => {
        btn.classList.remove('is-added');
        label.textContent = TRANSLATIONS[currentLanguage].add_to_cart;
    }, 1400);
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;
    card.tabIndex = 0;
    card.setAttribute('aria-label', `${product.name}，按 Enter 查看详情 / Pulsa Enter para ver detalles`);

    const sortedFlavors = product.flavors
        ? [...product.flavors].sort((a, b) => isSoldOut(product.id, a.name) - isSoldOut(product.id, b.name))
        : [];

    const flavorsHtml = product.flavors ? `
        <div class="flavor-tags"></div>
        <div class="flavor-selector">
            ${sortedFlavors.map((f, i) => `
                <button class="flavor-btn${i === 0 ? ' active' : ''}" data-flavor-index="${i}" data-product-id="${product.id}" data-flavor="${f.name}" title="${f.name}">
                    <img src="${f.image}" alt="${f.name}" loading="lazy" decoding="async" onerror="this.style.display='none'">
                    <span>${currentLanguage === 'zh' ? f.nameCn : f.name}</span>
                </button>
            `).join('')}
        </div>
    ` : '';

    card.innerHTML = `
        <div class="product-image product-image-clickable">
            ${product.image ?
                `<img src="${product.image}" alt="${product.name}" class="product-main-img" loading="lazy" decoding="async">` :
                `<div class="product-image-placeholder"><svg class="icon" aria-hidden="true"><use href="#i-spark" xlink:href="#i-spark"></use></svg></div>`
            }
            <div class="product-image-hint"><svg class="icon" aria-hidden="true"><use href="#i-expand" xlink:href="#i-expand"></use></svg></div>
        </div>
        <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${product.description[currentLanguage]}</p>
            <div class="product-footer">
                <div class="product-price">${CONFIG.defaultCurrency}${product.price.toFixed(2)}</div>
                <button type="button" class="card-add-btn add-to-cart-btn" data-product-id="${product.id}">
                    <svg class="icon" aria-hidden="true"><use href="#i-plus" xlink:href="#i-plus"></use></svg>
                    <span class="card-add-label">${TRANSLATIONS[currentLanguage].add_to_cart}</span>
                </button>
            </div>
            ${flavorsHtml}
        </div>
    `;

    // 口味切换事件
    if (product.flavors) {
        const mainImg = card.querySelector('.product-main-img');
        const tagsEl = card.querySelector('.flavor-tags');
        function renderCardTags(flavor) {
            if (!tagsEl) return;
            tagsEl.innerHTML = (flavor.tags || []).map(tag => `<span class="flavor-tag ${tag.c}">${tag.t}</span>`).join('');
        }
        renderCardTags(sortedFlavors[0]);
        card.querySelectorAll('.flavor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                card.querySelectorAll('.flavor-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const flavor = sortedFlavors[parseInt(btn.dataset.flavorIndex)];
                mainImg.src = flavor.image;
                mainImg.alt = flavor.name;
                renderCardTags(flavor);
                syncQuickAdd(card, product, flavor);
            });
        });
        syncQuickAdd(card, product, sortedFlavors[0]);
    }

    // 点击卡片（按钮以外区域）或在卡片上按 Enter / Space 打开详情页
    card.addEventListener('click', (e) => {
        if (e.target.closest(CARD_CONTROLS_SELECTOR)) return;
        openCardDetail(card);
    });
    card.addEventListener('keydown', (e) => {
        if (e.target !== card) return;
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openCardDetail(card);
        }
    });

    // 加入购物车按钮
    const addToCartBtn = card.querySelector('.add-to-cart-btn');
    addToCartBtn.addEventListener('click', () => {
        if (addToCartBtn.disabled) return;
        const activeFlavor = product.flavors
            ? sortedFlavors[parseInt(card.querySelector('.flavor-btn.active').dataset.flavorIndex)]
            : null;
        const cartId = activeFlavor ? `${product.id}-${activeFlavor.name}` : String(product.id);
        const stock = activeFlavor ? getStock(product.id, activeFlavor.name) : getStock(product.id, 'default');
        const existing = cart.find(item => String(item.id) === cartId);
        const nextQty = (existing ? existing.quantity : 0) + 1;
        if (stock !== null && nextQty > stock) {
            showStockWarning(stock === 0 ? `${product.name} 已售罄` : `库存不足，仅剩 ${stock} 个`);
            return;
        }
        const cartProduct = activeFlavor
            ? { ...product, id: cartId, name: `${product.name} - ${currentLanguage === 'zh' ? activeFlavor.nameCn : activeFlavor.name}`, image: activeFlavor.image }
            : product;
        addToCart(cartProduct, 1);
        confirmCardAdd(addToCartBtn);
        flyToCart(addToCartBtn, cartProduct.image);
    });

    return card;
}

// ===== 产品详情页 =====
let detailReturnFocus = null;

function openProductDetail(product, activeFlavorIndex = 0, returnFocusEl = null) {
    const overlay = document.getElementById('product-detail');
    const mainImg = document.getElementById('detail-main-img');
    const nameEl = document.getElementById('detail-name');
    const flavorNameEl = document.getElementById('detail-flavor');
    const descEl = document.getElementById('detail-desc');
    const flavorsEl = document.getElementById('detail-flavors');
    const priceEl = document.getElementById('detail-price');
    const addCartBtn = document.getElementById('detail-add-cart');

    let currentFlavorIndex = activeFlavorIndex;

    nameEl.textContent = product.name;
    descEl.textContent = product.description[currentLanguage];
    priceEl.textContent = `${CONFIG.defaultCurrency}${product.price.toFixed(2)}`;

    const detailTagsEl = document.getElementById('detail-flavor-tags');
    function renderDetailTags(flavor) {
        if (!detailTagsEl) return;
        detailTagsEl.innerHTML = (flavor.tags || []).map(tag => `<span class="flavor-tag ${tag.c}">${tag.t}</span>`).join('');
    }

    function updateFlavor(index) {
        currentFlavorIndex = index;
        const flavor = product.flavors[index];
        mainImg.src = flavor.image;
        mainImg.alt = flavor.name;
        flavorNameEl.textContent = currentLanguage === 'zh' ? flavor.nameCn : flavor.name;
        renderDetailTags(flavor);
        flavorsEl.querySelectorAll('.detail-flavor-btn').forEach((b, i) => {
            b.classList.toggle('active', i === index);
        });
    }

    if (product.flavors) {
        flavorNameEl.style.display = 'block';
        flavorsEl.innerHTML = product.flavors.map((f, i) => {
            const soldOut = isSoldOut(product.id, f.name);
            return `<button class="detail-flavor-btn${i === activeFlavorIndex ? ' active' : ''}${soldOut ? ' sold-out-flavor' : ''}" data-index="${i}">
                <img src="${f.image}" alt="${f.name}" loading="lazy" decoding="async">
                <span>${currentLanguage === 'zh' ? f.nameCn : f.name}</span>
                ${soldOut ? '<span class="soldout-label">售罄</span>' : ''}
            </button>`;
        }).join('');
        flavorsEl.querySelectorAll('.detail-flavor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('sold-out-flavor')) return;
                updateFlavor(parseInt(btn.dataset.index));
            });
        });
        updateFlavor(activeFlavorIndex);
    } else {
        flavorNameEl.style.display = 'none';
        flavorsEl.innerHTML = '';
        mainImg.src = product.image || '';
        mainImg.alt = product.name;
    }

    // 加入购物车
    addCartBtn.onclick = () => {
        const activeFlavor = product.flavors ? product.flavors[currentFlavorIndex] : null;
        const cartProduct = activeFlavor
            ? { ...product, id: `${product.id}-${activeFlavor.name}`, name: `${product.name} - ${currentLanguage === 'zh' ? activeFlavor.nameCn : activeFlavor.name}`, image: activeFlavor.image }
            : product;
        addToCart(cartProduct, 1);
        closeProductDetail({ restoreFocus: false });
        toggleCartSidebar();
    };

    detailReturnFocus = returnFocusEl || document.activeElement;
    overlay.classList.add('open');
    document.getElementById('detail-close').focus({ preventScroll: true });
}

function closeProductDetail({ restoreFocus = true } = {}) {
    const overlay = document.getElementById('product-detail');
    if (!overlay.classList.contains('open')) return;
    overlay.classList.remove('open');
    const target = detailReturnFocus;
    detailReturnFocus = null;
    if (restoreFocus && target && target.isConnected && typeof target.focus === 'function') {
        target.focus({ preventScroll: true });
    }
}

function initProductDetail() {
    const overlay = document.getElementById('product-detail');
    document.getElementById('detail-close').addEventListener('click', () => closeProductDetail());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeProductDetail();
    });
    document.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            closeProductDetail();
            return;
        }
        if (e.key !== 'Tab') return;
        const focusables = [...overlay.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
            .filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (!overlay.contains(document.activeElement)) {
            e.preventDefault();
            first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    });
}

// ===== 拖拽卡片查看详情 =====
const CARD_CONTROLS_SELECTOR = 'button, a, input, select, textarea, .flavor-selector';

// 卡片上的口味按钮按库存排过序，需按口味名映射回 product.flavors 的下标
function openCardDetail(card) {
    const product = products.find(p => String(p.id) === card.dataset.productId);
    if (!product) return;
    let flavorIndex = 0;
    const activeBtn = card.querySelector('.flavor-btn.active');
    if (product.flavors && activeBtn) {
        flavorIndex = Math.max(0, product.flavors.findIndex(f => f.name === activeBtn.dataset.flavor));
    }
    openProductDetail(product, flavorIndex, card);
}

function initCardDrag() {
    const grid = domElements.productsGrid;
    const dropzone = document.getElementById('detail-dropzone');
    if (!grid || !dropzone || !window.PointerEvent) return;

    const MOUSE_THRESHOLD = 6;
    const TOUCH_SLOP = 10;
    const LONG_PRESS_MS = 280;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    let gesture = null;
    let suppressClick = false;

    function buildGhost(card) {
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.setAttribute('aria-hidden', 'true');
        const img = card.querySelector('.product-main-img');
        const activeFlavor = card.querySelector('.flavor-btn.active span');
        ghost.innerHTML = `
            ${img ? `<img src="${img.currentSrc || img.src}" alt="">` : ''}
            <span class="drag-ghost-text">
                <span class="drag-ghost-name"></span>
                <span class="drag-ghost-flavor"></span>
            </span>
        `;
        ghost.querySelector('.drag-ghost-name').textContent = card.querySelector('.product-name').textContent;
        ghost.querySelector('.drag-ghost-flavor').textContent = activeFlavor ? activeFlavor.textContent.trim() : '';
        document.body.appendChild(ghost);
        return ghost;
    }

    function placeGhost(x, y) {
        const g = gesture;
        if (!g || !g.ghost) return;
        const { w, h } = g.ghostSize;
        // 预览放在指针上方，避免挡住手指和放置区的文字
        g.ghost.style.transform = `translate3d(${Math.round(x - w / 2)}px, ${Math.round(y - h - 28)}px, 0)`;
    }

    function isOverDropzone(x, y) {
        const r = dropzone.getBoundingClientRect();
        const pad = 12;
        return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
    }

    function activate() {
        const g = gesture;
        if (!g || g.active) return;
        clearTimeout(g.timer);
        g.active = true;
        g.card.classList.add('is-drag-source');
        document.body.classList.add('is-card-dragging');
        dropzone.classList.add('is-armed');
        g.ghost = buildGhost(g.card);
        g.ghostSize = { w: g.ghost.offsetWidth, h: g.ghost.offsetHeight };
        placeGhost(g.lastX, g.lastY);
    }

    function removeGhost(ghost, toRect) {
        if (!ghost) return;
        if (reduceMotion.matches || !toRect) {
            ghost.remove();
            return;
        }
        const w = ghost.offsetWidth;
        const h = ghost.offsetHeight;
        const x = toRect.left + toRect.width / 2 - w / 2;
        const y = toRect.top + toRect.height / 2 - h / 2;
        ghost.classList.add('is-settling');
        ghost.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) scale(0.9)`;
        ghost.style.opacity = '0';
        const done = () => ghost.remove();
        ghost.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 400);
    }

    function finish(dropped) {
        const g = gesture;
        if (!g) return;
        gesture = null;
        clearTimeout(g.timer);
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        if (!g.active) return;

        suppressClick = true;
        setTimeout(() => { suppressClick = false; }, 0);
        g.card.classList.remove('is-drag-source');
        document.body.classList.remove('is-card-dragging');
        dropzone.classList.remove('is-armed', 'is-over');

        if (dropped) {
            removeGhost(g.ghost, dropzone.getBoundingClientRect());
            openCardDetail(g.card);
        } else {
            removeGhost(g.ghost, g.card.getBoundingClientRect());
        }
    }

    function onMove(e) {
        const g = gesture;
        if (!g || e.pointerId !== g.pointerId) return;
        g.lastX = e.clientX;
        g.lastY = e.clientY;
        const dx = e.clientX - g.startX;
        const dy = e.clientY - g.startY;

        if (!g.active) {
            const dist = Math.hypot(dx, dy);
            if (g.type === 'mouse') {
                if (dist > MOUSE_THRESHOLD) activate();
            } else if (dist > TOUCH_SLOP) {
                // 横向拖动直接开始；纵向移动交给页面滚动
                if (Math.abs(dx) > Math.abs(dy) * 1.2) activate();
                else finish(false);
            }
            if (!g.active) return;
        }

        e.preventDefault();
        placeGhost(e.clientX, e.clientY);
        dropzone.classList.toggle('is-over', isOverDropzone(e.clientX, e.clientY));
    }

    function onUp(e) {
        const g = gesture;
        if (!g || e.pointerId !== g.pointerId) return;
        finish(g.active && isOverDropzone(e.clientX, e.clientY));
    }

    function onCancel(e) {
        if (gesture && e.pointerId === gesture.pointerId) finish(false);
    }

    grid.addEventListener('pointerdown', (e) => {
        if (gesture || !e.isPrimary) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.target.closest(CARD_CONTROLS_SELECTOR)) return;
        const card = e.target.closest('.product-card');
        if (!card || !grid.contains(card)) return;

        gesture = {
            card,
            pointerId: e.pointerId,
            type: e.pointerType,
            startX: e.clientX,
            startY: e.clientY,
            lastX: e.clientX,
            lastY: e.clientY,
            active: false,
            ghost: null,
            timer: null
        };
        if (e.pointerType !== 'mouse') {
            gesture.timer = setTimeout(() => {
                activate();
                if (navigator.vibrate) navigator.vibrate(10);
            }, LONG_PRESS_MS);
        }
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
    });

    // 拖动中阻止触摸滚动（需非 passive 监听）
    grid.addEventListener('touchmove', (e) => {
        if (gesture && gesture.active) e.preventDefault();
    }, { passive: false });

    grid.addEventListener('contextmenu', (e) => {
        if (gesture && gesture.type !== 'mouse') e.preventDefault();
    });

    grid.addEventListener('dragstart', (e) => e.preventDefault());

    document.addEventListener('click', (e) => {
        if (!suppressClick) return;
        suppressClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    window.addEventListener('blur', () => finish(false));
}

// ===== 联系方式：所有 WhatsApp 链接和号码都来自 lib/contact.js =====
function initContactLinks() {
    const url = SHOP_CONTACT.whatsappChatUrl();
    document.querySelectorAll('[data-whatsapp-link]').forEach(link => { link.href = url; });
    document.querySelectorAll('[data-whatsapp-display]').forEach(el => { el.textContent = SHOP_CONTACT.whatsappDisplay(); });
}

// ===== 库存系统 =====
let inventoryMap = {}; // key: "productId-flavorName"

async function loadInventory() {
    try {
        const res = await fetch('/.netlify/functions/get-inventory');
        const rows = await res.json();
        inventoryMap = {};
        (rows || []).forEach(r => { inventoryMap[`${r.product_id}-${r.flavor_name}`] = r.stock; });
        applyInventoryToUI();
    } catch (e) {
        console.warn('Inventory load failed:', e);
    }
}

function getStock(productId, flavorName) {
    const key = `${productId}-${flavorName || 'default'}`;
    return inventoryMap.hasOwnProperty(key) ? inventoryMap[key] : null;
}

function isSoldOut(productId, flavorName) {
    const stock = getStock(productId, flavorName);
    return stock !== null && stock === 0;
}

function getStockForCartItem(item) {
    if (item.isFree) return null;
    const parts = String(item.id).split('-');
    const productId = parseInt(parts[0]);
    const flavorName = parts.length > 1 ? parts.slice(1).join('-') : 'default';
    return getStock(productId, flavorName);
}

function showStockWarning(message) {
    const el = document.createElement('div');
    el.className = 'shop-toast is-warning';
    el.setAttribute('role', 'status');
    el.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-alert" xlink:href="#i-alert"></use></svg><span></span>`;
    el.querySelector('span').textContent = message;
    document.body.appendChild(el);
    setTimeout(() => {
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 300);
    }, 3000);
}

function applyInventoryToUI() {
    // 库存加载后重新渲染，触发有货/售罄排序
    renderProducts();
    // 给每个口味按钮加售罄标记
    document.querySelectorAll('.flavor-btn[data-product-id][data-flavor]').forEach(btn => {
        const pid = parseInt(btn.dataset.productId);
        const flavor = btn.dataset.flavor;
        if (isSoldOut(pid, flavor)) {
            btn.classList.add('sold-out-flavor');
            if (!btn.querySelector('.soldout-label')) {
                btn.insertAdjacentHTML('beforeend', '<span class="soldout-label">售罄</span>');
            }
        } else {
            btn.classList.remove('sold-out-flavor');
            btn.querySelector('.soldout-label')?.remove();
        }
    });
}

function initAgeGate() {
    const confirmBtn = document.getElementById('age-confirm');
    const denyBtn = document.getElementById('age-deny');
    const denyMsg = document.getElementById('age-deny-msg');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
            try { localStorage.setItem('age_confirmed_18', '1'); } catch (e) {}
            document.documentElement.classList.remove('age-locked');
        });
    }
    if (denyBtn) {
        denyBtn.addEventListener('click', () => {
            if (denyMsg) denyMsg.hidden = false;
        });
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

function renderReviews() {
    const mount = document.getElementById('reviews-mount');
    if (!mount) return;
    const reviews = Array.isArray(window.SHOP_REVIEWS) ? window.SHOP_REVIEWS.filter(Boolean) : [];
    if (!reviews.length) {
        mount.innerHTML = '<p class="reviews-empty">暂时还没有顾客评价。请店主把真实评价写进 <code>reviews.js</code>，页面不会显示编造的评价。<br>Aún no hay reseñas. Añádalas en <code>reviews.js</code>. No publicamos reseñas inventadas.</p>';
        return;
    }
    mount.innerHTML = reviews.map(review => {
        const mark = review.placeholder
            ? '<span class="review-placeholder">占位示例，不是真实评价 / Ejemplo, no es una reseña real</span>'
            : '';
        return `<article class="review-card ${review.placeholder ? 'is-placeholder' : ''}">${mark}<p>${escapeHtml(review.text)}</p><footer><strong>${escapeHtml(review.name || '')}</strong>${review.product ? ` · ${escapeHtml(review.product)}` : ''} <time>${escapeHtml(review.date || '')}</time></footer></article>`;
    }).join('');
}

function renderRealPhotos() {
    const mount = document.getElementById('real-photos-mount');
    if (!mount) return;
    const photos = Array.isArray(window.REAL_PHOTOS) ? window.REAL_PHOTOS.filter(photo => photo && photo.src) : [];
    if (!photos.length) {
        mount.innerHTML = `
            <p class="real-photos-help">把您自己拍的照片放到 <code>images/real/</code>，再写进 <code>real-photos.js</code>。不要使用网图或生成图。<br>Guarde fotos propias en <code>images/real/</code> y regístrelas en <code>real-photos.js</code>. No use fotos de stock ni generadas.</p>
            <div class="real-photos-grid">
                ${[1, 2, 3].map(n => `<div class="real-photo-slot" role="img" aria-label="实拍空位 ${n}"><span>实拍空位 ${n}<br>Hueco ${n}</span></div>`).join('')}
            </div>`;
        return;
    }
    mount.innerHTML = `<div class="real-photos-grid">${photos.map(photo => `
        <figure class="real-photo">
            <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.alt || '实拍')}" loading="lazy" decoding="async">
            <figcaption>${escapeHtml(photo.alt || '')}${photo.altEs ? ` / ${escapeHtml(photo.altEs)}` : ''}</figcaption>
        </figure>`).join('')}</div>`;
}

function init() {
    initAgeGate();
    renderReviews();
    renderRealPhotos();
    // 初始化语言切换
    initLanguageSwitcher();

    // 初始化购物车系统
    initCart();

    // 初始化产品列表
    renderProducts();

    // 初始化产品详情页
    initProductDetail();
    initCardDrag();

    initContactLinks();

    // 设置默认语言
    switchLanguage(currentLanguage);

    // 首次访问欢迎弹窗
    initWelcomeModal();

    // 加载库存，并每60秒自动刷新
    loadInventory();
    setInterval(loadInventory, 60000);

    // 读取代理推广链接参数 ?ref=xxx
    const refParam = new URLSearchParams(window.location.search).get('ref');
    if (refParam) sessionStorage.setItem('agent_ref', refParam);

    // 清除 URL hash 并强制回顶（防止 #contact 等锚点自动滚动）
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    if (window.location.hash) history.replaceState(null, '', window.location.pathname);
    window.scrollTo(0, 0);
}

// ===== 欢迎弹窗 =====
function initWelcomeModal() {
    // 优惠码活动暂停，欢迎弹窗关闭
}

function closeWelcomeModal() {
    const modal = document.getElementById('welcome-modal');
    if (modal) modal.style.display = 'none';
    localStorage.setItem('welcome_shown', '1');
}

function copyWelcomeCode() {
    navigator.clipboard.writeText('BIENVENIDO').then(() => {
        const hint = document.getElementById('copy-hint');
        if (hint) {
            hint.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-check" xlink:href="#i-check"></use></svg> 已复制';
            setTimeout(() => { hint.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-copy" xlink:href="#i-copy"></use></svg> 点击复制'; }, 2000);
        }
    });
}

// ===== 优惠码处理 =====
function handleCouponApply() {
    const input = document.getElementById('coupon-input');
    const result = document.getElementById('coupon-result');
    const code = input?.value || '';
    if (!code.trim()) return;

    const res = applyDiscountCode(code);
    result.style.display = 'block';

    if (res.ok) {
        const label = currentLanguage === 'zh' ? res.label : res.labelEs;
        result.className = 'coupon-result success';
        result.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-check-circle" xlink:href="#i-check-circle"></use></svg> ${label} (-${res.percent}%)`;
        input.disabled = true;
        document.getElementById('coupon-apply-btn').textContent = '已使用';
        document.getElementById('coupon-apply-btn').disabled = true;
        updateCheckoutTotal();
    } else if (res.reason === 'used') {
        result.className = 'coupon-result error';
        result.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x-circle" xlink:href="#i-x-circle"></use></svg> 此优惠码已使用过 / Este código ya fue utilizado';
    } else {
        result.className = 'coupon-result error';
        result.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-x-circle" xlink:href="#i-x-circle"></use></svg> 优惠码无效 / Código inválido';
    }
}

function updateCheckoutTotal() {
    scheduleServerQuote();
}

// ===== 滚动进场动画（只用于商品卡，其它区块见 motion.js 的 data-reveal） =====
function initScrollAnimations() {
    if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.12 });

    // 产品卡片错落进场
    document.querySelectorAll('.product-card').forEach((el, i) => {
        el.classList.add('fade-up');
        el.style.transitionDelay = `${(i % 3) * 0.08}s`;
        observer.observe(el);
    });
}

// ===== 页面加载完成后初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    init();
    initSupabase();
    setTimeout(initScrollAnimations, 50);
});

// ===== 用户账户系统 =====
function initAuth() {
    // 监听登录状态变化
    sbClient.auth.onAuthStateChange((event, session) => {
        currentUser = session?.user || null;
        updateAccountUI();
        // 用户点击确认邮件链接跳回网站后自动登录
        if (event === 'SIGNED_IN' && window.location.hash.includes('type=signup')) {
            history.replaceState(null, '', window.location.pathname);
            setTimeout(() => alert('✓ 邮箱已验证，您已自动登录！'), 300);
        }
    });

    // 账户按钮点击
    const accountToggle = document.getElementById('account-toggle');
    const accountDropdown = document.getElementById('account-dropdown');

    accountToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (currentUser) {
            // 已登录：显示下拉菜单
            const isOpen = accountDropdown.style.display !== 'none';
            accountDropdown.style.display = isOpen ? 'none' : 'block';
        } else {
            // 未登录：打开登录弹窗
            openAuthModal('login');
        }
    });

    document.addEventListener('click', () => { accountDropdown.style.display = 'none'; });

    // 我的订单
    document.getElementById('my-orders-btn').addEventListener('click', () => {
        accountDropdown.style.display = 'none';
        openOrdersPanel();
    });

    // 退出登录
    document.getElementById('logout-btn').addEventListener('click', async () => {
        accountDropdown.style.display = 'none';
        await sbClient.auth.signOut();
    });

    // 关闭登录弹窗
    document.getElementById('auth-modal-close').addEventListener('click', closeAuthModal);
    document.getElementById('auth-modal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('auth-modal')) closeAuthModal();
    });

    // Tab 切换
    document.getElementById('tab-login-btn').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('tab-register-btn').addEventListener('click', () => switchAuthTab('register'));

    // 登录提交
    document.getElementById('btn-login').addEventListener('click', handleLogin);

    // 注册提交
    document.getElementById('btn-register').addEventListener('click', handleRegister);

    // 我的订单面板关闭
    document.getElementById('orders-panel-close').addEventListener('click', closeOrdersPanel);
    document.getElementById('orders-overlay').addEventListener('click', closeOrdersPanel);

    // 购后注册
    document.getElementById('btn-post-register').addEventListener('click', handlePostCheckoutRegister);
    document.getElementById('btn-post-skip').addEventListener('click', () => {
        document.getElementById('post-checkout-modal').style.display = 'none';
    });

    // 新用户欢迎弹窗
    document.getElementById('btn-welcome-register').addEventListener('click', handleWelcomeRegister);
    document.getElementById('welcome-dismiss').addEventListener('click', () => {
        document.getElementById('welcome-register-modal').style.display = 'none';
        localStorage.setItem('welcome_dismissed', '1');
    });
    document.getElementById('welcome-register-close').addEventListener('click', () => {
        document.getElementById('welcome-register-modal').style.display = 'none';
        localStorage.setItem('welcome_dismissed', '1');
    });
    document.getElementById('welcome-skip').addEventListener('click', () => {
        document.getElementById('welcome-register-modal').style.display = 'none';
        openAuthModal('login');
    });

}

function updateAccountUI() {
    const toggle = document.getElementById('account-toggle');
    const label = document.getElementById('account-label');
    if (currentUser) {
        toggle.classList.add('logged-in');
        const name = currentUser.email.split('@')[0];
        label.textContent = name.length > 10 ? name.slice(0, 10) + '…' : name;
    } else {
        toggle.classList.remove('logged-in');
        label.textContent = '登录';
    }
}

function openAuthModal(tab = 'login') {
    document.getElementById('auth-modal').style.display = 'flex';
    switchAuthTab(tab);
    document.getElementById('login-error').style.display = 'none';
    document.getElementById('register-error').style.display = 'none';
    document.getElementById('register-success').style.display = 'none';
}

function closeAuthModal() {
    document.getElementById('auth-modal').style.display = 'none';
}

function switchAuthTab(tab) {
    document.getElementById('auth-login-section').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('auth-register-section').style.display = tab === 'register' ? 'block' : 'none';
    document.getElementById('tab-login-btn').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register-btn').classList.toggle('active', tab === 'register');
}

async function handleLogin() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');
    if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; errEl.style.display = 'block'; return; }
    btn.textContent = '登录中...'; btn.disabled = true;
    const { error } = await sbClient.auth.signInWithPassword({ email, password });
    btn.textContent = '登录'; btn.disabled = false;
    const errMap = {
        'Invalid login credentials': '邮箱或密码错误',
        'Email not confirmed': '邮箱未验证，请查收确认邮件',
        'User not found': '账号不存在'
    };
    if (error) { errEl.textContent = errMap[error.message] || error.message; errEl.style.display = 'block'; }
    else { closeAuthModal(); }
}

async function handleRegister() {
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const errEl = document.getElementById('register-error');
    const successEl = document.getElementById('register-success');
    const btn = document.getElementById('btn-register');
    if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; errEl.style.display = 'block'; return; }
    if (password.length < 6) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; return; }
    btn.textContent = '注册中...'; btn.disabled = true;
    errEl.style.display = 'none';

    // 直接 fetch，绕过 SDK，方便诊断
    try {
        const res = await fetch(`${_SB_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': _SB_KEY,
                'Authorization': `Bearer ${_SB_KEY}`
            },
            body: JSON.stringify({ email, password })
        });
        const json = await res.json();
        btn.textContent = '创建账号'; btn.disabled = false;
        if (!res.ok) {
            errEl.textContent = `错误 ${res.status}: ${json.msg || json.message || JSON.stringify(json)}`;
            errEl.style.display = 'block';
        } else {
            successEl.textContent = '✓ 注册成功！请查收验证邮件后登录';
            successEl.style.display = 'block';
            // 用SDK同步session
            if (sbClient) sbClient.auth.signUp({ email, password }).catch(()=>{});
        }
    } catch(e) {
        btn.textContent = '创建账号'; btn.disabled = false;
        errEl.textContent = `网络错误: ${e.message} | SDK已加载: ${!!window.supabase} | URL: ${_SB_URL}`;
        errEl.style.display = 'block';
    }
}

async function handleWelcomeRegister() {
    const email = document.getElementById('welcome-email').value.trim();
    const password = document.getElementById('welcome-password').value;
    const errEl = document.getElementById('welcome-error');
    const successEl = document.getElementById('welcome-success');
    const btn = document.getElementById('btn-welcome-register');
    if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; errEl.style.display = 'block'; return; }
    if (password.length < 6) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; return; }
    btn.textContent = '注册中...'; btn.disabled = true;
    errEl.style.display = 'none';
    try {
        const res = await fetch(`${_SB_URL}/auth/v1/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'apikey': _SB_KEY, 'Authorization': `Bearer ${_SB_KEY}` },
            body: JSON.stringify({ email, password })
        });
        const json = await res.json();
        btn.textContent = '免费注册'; btn.disabled = false;
        if (!res.ok) { errEl.textContent = json.msg || json.message || '注册失败'; errEl.style.display = 'block'; }
        else {
            localStorage.setItem('welcome_dismissed', '1');
            successEl.textContent = '✓ 注册成功！请查收验证邮件';
            successEl.style.display = 'block';
            setTimeout(() => { document.getElementById('welcome-register-modal').style.display = 'none'; }, 2500);
        }
    } catch(e) {
        btn.textContent = '免费注册'; btn.disabled = false;
        errEl.textContent = '网络错误，请重试'; errEl.style.display = 'block';
    }
}

// 购后注册（带订单号绑定）
let _pendingLinkOrderNumber = null;

async function handlePostCheckoutRegister() {
    const email = document.getElementById('post-email').value.trim();
    const password = document.getElementById('post-password').value;
    const errEl = document.getElementById('post-error');
    const btn = document.getElementById('btn-post-register');
    if (!email || !password) { errEl.textContent = '请填写邮箱和密码'; errEl.style.display = 'block'; return; }
    if (password.length < 6) { errEl.textContent = '密码至少6位'; errEl.style.display = 'block'; return; }
    btn.textContent = '注册中...'; btn.disabled = true;
    errEl.style.display = 'none';
    const { error } = await sbClient.auth.signUp({ email, password });
    btn.textContent = '创建账号'; btn.disabled = false;
    if (error) { errEl.textContent = error.message; errEl.style.display = 'block'; }
    else {
        document.getElementById('post-checkout-modal').style.display = 'none';
        alert('✓ 账号创建成功！查收验证邮件后登录，即可查看订单状态。');
        _pendingLinkOrderNumber = null;
    }
}

function showPostCheckoutPrompt(orderNumber) {
    if (currentUser) return; // 已登录则不提示
    _pendingLinkOrderNumber = orderNumber;
    document.getElementById('post-email').value = '';
    document.getElementById('post-password').value = '';
    document.getElementById('post-error').style.display = 'none';
    document.getElementById('post-checkout-modal').style.display = 'flex';
}

// 我的订单面板
function openOrdersPanel() {
    document.getElementById('orders-panel').classList.add('open');
    document.getElementById('orders-overlay').classList.add('active');
    loadUserOrders();
}

function closeOrdersPanel() {
    document.getElementById('orders-panel').classList.remove('open');
    document.getElementById('orders-overlay').classList.remove('active');
}

const STATUS_ZH = { pending: '待确认', paid: '已确认', shipped: '已发货', delivered: '已完成', cancelled: '已取消' };

async function loadUserOrders() {
    const content = document.getElementById('orders-panel-content');
    content.innerHTML = '<div class="orders-loading"><svg class="icon icon-spin" aria-hidden="true"><use href="#i-spinner" xlink:href="#i-spinner"></use></svg> 加载中...</div>';
    if (!currentUser) { content.innerHTML = '<div class="orders-empty"><svg class="icon" aria-hidden="true"><use href="#i-user" xlink:href="#i-user"></use></svg><p>请先登录</p></div>'; return; }

    const { data, error } = await sbClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { content.innerHTML = `<div class="orders-empty"><svg class="icon" aria-hidden="true"><use href="#i-alert" xlink:href="#i-alert"></use></svg><p>加载失败</p></div>`; return; }
    if (!data?.length) { content.innerHTML = '<div class="orders-empty"><svg class="icon" aria-hidden="true"><use href="#i-receipt" xlink:href="#i-receipt"></use></svg><p>暂无订单</p></div>'; return; }

    content.innerHTML = data.map(order => {
        const items = (order.items || []).map(i => `${i.name} ×${i.quantity}`).join('、');
        const date = new Date(order.created_at).toLocaleDateString('zh-CN');
        const status = order.payment_status || 'pending';
        return `
        <div class="order-card">
            <div class="order-card-header">
                <span class="order-number">${order.order_number}</span>
                <span class="order-date">${date}</span>
            </div>
            <div class="order-status-badge ${status}">${STATUS_ZH[status] || status}</div>
            <div class="order-items">${items}</div>
            <div class="order-total">合计：€${order.total?.toFixed(2)}</div>
        </div>`;
    }).join('');
}

// ===== 导出供开发使用 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        products,
        TRANSLATIONS,
        switchLanguage,
        renderProducts
    };
}
