// ===== Supabase 客户端（用户Auth + 查询自己的订单） =====
const _SB_URL = 'https://ehbdpuwfdnbdeskezevg.supabase.co';
const _SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYmRwdXdmZG5iZGVza2V6ZXZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4Mjk1MTksImV4cCI6MjA5MTQwNTUxOX0.bRDaEu0GA0GaWbdjceYbqMcybkW1lii6DzeG2EQeWMY';
let sbClient = null;
let currentUser = null;

function initSupabase() {
    try {
        if (!window.supabase) throw new Error('Supabase SDK未加载');
        sbClient = window.supabase.createClient(_SB_URL, _SB_KEY);
    } catch(e) {
        console.error('Supabase init error:', e);
    }
}

// ===== 配置信息 =====
const CONFIG = {
    bizumPhone: '+34 697 332 407',
    defaultCurrency: '€',
    storeName: '口粮专卖店'
};

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

function getDiscountedTotal(original) {
    if (!activeDiscount) return original;
    return +(original * (1 - activeDiscount.percent / 100)).toFixed(2);
}

// ===== 买五送一系统 =====
const FREE_ITEM_PRODUCT_IDS = [1, 3]; // 鸭嘴兽, 小黑条
const SHIPPING_FEE = 9.99;
const FREE_SHIPPING_THRESHOLD = 100;

function getNonFreeQuantity() {
    return cart.filter(i => !i.isFree).reduce((s, i) => s + i.quantity, 0);
}

function getFreeItemsInCart() {
    return cart.filter(i => i.isFree);
}

function getEntitledFreeCount() {
    return Math.floor(getNonFreeQuantity() / 5);
}

function removeFreeItemFromCart() {
    cart = cart.filter(i => !i.isFree);
    saveCartToStorage();
    updateCartUI();
}

function checkFreeItemEligibility() {
    const entitled = getEntitledFreeCount();
    const current = getFreeItemsInCart().length;
    if (entitled > current) {
        showFreeItemModal();
    } else if (entitled < current) {
        // 移除多余的赠品（从后往前）
        const freeItems = getFreeItemsInCart();
        for (let i = 0; i < current - entitled; i++) {
            cart = cart.filter(item => item.id !== freeItems[freeItems.length - 1 - i].id);
        }
        saveCartToStorage();
        updateCartUI();
    }
}

function showFreeItemModal() {
    const modal = document.getElementById('free-item-modal');
    showFreeItemProductStep();
    modal.style.display = 'flex';
}

function closeFreeItemModal() {
    document.getElementById('free-item-modal').style.display = 'none';
    document.getElementById('cart-sidebar').classList.add('open');
    document.getElementById('cart-overlay').classList.add('active');
}

function showFreeItemProductStep() {
    const productsEl = document.getElementById('free-item-products');
    const flavorsEl = document.getElementById('free-item-flavors');
    flavorsEl.style.display = 'none';
    productsEl.style.display = 'grid';

    const freeProducts = products.filter(p => FREE_ITEM_PRODUCT_IDS.includes(p.id));
    productsEl.innerHTML = freeProducts.map(p => `
        <div class="free-item-product-card" onclick="showFreeItemFlavors(${p.id})">
            <img src="${p.image}" alt="${p.name}" onerror="this.style.display='none'">
            <div class="free-item-product-name">${p.name}</div>
            <div class="free-item-product-price">免费 / Gratis</div>
        </div>
    `).join('');
}

function showFreeItemFlavors(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    document.getElementById('free-item-products').style.display = 'none';
    const flavorsEl = document.getElementById('free-item-flavors');
    flavorsEl.style.display = 'block';

    document.getElementById('free-item-flavor-list').innerHTML = (product.flavors || [])
        .filter(f => !isSoldOut(productId, f.name))
        .map(f => `
        <button class="free-flavor-btn" onclick="addFreeItemToCart(${productId}, '${f.name}', '${f.nameCn || f.name}', '${f.image}')">
            <img src="${f.image}" alt="${f.nameCn || f.name}" onerror="this.style.display='none'">
            <span>${f.nameCn || f.name}</span>
        </button>
    `).join('');
}

function addFreeItemToCart(productId, flavorName, flavorNameCn, flavorImage) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const freeItem = {
        id: `FREE-${productId}-${flavorName}`,
        name: `${product.name} · ${flavorNameCn} [赠品]`,
        price: 0,
        image: flavorImage,
        quantity: 1,
        isFree: true
    };
    cart.push(freeItem);
    saveCartToStorage();
    updateCartUI();

    // 还有更多赠品可选则继续弹窗，否则进入结账
    if (getEntitledFreeCount() > getFreeItemsInCart().length) {
        showFreeItemProductStep();
    } else {
        document.getElementById('free-item-modal').style.display = 'none';
        openCartCheckoutModal();
    }
}

function getShippingFee() {
    const isPostal = document.getElementById('btn-postal')?.classList.contains('active');
    if (!isPostal) return 0;
    const subtotal = cart.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.quantity, 0);
    const discounted = getDiscountedTotal(subtotal);
    return discounted >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE;
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
    showCartNotification(product.name, quantity);
    checkFreeItemEligibility();
}

function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCartToStorage();
    updateCartUI();
    checkFreeItemEligibility();
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
            checkFreeItemEligibility();
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

    // 更新总价
    cartTotalPrice.textContent = `${CONFIG.defaultCurrency}${getCartTotalPrice().toFixed(2)}`;
}

function createCartItemElement(item) {
    const itemElement = document.createElement('div');
    itemElement.className = 'cart-item';
    itemElement.dataset.productId = item.id;

    const itemImage = item.image || '';
    const imageHtml = itemImage ?
        `<img src="${itemImage}" alt="${item.name}" class="cart-item-image">` :
        `<div class="product-image-placeholder">
            <i class="fas fa-smoking"></i>
        </div>`;

    const subtotal = item.price * item.quantity;

    itemElement.innerHTML = `
        <div class="cart-item-image-container">
            ${imageHtml}
        </div>
        <div class="cart-item-details">
            <div class="cart-item-name">${item.name}${item.isFree ? ' <span class="free-badge">免费</span>' : ''}</div>
            <div class="cart-item-subtotal">${item.isFree ? '<span style="color:#16a34a;font-weight:600">免费赠品</span>' : `${CONFIG.defaultCurrency}${subtotal.toFixed(2)}`}</div>
            <div class="cart-item-controls">
                ${item.isFree ? '' : `
                <div class="quantity-control">
                    <button class="quantity-btn minus" data-product-id="${item.id}">-</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn plus" data-product-id="${item.id}">+</button>
                </div>`}
                <button class="remove-item-btn" data-product-id="${item.id}">
                    <i class="fas fa-trash"></i>
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

function showCartNotification(productName, quantity) {
    // 创建通知元素
    const notification = document.createElement('div');
    notification.className = 'cart-notification';
    notification.innerHTML = `
        <i class="fas fa-check-circle"></i>
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
            if (cartSidebar) cartSidebar.classList.remove('open');
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
}

function toggleCartSidebar() {
    const cartSidebar = document.getElementById('cart-sidebar');
    const cartOverlay = document.getElementById('cart-overlay');

    if (cartSidebar && cartOverlay) {
        const isOpen = cartSidebar.classList.contains('open');

        if (isOpen) {
            cartSidebar.classList.remove('open');
            cartOverlay.classList.remove('show');
        } else {
            cartSidebar.classList.add('open');
            cartOverlay.classList.add('show');
        }
    }
}

function openCartCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    const summaryEl = document.getElementById('checkout-cart-summary');
    const totalEl = document.getElementById('checkout-total-display');
    const errorEl = document.getElementById('checkout-error');
    const stepInfo = document.getElementById('checkout-step-info');
    const stepBizum = document.getElementById('checkout-step-bizum');

    // 重置状态
    stepInfo.style.display = 'block';
    stepBizum.style.display = 'none';
    document.getElementById('checkout-step-cash').style.display = 'none';
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
    document.getElementById('checkout-time-from').value = '10:00';
    document.getElementById('checkout-time-to').value = '14:00';
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
        document.getElementById('btn-pay-cash').style.display = mode === 'postal' ? 'none' : '';
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
    summaryEl.innerHTML = cart.map(item => `
        <div class="checkout-summary-item">
            <span>${item.name} ×${item.quantity}</span>
            <span>${CONFIG.defaultCurrency}${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
    updateCheckoutTotal();

    modal.style.display = 'flex';

    // 关闭/返回按钮
    document.getElementById('checkout-modal-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };
    document.getElementById('checkout-back-to-cart').onclick = () => {
        modal.style.display = 'none';
        document.getElementById('cart-sidebar').classList.add('open');
        document.getElementById('cart-overlay').classList.add('active');
    };
    document.getElementById('bizum-back-btn').onclick = () => {
        document.getElementById('checkout-step-bizum').style.display = 'none';
        document.getElementById('checkout-step-info').style.display = 'block';
    };

    document.getElementById('wechat-back-btn').onclick = () => {
        document.getElementById('checkout-step-wechat').style.display = 'none';
        document.getElementById('checkout-step-info').style.display = 'block';
    };

    function getDeliveryAddress() {
        const s = document.getElementById('checkout-delivery-street').value.trim();
        const f = document.getElementById('checkout-delivery-floor').value.trim();
        const d = document.getElementById('checkout-delivery-district').value.trim();
        return { street: s, floor: f, district: d,
            formatted: [s + (f ? `, ${f}` : ''), d ? `Madrid – ${d}` : 'Madrid'].filter(Boolean).join('\n') };
    }

    function getPostalAddress() {
        const r = document.getElementById('checkout-postal-recipient').value.trim();
        const s = document.getElementById('checkout-postal-street').value.trim();
        const f = document.getElementById('checkout-postal-floor').value.trim();
        const cp = document.getElementById('checkout-postal-cp').value.trim();
        const city = document.getElementById('checkout-postal-city').value.trim();
        const prov = document.getElementById('checkout-postal-province').value.trim();
        return { recipient: r, street: s, floor: f, cp, city, province: prov,
            formatted: [r, s + (f ? ` ${f}` : ''), `${cp} ${city}`.trim(), prov].filter(Boolean).join('\n') };
    }

    // 收集并校验表单，返回 payload 或 null
    function buildOrderPayload(paymentMethod) {
        const name = document.getElementById('checkout-customer-name').value.trim();
        const phone = document.getElementById('checkout-customer-phone').value.trim();
        const isDelivery = document.getElementById('btn-delivery').classList.contains('active');
        const isPostal = document.getElementById('btn-postal').classList.contains('active');
        const deliveryData = getDeliveryAddress();
        const postalData = getPostalAddress();
        const timeFrom = document.getElementById('checkout-time-from').value;
        const timeTo = document.getElementById('checkout-time-to').value;
        const shippingFee = getShippingFee();

        if (!name || !phone) {
            errorEl.textContent = '请填写姓名和手机号 / Por favor complete su nombre y teléfono';
            errorEl.style.display = 'block';
            return null;
        }
        if (isDelivery && !deliveryData.street) {
            errorEl.textContent = '请填写街道和门牌号 / Por favor introduzca la calle y número';
            errorEl.style.display = 'block';
            return null;
        }
        if (isPostal && (!postalData.recipient || !postalData.street || !postalData.cp || !postalData.city)) {
            errorEl.textContent = '请填写完整邮寄地址（收件人、街道、邮编、城市）/ Rellene todos los campos de dirección postal';
            errorEl.style.display = 'block';
            return null;
        }
        errorEl.style.display = 'none';

        const deliveryType = isDelivery ? 'delivery' : isPostal ? 'postal' : 'pickup';
        const finalAddress = isDelivery ? deliveryData.formatted : isPostal ? postalData.formatted : '';
        const subtotal = cart.filter(i => !i.isFree).reduce((s, i) => s + i.price * i.quantity, 0);
        const total = +(subtotal + shippingFee).toFixed(2);
        const orderNumber = 'ORD-' + Date.now();

        return { cart, customerName: name, customerPhone: phone, deliveryType, address: finalAddress,
            deliveryTime: isDelivery ? `${timeFrom} - ${timeTo}` : '',
            discountCode: activeDiscount?.code || '', discountPercent: activeDiscount?.percent || 0,
            shippingFee, agentRef: sessionStorage.getItem('agent_ref') || '',
            paymentMethod, orderNumber, total };
    }

    // 提交订单到服务器（客户点"我已付款"后才调用）
    async function submitOrder(payload, confirmBtn, confirmBtnOriginalHTML) {
        confirmBtn.disabled = true;
        confirmBtn.textContent = '提交中...';
        try {
            // 如果用户已登录，带上 userId
            const finalPayload = { ...payload };
            if (currentUser) finalPayload.userId = currentUser.id;

            const res = await fetch('/.netlify/functions/save-bizum-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });
            const data = await res.json();
            if (!res.ok || data.error || data.supabase_error) throw new Error(data.error || data.supabase_error || 'Error');
            if (activeDiscount) markCodeAsUsed(activeDiscount.code);
            modal.style.display = 'none';
            clearCart();
            // 未登录则提示注册
            showPostCheckoutPrompt(payload.orderNumber);
            if (currentUser) alert('谢谢！我们收到您的付款通知，确认后会联系您。\n¡Gracias! Le contactaremos al confirmar el pago.');
        } catch (err) {
            alert('提交失败，请重试 / Error al enviar, inténtelo de nuevo');
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = confirmBtnOriginalHTML;
        }
    }

    // Bizum 支付
    document.getElementById('btn-pay-bizum').onclick = () => {
        const payload = buildOrderPayload('bizum');
        if (!payload) return;

        document.getElementById('bizum-amount-display').textContent = `${CONFIG.defaultCurrency}${payload.total.toFixed(2)}`;
        document.getElementById('bizum-order-display').textContent = payload.orderNumber;
        const waMsg = encodeURIComponent(`Hola! Acabo de hacer el pago por Bizum.\nPedido: ${payload.orderNumber}\nImporte: €${payload.total.toFixed(2)}\n(附上截图 / adjunto captura)`);
        document.getElementById('bizum-whatsapp-btn').href = `https://wa.me/34697332407?text=${waMsg}`;
        stepInfo.style.display = 'none';
        stepBizum.style.display = 'block';

        const bizumCheck = document.getElementById('bizum-screenshot-check');
        bizumCheck.checked = false;
        const confirmBtn = document.getElementById('bizum-confirm-btn');
        confirmBtn.disabled = true;
        bizumCheck.onchange = () => { confirmBtn.disabled = !bizumCheck.checked; };
        const originalHTML = confirmBtn.innerHTML;
        confirmBtn.onclick = () => submitOrder(payload, confirmBtn, originalHTML);
        document.getElementById('checkout-cancel-btn').onclick = () => modal.style.display = 'none';
    };

    // 微信支付
    document.getElementById('btn-pay-wechat').onclick = () => {
        const payload = buildOrderPayload('wechat');
        if (!payload) return;

        document.getElementById('wechat-amount-display').textContent = `${CONFIG.defaultCurrency}${payload.total.toFixed(2)}`;
        document.getElementById('wechat-order-display').textContent = payload.orderNumber;
        const waMsg = encodeURIComponent(`你好！我刚完成微信支付。\n订单号: ${payload.orderNumber}\n金额: €${payload.total.toFixed(2)}\n（附上截图 / adjunto captura）`);
        document.getElementById('wechat-whatsapp-btn').href = `https://wa.me/34697332407?text=${waMsg}`;
        stepInfo.style.display = 'none';
        document.getElementById('checkout-step-wechat').style.display = 'block';

        const wechatCheck = document.getElementById('wechat-screenshot-check');
        wechatCheck.checked = false;
        const confirmBtn = document.getElementById('wechat-confirm-btn');
        confirmBtn.disabled = true;
        wechatCheck.onchange = () => { confirmBtn.disabled = !wechatCheck.checked; };
        const originalHTML = confirmBtn.innerHTML;
        confirmBtn.onclick = () => submitOrder(payload, confirmBtn, originalHTML);
        document.getElementById('wechat-cancel-btn').onclick = () => modal.style.display = 'none';
    };

    // 现金支付
    document.getElementById('btn-pay-cash').onclick = () => {
        const isDelivery = document.getElementById('btn-delivery').classList.contains('active');
        const isPostal = document.getElementById('btn-postal').classList.contains('active');
        if (isPostal) {
            errorEl.textContent = '现金支付不支持邮寄 / El pago en efectivo no está disponible para envío postal';
            errorEl.style.display = 'block';
            return;
        }
        if (isDelivery && getNonFreeQuantity() < 5) {
            errorEl.textContent = '外送至少需要5件商品 / Se necesitan mínimo 5 unidades para entrega a domicilio';
            errorEl.style.display = 'block';
            return;
        }
        const payload = buildOrderPayload('cash');
        if (!payload) return;

        document.getElementById('cash-amount-display').textContent = `${CONFIG.defaultCurrency}${payload.total.toFixed(2)}`;
        document.getElementById('cash-order-display').textContent = payload.orderNumber;
        stepInfo.style.display = 'none';
        document.getElementById('checkout-step-cash').style.display = 'block';

        const confirmBtn = document.getElementById('cash-confirm-btn');
        const originalHTML = confirmBtn.innerHTML;
        confirmBtn.onclick = () => submitOrder(payload, confirmBtn, originalHTML);
        document.getElementById('cash-cancel-btn').onclick = () => modal.style.display = 'none';
    };

    document.getElementById('cash-back-btn').onclick = () => {
        document.getElementById('checkout-step-cash').style.display = 'none';
        stepInfo.style.display = 'block';
    };

    // 银行卡支付
    document.getElementById('btn-pay-card').onclick = async () => {
        const name = document.getElementById('checkout-customer-name').value.trim();
        const phone = document.getElementById('checkout-customer-phone').value.trim();
        const isDelivery = document.getElementById('btn-delivery').classList.contains('active');
        const isPostal = document.getElementById('btn-postal').classList.contains('active');
        const deliveryData = getDeliveryAddress();
        const postalData = getPostalAddress();
        const timeFrom = document.getElementById('checkout-time-from').value;
        const timeTo = document.getElementById('checkout-time-to').value;
        const shippingFee = getShippingFee();
        if (!name || !phone) {
            errorEl.textContent = '请填写姓名和手机号 / Por favor complete su nombre y teléfono';
            errorEl.style.display = 'block';
            return;
        }
        if (isDelivery && !deliveryData.street) {
            errorEl.textContent = '请填写街道和门牌号 / Por favor introduzca la calle y número';
            errorEl.style.display = 'block';
            return;
        }
        if (isPostal && (!postalData.recipient || !postalData.street || !postalData.cp || !postalData.city)) {
            errorEl.textContent = '请填写完整邮寄地址（收件人、街道、邮编、城市）/ Rellene todos los campos de dirección postal';
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';
        document.getElementById('btn-pay-card').disabled = true;
        document.getElementById('btn-pay-card').textContent = '跳转中...';

        const deliveryType = isDelivery ? 'delivery' : isPostal ? 'postal' : 'pickup';
        const finalAddress = isDelivery ? deliveryData.formatted : isPostal ? postalData.formatted : '';

        try {
            const res = await fetch('/.netlify/functions/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart, customerName: name, customerPhone: phone, deliveryType, address: finalAddress, deliveryTime: isDelivery ? `${timeFrom} - ${timeTo}` : '', discountCode: activeDiscount?.code || '', discountPercent: activeDiscount?.percent || 0, shippingFee, agentRef: sessionStorage.getItem('agent_ref') || '', ...(currentUser ? { userId: currentUser.id } : {}) })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            if (activeDiscount) markCodeAsUsed(activeDiscount.code);
            window.location.href = data.url;
        } catch (err) {
            errorEl.textContent = '出错了，请重试 / Error, inténtelo de nuevo';
            errorEl.style.display = 'block';
            document.getElementById('btn-pay-card').disabled = false;
            document.getElementById('btn-pay-card').innerHTML = '<i class="fas fa-credit-card"></i><span>Tarjeta</span><small>信用/借记卡</small>';
        }
    };
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
        hero_title: 'Vapeadores Premium, Experiencia Pura',
        hero_subtitle: 'Cuatro sabores seleccionados para sus necesidades',

        // 产品区域
        products_title: 'Productos Destacados',
        products_subtitle: 'Múltiples tipos, múltiples sabores — encuentra el tuyo',

        // 产品描述
        dash_desc: '4000 puffs · Amplia variedad de sabores · Toque helado y suave',
        icemax_desc: 'Sabor intenso a menta con efecto refrescante',
        lil_black_desc: 'Compacto y discreto, ideal para llevar',
        iceking_desc: 'Sabor frío potente, experiencia refrescante extrema',

        // 支付区域
        payment_title: 'Métodos de Pago',
        payment_subtitle: 'Múltiples opciones de pago, seguras y convenientes',
        bizum_title: 'Bizum',
        bizum_desc: 'Transferencia directa a la cuenta del vendedor, sin comisiones',
        bizum_private: 'Número visible solo al finalizar el pedido',
        bizum_screenshot: 'Se requiere captura de pantalla para confirmar',
        wechat_title: 'WeChat Pay',
        wechat_desc: 'Escanee el código QR con WeChat para pagar al instante',
        card_title: 'Tarjeta Bancaria',
        card_desc: 'Acepta Visa, Mastercard y otras tarjetas principales. Procesado de forma segura a través de Stripe.',
        card_secure: 'Cifrado SSL, pago 100% seguro',
        phone: 'Teléfono:',
        note: 'Nota:',
        order_note: 'Por favor indique el número de pedido',

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

        // 模态框
        confirm_purchase: 'Confirmar Compra',
        payment_steps: 'Pasos de Pago:',
        step1: 'Abra su aplicación bancaria',
        step2: 'Seleccione la función Bizum',
        step3: 'Ingrese el número de teléfono:',
        step4: 'Ingrese la cantidad:',
        step5: 'En la nota, indique el número de pedido:',
        step6: 'Complete el pago y tome una captura de pantalla',
        i_paid: 'He Pagado',
        cancel: 'Cancelar',

        // 关于
        about_title: 'Sobre Nosotros',
        about_speed_title: 'Entrega Express el Mismo Día',
        about_speed_desc: 'Procesamos tu pedido al instante. Entrega en Madrid el mismo día — llegar rápido no es una opción, es nuestra promesa.',
        about_quality_title: 'Productos de Calidad Seleccionados',
        about_quality_desc: 'Evaluamos regularmente a nuestros proveedores para garantizar que cada producto cumpla con los más altos estándares de calidad.',
        about_service_title: 'Atención Rápida y Cercana',
        about_service_desc: 'Respondemos a cada mensaje sin demora. Olvídate de esperar — nuestro equipo está siempre disponible para atenderte.',
        about_offers_title: 'Ofertas y Promociones Frecuentes',
        about_offers_desc: 'Compra 5 y llévate 1 gratis, descuentos especiales y promociones continuas para que disfrutes al mejor precio.',

        // 页脚
        footer_desc: 'Tienda de vapeadores premium en España',
        copyright: '© 2026 口粮专卖店. Todos los derechos reservados.',

        // 购物车
        cart_title: 'Carrito de compras',
        cart_empty: 'El carrito está vacío',
        cart_total: 'Total:',
        cart_checkout: 'Ir a pagar',
        cart_clear: 'Vaciar carrito',
        add_to_cart: 'Añadir al carrito',
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
        hero_title: '优质电子烟，纯净体验',
        hero_subtitle: '四种精选口味，满足您的需求',

        // 产品区域
        products_title: '精选产品',
        products_subtitle: '多种类型，多种口味，总有一款适合您',

        // 产品描述
        dash_desc: '人体工学设计，口感柔和持久',
        icemax_desc: '强劲薄荷口味，清凉感十足',
        lil_black_desc: '小巧隐蔽，便携设计',
        iceking_desc: '极强冰感，极致清凉体验',

        // 支付区域
        payment_title: '支付方式',
        payment_subtitle: '多种支付方式，安全便捷',
        bizum_title: 'Bizum',
        bizum_desc: '直接转账到商家账户，快速安全，无需手续费',
        bizum_private: '下单后显示转账号码',
        bizum_screenshot: '转账后需提供截图确认',
        wechat_title: '微信支付',
        wechat_desc: '扫码即付，快捷方便，支持微信钱包',
        card_title: '银行卡支付',
        card_desc: '支持 Visa、Mastercard 等主流银行卡，通过 Stripe 安全加密处理',
        card_secure: 'SSL 加密，安全有保障',
        phone: '电话:',
        note: '备注:',
        order_note: '请注明订单号',

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

        // 模态框
        confirm_purchase: '确认购买',
        payment_steps: '支付步骤:',
        step1: '打开您的银行App',
        step2: '选择Bizum功能',
        step3: '输入电话号码:',
        step4: '输入金额:',
        step5: '备注中注明订单号:',
        step6: '完成支付并截图',
        i_paid: '我已付款',
        cancel: '取消',

        // 关于
        about_title: '关于我们',
        about_speed_title: '当天极速配送',
        about_speed_desc: '收到订单立即处理，马德里范围内当天送达，以最快的速度送到您手中是我们的初衷。',
        about_quality_title: '严选优质产品',
        about_quality_desc: '我们定期严格筛选合作工厂，每一支产品都经过品质把关，只将最好的带给您。',
        about_service_title: '高效贴心服务',
        about_service_desc: '告别消息不回、久等不达。我们与客户之间的对接极为迅速，您的每一条消息都会得到及时回复。',
        about_offers_title: '活动多优惠多',
        about_offers_desc: '买五送一、不定期特惠，让您以最实惠的价格享受最优质的电子烟体验。',

        // 页脚
        footer_desc: '西班牙优质口粮专卖店',
        copyright: '© 2026 口粮专卖店. 保留所有权利。',

        // 购物车
        cart_title: '购物车',
        cart_empty: '购物车是空的',
        cart_total: '总计:',
        cart_checkout: '去结算',
        cart_clear: '清空购物车',
        add_to_cart: '加入购物车',
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
            es: '4000 puffs · Amplia variedad de sabores · Toque helado y suave',
            zh: '4000口量 · 多款口味随心选 · 冰感顺滑不刺激'
        },
        image: 'images/dash/coconut-water.webp',
        flavors: [
            { name: 'Jasmine LongJing Tea', nameCn: '龙井', image: 'images/dash/jasmine-longjing.webp' },
            { name: 'Lemon Tea', nameCn: '柠檬茶', image: 'images/dash/sparkling-iced-lemon-tea.webp' },
            { name: 'Green Grape', nameCn: '青提', image: 'images/dash/green-grape.jpeg' },
            { name: 'Sweet Honeydew', nameCn: '甜蜜瓜', image: 'images/dash/sweet-honeydew.webp' },
            { name: 'Crystal Grape', nameCn: '紫晶葡萄', image: 'images/dash/tangy-grape.webp' },
            { name: 'Mineral Water', nameCn: '矿泉水', image: 'images/dash/mineral-water.webp' },
            { name: 'Coconut Water', nameCn: '椰子水', image: 'images/dash/coconut-water.webp' },
            { name: 'Matcha Smoothie', nameCn: '抹茶思慕雪', image: 'images/dash/matcha-smoothie.webp' },
            { name: 'Peach Ice', nameCn: '水蜜桃冰', image: 'images/dash/peach-ice.webp' },
            { name: 'Pink Guava', nameCn: '粉红番石榴', image: 'images/dash/pink-guava.webp' },
            { name: 'Black Dragon Ice', nameCn: '黑龙冰', image: 'images/dash/black-dragon-ice.webp' },
            { name: 'Corn Gelato', nameCn: '玉米冰激凌', image: 'images/dash/corn-gelato.webp' },
            { name: 'White Freeze', nameCn: '老冰棍', image: 'images/dash/white-freeze.webp' },
            { name: 'Passion Grapefruit', nameCn: '百香西柚', image: 'images/dash/passion-grapefruit.webp' },
            { name: 'Lush Ice', nameCn: '西瓜冰', image: 'images/dash/lush-ice.webp' },
            { name: 'Lemon Pineapple', nameCn: '柠檬菠萝', image: 'images/dash/lemon-pineapple.webp' },
            { name: 'Green Apple Ice', nameCn: '青苹果冰', image: 'images/dash/green-apple-ice.jpg' },
            { name: 'Tea Guan Yin King', nameCn: '铁观音王', image: 'images/dash/tea-guan-yin-king.webp' },
            { name: 'Taro Ice', nameCn: '芋头冰', image: 'images/dash/taro-ice.webp' },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/dash/lychee-ice.webp' },
            { name: 'Hibiscus Ice Tea', nameCn: '洛神花冰茶', image: 'images/dash/hibiscus-ice-tea.webp' },
            { name: 'Ludou Ice', nameCn: '绿豆冰', image: 'images/dash/ludou-ice.webp' },
            { name: 'Lime Ice', nameCn: '青柠冰', image: 'images/dash/lime-ice.jpg' }
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
            { name: 'Passion Grapefruit', nameCn: '百香西柚', image: 'images/icemax/passion-grapefruit.webp' },
            { name: 'Jasmine Milk Tea', nameCn: '茉莉奶茶', image: 'images/icemax/jasmine-milk-tea.webp' },
            { name: 'Iced Pocari', nameCn: '冰镇宝矿力', image: 'images/icemax/iced-pocari.webp' },
            { name: 'Coconut Water', nameCn: '椰子水', image: 'images/icemax/coconut-water.webp' },
            { name: 'Miami Mint', nameCn: '迈阿密薄荷', image: 'images/icemax/miami-mint.webp' },
            { name: 'Longjing Ice Tea', nameCn: '龙井冰茶', image: 'images/icemax/longjing-ice-tea.webp' },
            { name: 'Green Grape Ice', nameCn: '青葡萄冰', image: 'images/icemax/green-grape-ice.webp' },
            { name: 'Fresh Lemon', nameCn: '新鲜柠檬', image: 'images/icemax/fresh-lemon.webp' },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/icemax/lychee-ice.webp' },
            { name: 'Peach Oolong', nameCn: '水蜜桃乌龙', image: 'images/icemax/peach-oolong.webp' }
        ]
    },
    {
        id: 3,
        name: '小黑条 (Lil Black)',
        price: 17.9,
        description: {
            es: 'Quik 5000 puffs · Compacto y discreto, ideal para llevar',
            zh: 'Quik 5000口 · 小巧便携，随时随地'
        },
        image: 'images/lilblack/peach.webp',
        flavors: [
            { name: 'Longan', nameCn: '龙眼', image: 'images/lilblack/longan.webp' },
            { name: 'Banana', nameCn: '香蕉', image: 'images/lilblack/banana.jpg' },
            { name: 'Durian', nameCn: '榴莲', image: 'images/lilblack/durian.jpg' },
            { name: 'Honeydew', nameCn: '蜜露', image: 'images/lilblack/honeydew.webp' },
            { name: 'Mango', nameCn: '芒果', image: 'images/lilblack/mango.webp' },
            { name: 'Coconut Ice', nameCn: '椰子冰', image: 'images/lilblack/coconut-ice.jpg' },
            { name: 'Peach', nameCn: '水蜜桃', image: 'images/lilblack/peach.webp' },
            { name: 'Guava', nameCn: '番石榴', image: 'images/lilblack/guava.webp' },
            { name: 'Lychee', nameCn: '荔枝', image: 'images/lilblack/lychee.webp' }
        ]
    },
    {
        id: 4,
        name: '冰王 (Elfbar IceKing)',
        price: 45,
        description: {
            es: 'Elfbar IceKing · Sabor frío potente, experiencia refrescante extrema',
            zh: 'Elfbar IceKing · 极强冰感，极致清凉体验'
        },
        image: 'images/iceking/grape-ice.webp',
        flavors: [
            { name: 'Jasmine Longjing', nameCn: '茉莉龙井', image: 'images/iceking/jasmine-longjing.webp' },
            { name: 'Salted Lemon', nameCn: '海盐柠檬', image: 'images/iceking/salted-lemon.webp' },
            { name: 'Tieguanyin', nameCn: '铁观音', image: 'images/iceking/tieguanyin.webp' },
            { name: 'Grape Ice', nameCn: '黑葡萄冰', image: 'images/iceking/grape-ice.webp' },
            { name: 'Green Grape Ice', nameCn: '青葡萄冰', image: 'images/iceking/green-grape-ice.webp' },
            { name: 'Green Tea', nameCn: '绿茶', image: 'images/iceking/green-tea.webp' }
        ]
    },
    {
        id: 5,
        name: '高维 (GOwif)',
        price: 25.9,
        description: {
            es: 'GOwif · Sabores únicos y refrescantes',
            zh: 'GOwif · 独特清爽口味'
        },
        image: 'images/gowif/passion-fruit.jpg',
        flavors: [
            { name: 'Peach Tea', nameCn: '桃茶', image: 'images/gowif/peach-tea.jpg' },
            { name: 'Passion Fruit', nameCn: '百香果', image: 'images/gowif/passion-fruit.jpg' },
            { name: 'Green Bean Ice', nameCn: '绿豆', image: 'images/gowif/green-bean-ice.jpg' },
            { name: 'Crispy Apple', nameCn: '脆苹果', image: 'images/gowif/crispy-apple.jpg' },
            { name: 'Lychee Ice', nameCn: '荔枝冰', image: 'images/gowif/lychee-ice.jpg' },
            { name: 'Plum Pineapple', nameCn: '话梅菠萝', image: 'images/gowif/plum-pineapple.jpg' },
            { name: 'Fresh Mint', nameCn: '清凉薄荷', image: 'images/gowif/fresh-mint.jpg' },
            { name: 'Watermelon Ice', nameCn: '西瓜冰', image: 'images/gowif/watermelon-ice.jpg' },
            { name: 'Green Grape', nameCn: '青葡萄', image: 'images/gowif/green-grape.jpg' },
            { name: 'Lime Ice', nameCn: '青柠冰', image: 'images/gowif/lime-ice.jpg' },
            { name: 'Jasmine Longjing', nameCn: '茉莉龙井', image: 'images/gowif/jasmine-longjing.jpg' },
            { name: 'Blueberry Raspberry', nameCn: '蓝莓覆盆子', image: 'images/gowif/blueberry-raspberry.webp' },
            { name: 'Bayberry Green Salt', nameCn: '杨梅绿盐', image: 'images/gowif/bayberry-green-salt.jpg' },
            { name: 'Taro Ice Cream', nameCn: '香芋冰淇淋', image: 'images/gowif/taro-ice-cream.jpg' }
        ]
    }
];

// ===== 状态管理 =====
let currentLanguage = 'zh'; // 默认语言：中文
let currentOrderId = 1;

// ===== DOM 元素 =====
const domElements = {
    languageSwitcher: document.querySelector('.language-switcher'),
    productsGrid: document.getElementById('products-grid'),
    purchaseModal: document.getElementById('purchase-modal'),
    modalProductInfo: document.getElementById('modal-product-info'),
    modalPhone: document.getElementById('modal-phone'),
    modalAmount: document.getElementById('modal-amount'),
    modalOrder: document.getElementById('modal-order'),
    confirmPurchase: document.getElementById('confirm-purchase')
};

// ===== 语言切换功能 =====
function initLanguageSwitcher() {
    const langButtons = document.querySelectorAll('.lang-btn');
    const popup = document.getElementById('lang-popup');
    const toggleBtn = document.getElementById('lang-toggle');

    // 弹窗开关
    if (toggleBtn && popup) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.classList.toggle('open');
        });
        // 点击页面其他地方关闭
        document.addEventListener('click', () => popup.classList.remove('open'));
        popup.addEventListener('click', (e) => e.stopPropagation());
    }

    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.dataset.lang;
            langButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            switchLanguage(lang);
            // 切换后关闭弹窗
            if (popup) popup.classList.remove('open');
        });
    });
}

function switchLanguage(lang) {
    currentLanguage = lang;

    // 更新html lang属性
    document.documentElement.lang = lang;

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

    // 产品排序：全部售罄的排最后
    const sorted = [...products].sort((a, b) => {
        const allSoldOut = p => p.flavors
            ? p.flavors.every(f => isSoldOut(p.id, f.name))
            : isSoldOut(p.id, 'default');
        return allSoldOut(a) - allSoldOut(b);
    });

    sorted.forEach(product => {
        domElements.productsGrid.appendChild(createProductCard(product));
    });
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;

    const flavorsHtml = product.flavors ? `
        <div class="flavor-selector">
            ${[...product.flavors].sort((a, b) => isSoldOut(product.id, a.name) - isSoldOut(product.id, b.name)).map((f, i) => `
                <button class="flavor-btn${i === 0 ? ' active' : ''}" data-flavor-index="${i}" data-product-id="${product.id}" data-flavor="${f.name}" title="${f.name}">
                    <img src="${f.image}" alt="${f.name}" onerror="this.style.display='none'">
                    <span>${currentLanguage === 'zh' ? f.nameCn : f.name}</span>
                </button>
            `).join('')}
        </div>
    ` : '';

    card.innerHTML = `
        <div class="product-image product-image-clickable">
            ${product.image ?
                `<img src="${product.image}" alt="${product.name}" class="product-main-img">` :
                `<div class="product-image-placeholder"><i class="fas fa-smoking"></i></div>`
            }
            <div class="product-image-hint"><i class="fas fa-expand"></i></div>
        </div>
        <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${product.description[currentLanguage]}</p>
            ${flavorsHtml}
            <div class="product-price">${CONFIG.defaultCurrency}${product.price.toFixed(2)}</div>
            <button class="buy-btn add-to-cart-btn" data-product-id="${product.id}">
                <i class="fas fa-cart-plus"></i>
                <span data-lang-key="add_to_cart">${TRANSLATIONS[currentLanguage].add_to_cart}</span>
            </button>
        </div>
    `;

    // 口味切换事件
    if (product.flavors) {
        const mainImg = card.querySelector('.product-main-img');
        card.querySelectorAll('.flavor-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                card.querySelectorAll('.flavor-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const flavor = product.flavors[parseInt(btn.dataset.flavorIndex)];
                mainImg.src = flavor.image;
                mainImg.alt = flavor.name;
            });
        });
    }

    // 点击图片打开详情页
    card.querySelector('.product-image-clickable').addEventListener('click', () => {
        const activeFlavorIndex = product.flavors
            ? parseInt(card.querySelector('.flavor-btn.active').dataset.flavorIndex)
            : 0;
        openProductDetail(product, activeFlavorIndex);
    });

    // 添加到购物车按钮事件
    const addToCartBtn = card.querySelector('.add-to-cart-btn');
    addToCartBtn.addEventListener('click', () => {
        const activeFlavor = product.flavors
            ? product.flavors[parseInt(card.querySelector('.flavor-btn.active').dataset.flavorIndex)]
            : null;
        const cartProduct = activeFlavor
            ? { ...product, id: `${product.id}-${activeFlavor.name}`, name: `${product.name} - ${currentLanguage === 'zh' ? activeFlavor.nameCn : activeFlavor.name}`, image: activeFlavor.image }
            : product;
        addToCart(cartProduct, 1);
        toggleCartSidebar();
    });

    return card;
}

// ===== 产品详情页 =====
function openProductDetail(product, activeFlavorIndex = 0) {
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

    function updateFlavor(index) {
        currentFlavorIndex = index;
        const flavor = product.flavors[index];
        mainImg.src = flavor.image;
        mainImg.alt = flavor.name;
        flavorNameEl.textContent = currentLanguage === 'zh' ? flavor.nameCn : flavor.name;
        flavorsEl.querySelectorAll('.detail-flavor-btn').forEach((b, i) => {
            b.classList.toggle('active', i === index);
        });
    }

    if (product.flavors) {
        flavorNameEl.style.display = 'block';
        flavorsEl.innerHTML = product.flavors.map((f, i) => {
            const soldOut = isSoldOut(product.id, f.name);
            return `<button class="detail-flavor-btn${i === activeFlavorIndex ? ' active' : ''}${soldOut ? ' sold-out-flavor' : ''}" data-index="${i}">
                <img src="${f.image}" alt="${f.name}">
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
        overlay.classList.remove('open');
        toggleCartSidebar();
    };

    overlay.classList.add('open');
}

function initProductDetail() {
    const overlay = document.getElementById('product-detail');
    document.getElementById('detail-close').addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.classList.remove('open');
    });
}

// ===== 购买模态框功能 =====
function openPurchaseModal(product) {
    if (!domElements.purchaseModal || !domElements.modalProductInfo) return;

    // 生成订单号
    const orderId = `ORDER-${String(currentOrderId++).padStart(3, '0')}`;

    // 更新模态框内容
    domElements.modalProductInfo.innerHTML = `
        <div class="modal-product">
            <h3>${product.name}</h3>
            <p>${product.description[currentLanguage]}</p>
            <p><strong>${TRANSLATIONS[currentLanguage].price}:</strong> ${CONFIG.defaultCurrency}${product.price.toFixed(2)}</p>
        </div>
    `;

    domElements.modalPhone.textContent = CONFIG.bizumPhone;
    domElements.modalAmount.textContent = `${CONFIG.defaultCurrency}${product.price.toFixed(2)}`;
    domElements.modalOrder.textContent = orderId;

    // 显示模态框
    domElements.purchaseModal.style.display = 'flex';

    // 添加模态框关闭事件
    const closeModal = document.querySelector('.close-modal');
    const cancelBtn = document.getElementById('cancel-purchase');
    const confirmBtn = document.getElementById('confirm-purchase');

    const closeModalHandler = () => {
        domElements.purchaseModal.style.display = 'none';
    };

    closeModal.addEventListener('click', closeModalHandler);
    cancelBtn.addEventListener('click', closeModalHandler);

    confirmBtn.addEventListener('click', () => {
        alert(`¡Gracias! Hemos registrado su pedido ${orderId}. Por favor envíe el comprobante de pago a nuestro WhatsApp.`);
        closeModalHandler();
    });

    // 点击模态框外部关闭
    domElements.purchaseModal.addEventListener('click', (e) => {
        if (e.target === domElements.purchaseModal) {
            closeModalHandler();
        }
    });
}

// ===== 初始化函数 =====
function initBizumInfo() {
    const phoneElements = document.querySelectorAll('#bizum-phone, #footer-phone');
    phoneElements.forEach(element => {
        element.textContent = CONFIG.bizumPhone;
    });
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
    el.className = 'cart-notification';
    el.innerHTML = `<i class="fas fa-exclamation-circle"></i><span>${message}</span>`;
    Object.assign(el.style, {
        position: 'fixed', top: '20px', right: '20px',
        backgroundColor: '#dc2626', color: '#fff',
        padding: 'var(--space-md) var(--space-lg)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        zIndex: '2000', display: 'flex', alignItems: 'center',
        gap: 'var(--space-sm)', animation: 'slideIn 0.3s ease'
    });
    document.body.appendChild(el);
    setTimeout(() => {
        el.style.animation = 'slideOut 0.3s ease';
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

function init() {
    // 初始化语言切换
    initLanguageSwitcher();

    // 初始化购物车系统
    initCart();

    // 初始化产品列表
    renderProducts();

    // 初始化产品详情页
    initProductDetail();

    // 初始化Bizum信息
    initBizumInfo();

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
            hint.innerHTML = '<i class="fas fa-check"></i> 已复制';
            setTimeout(() => { hint.innerHTML = '<i class="fas fa-copy"></i> 点击复制'; }, 2000);
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
        result.innerHTML = `<i class="fas fa-check-circle"></i> ${label} (-${res.percent}%)`;
        input.disabled = true;
        document.getElementById('coupon-apply-btn').textContent = '已使用';
        document.getElementById('coupon-apply-btn').disabled = true;
        updateCheckoutTotal();
    } else if (res.reason === 'used') {
        result.className = 'coupon-result error';
        result.innerHTML = '<i class="fas fa-times-circle"></i> 此优惠码已使用过 / Este código ya fue utilizado';
    } else {
        result.className = 'coupon-result error';
        result.innerHTML = '<i class="fas fa-times-circle"></i> 优惠码无效 / Código inválido';
    }
}

function updateCheckoutTotal() {
    const original = getCartTotalPrice();
    const discounted = getDiscountedTotal(original);
    const shipping = getShippingFee();
    const finalTotal = +(discounted + shipping).toFixed(2);

    const totalEl = document.getElementById('checkout-total-display');
    const originalEl = document.getElementById('checkout-original-price');
    const shippingRow = document.getElementById('shipping-row');
    const shippingEl = document.getElementById('shipping-fee-display');

    if (totalEl) totalEl.textContent = `€${finalTotal.toFixed(2)}`;
    if (originalEl) {
        if (activeDiscount) {
            originalEl.textContent = `€${(original + shipping).toFixed(2)}`;
            originalEl.style.display = 'block';
        } else {
            originalEl.style.display = 'none';
        }
    }
    if (shippingRow && shippingEl) {
        if (shipping > 0) {
            shippingEl.textContent = `€${shipping.toFixed(2)}`;
            shippingRow.style.display = 'flex';
        } else if (document.getElementById('btn-postal')?.classList.contains('active')) {
            shippingEl.textContent = '免费 / Gratis';
            shippingRow.style.display = 'flex';
        } else {
            shippingRow.style.display = 'none';
        }
    }
}

// ===== 滚动进场动画 =====
function initScrollAnimations() {
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
        el.style.transitionDelay = `${i * 0.08}s`;
        observer.observe(el);
    });

    // 标题和副标题
    document.querySelectorAll('.section-title, .section-subtitle, .payment-info').forEach(el => {
        el.classList.add('fade-up');
        observer.observe(el);
    });
}

// ===== 页面加载完成后初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    initSupabase();
    init();
    initAuth();
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

    // 首次访问且未登录时，延迟3秒弹出注册提示
    setTimeout(() => {
        if (!currentUser && !localStorage.getItem('welcome_dismissed')) {
            document.getElementById('welcome-register-modal').style.display = 'flex';
        }
    }, 3000);
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

const STATUS_ZH = { pending: '待确认', paid: '已付款', shipped: '已发货', delivered: '已完成', cancelled: '已取消' };

async function loadUserOrders() {
    const content = document.getElementById('orders-panel-content');
    content.innerHTML = '<div class="orders-loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';
    if (!currentUser) { content.innerHTML = '<div class="orders-empty"><i class="fas fa-user"></i><p>请先登录</p></div>'; return; }

    const { data, error } = await sbClient
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) { content.innerHTML = `<div class="orders-empty"><i class="fas fa-exclamation-circle"></i><p>加载失败</p></div>`; return; }
    if (!data?.length) { content.innerHTML = '<div class="orders-empty"><i class="fas fa-receipt"></i><p>暂无订单</p></div>'; return; }

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