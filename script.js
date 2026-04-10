// ===== 配置信息 =====
const CONFIG = {
    bizumPhone: '+34 697 332 407',
    defaultCurrency: '€',
    storeName: 'VAPE STORE'
};

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
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${CONFIG.defaultCurrency}${item.price.toFixed(2)}</div>
            <div class="cart-item-controls">
                <div class="quantity-control">
                    <button class="quantity-btn minus" data-product-id="${item.id}">-</button>
                    <span class="quantity-value">${item.quantity}</span>
                    <button class="quantity-btn plus" data-product-id="${item.id}">+</button>
                </div>
                <button class="remove-item-btn" data-product-id="${item.id}">
                    <i class="fas fa-trash"></i>
                    <span data-lang-key="remove_from_cart">${TRANSLATIONS[currentLanguage].remove_from_cart}</span>
                </button>
            </div>
        </div>
        <div class="cart-item-subtotal">${CONFIG.defaultCurrency}${subtotal.toFixed(2)}</div>
    `;

    // 添加事件监听器
    const minusBtn = itemElement.querySelector('.quantity-btn.minus');
    const plusBtn = itemElement.querySelector('.quantity-btn.plus');
    const removeBtn = itemElement.querySelector('.remove-item-btn');

    minusBtn.addEventListener('click', () => {
        updateCartItemQuantity(item.id, item.quantity - 1);
    });

    plusBtn.addEventListener('click', () => {
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
        cartCheckout.addEventListener('click', () => {
            if (cart.length === 0) {
                alert(TRANSLATIONS[currentLanguage].cart_empty);
                return;
            }
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
    errorEl.style.display = 'none';
    document.getElementById('checkout-customer-name').value = '';
    document.getElementById('checkout-customer-phone').value = '';
    document.getElementById('checkout-address').value = '';
    document.getElementById('address-group').style.display = 'none';
    document.getElementById('time-group').style.display = 'none';
    document.getElementById('checkout-time-from').value = '10:00';
    document.getElementById('checkout-time-to').value = '14:00';
    document.getElementById('btn-pickup').classList.add('active');
    document.getElementById('btn-delivery').classList.remove('active');

    // 自取 / 外送切换
    const totalQty = cart.reduce((s, i) => s + i.quantity, 0);
    document.getElementById('btn-pickup').onclick = () => {
        document.getElementById('btn-pickup').classList.add('active');
        document.getElementById('btn-delivery').classList.remove('active');
        document.getElementById('address-group').style.display = 'none';
        errorEl.style.display = 'none';
    };
    document.getElementById('btn-delivery').onclick = () => {
        if (totalQty < 5) {
            errorEl.textContent = '外送至少需要5件商品 / Se necesitan mínimo 5 unidades para entrega a domicilio';
            errorEl.style.display = 'block';
            return;
        }
        document.getElementById('btn-delivery').classList.add('active');
        document.getElementById('btn-pickup').classList.remove('active');
        document.getElementById('address-group').style.display = 'block';
        document.getElementById('time-group').style.display = 'block';
        errorEl.style.display = 'none';
    };

    // 填充购物车摘要
    summaryEl.innerHTML = cart.map(item => `
        <div class="checkout-summary-item">
            <span>${item.name} ×${item.quantity}</span>
            <span>${CONFIG.defaultCurrency}${(item.price * item.quantity).toFixed(2)}</span>
        </div>
    `).join('');
    totalEl.textContent = `${CONFIG.defaultCurrency}${getCartTotalPrice().toFixed(2)}`;

    modal.style.display = 'flex';

    // 关闭按钮
    document.getElementById('checkout-modal-close').onclick = () => modal.style.display = 'none';
    modal.onclick = (e) => { if (e.target === modal) modal.style.display = 'none'; };

    // Bizum 支付
    document.getElementById('btn-pay-bizum').onclick = async () => {
        const name = document.getElementById('checkout-customer-name').value.trim();
        const phone = document.getElementById('checkout-customer-phone').value.trim();
        const isDelivery = document.getElementById('btn-delivery').classList.contains('active');
        const address = document.getElementById('checkout-address').value.trim();
        const timeFrom = document.getElementById('checkout-time-from').value;
        const timeTo = document.getElementById('checkout-time-to').value;
        if (!name || !phone) {
            errorEl.textContent = '请填写姓名和手机号 / Por favor complete su nombre y teléfono';
            errorEl.style.display = 'block';
            return;
        }
        if (isDelivery && !address) {
            errorEl.textContent = '请填写收货地址 / Por favor introduzca la dirección de entrega';
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';
        document.getElementById('btn-pay-bizum').disabled = true;
        document.getElementById('btn-pay-bizum').textContent = '处理中...';

        try {
            const res = await fetch('/.netlify/functions/save-bizum-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart, customerName: name, customerPhone: phone, deliveryType: isDelivery ? 'delivery' : 'pickup', address: isDelivery ? address : '', deliveryTime: isDelivery ? `${timeFrom} - ${timeTo}` : '' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            document.getElementById('bizum-amount-display').textContent = `${CONFIG.defaultCurrency}${data.total.toFixed(2)}`;
            document.getElementById('bizum-order-display').textContent = data.orderNumber;
            // WhatsApp 链接带上订单号
            const waMsg = encodeURIComponent(`Hola! Acabo de hacer el pago por Bizum.\nPedido: ${data.orderNumber}\nImporte: €${data.total.toFixed(2)}\n(附上截图 / adjunto captura)`);
            document.getElementById('bizum-whatsapp-btn').href = `https://wa.me/34697332407?text=${waMsg}`;
            stepInfo.style.display = 'none';
            stepBizum.style.display = 'block';

            document.getElementById('bizum-confirm-btn').onclick = () => {
                modal.style.display = 'none';
                clearCart();
                alert('¡Gracias! / 谢谢！我们确认收款后会联系您。');
            };
            document.getElementById('checkout-cancel-btn').onclick = () => modal.style.display = 'none';
        } catch (err) {
            errorEl.textContent = '出错了，请重试 / Error, inténtelo de nuevo';
            errorEl.style.display = 'block';
        } finally {
            document.getElementById('btn-pay-bizum').disabled = false;
            document.getElementById('btn-pay-bizum').innerHTML = '<i class="fas fa-mobile-alt"></i><span>Bizum</span><small>转账支付</small>';
        }
    };

    // 银行卡支付
    document.getElementById('btn-pay-card').onclick = async () => {
        const name = document.getElementById('checkout-customer-name').value.trim();
        const phone = document.getElementById('checkout-customer-phone').value.trim();
        const isDelivery = document.getElementById('btn-delivery').classList.contains('active');
        const address = document.getElementById('checkout-address').value.trim();
        const timeFrom = document.getElementById('checkout-time-from').value;
        const timeTo = document.getElementById('checkout-time-to').value;
        if (!name || !phone) {
            errorEl.textContent = '请填写姓名和手机号 / Por favor complete su nombre y teléfono';
            errorEl.style.display = 'block';
            return;
        }
        if (isDelivery && !address) {
            errorEl.textContent = '请填写收货地址 / Por favor introduzca la dirección de entrega';
            errorEl.style.display = 'block';
            return;
        }
        errorEl.style.display = 'none';
        document.getElementById('btn-pay-card').disabled = true;
        document.getElementById('btn-pay-card').textContent = '跳转中...';

        try {
            const res = await fetch('/.netlify/functions/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cart, customerName: name, customerPhone: phone, deliveryType: isDelivery ? 'delivery' : 'pickup', address: isDelivery ? address : '', deliveryTime: isDelivery ? `${timeFrom} - ${timeTo}` : '' })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
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
        store_name: 'VAPE STORE',
        products: 'Productos',
        about: 'Nosotros',
        contact: 'Contacto',

        // 英雄区域
        hero_title: 'Vapeadores Premium, Experiencia Pura',
        hero_subtitle: 'Cuatro sabores seleccionados para sus necesidades',

        // 产品区域
        products_title: 'Productos Destacados',
        products_subtitle: 'Cuatro sabores únicos, uno perfecto para usted',

        // 产品描述
        dash_desc: 'Diseño ergonómico, sabor suave y duradero',
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
        about_offers_desc: 'Compra 3 y llévate 1 gratis, descuentos especiales y promociones continuas para que disfrutes al mejor precio.',

        // 页脚
        footer_desc: 'Tienda de vapeadores premium en España',
        copyright: '© 2026 VAPE STORE. Todos los derechos reservados.',

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
        store_name: '电子烟专卖店',
        products: '产品',
        about: '关于',
        contact: '联系',

        // 英雄区域
        hero_title: '优质电子烟，纯净体验',
        hero_subtitle: '四种精选口味，满足您的需求',

        // 产品区域
        products_title: '精选产品',
        products_subtitle: '四种独特口味，总有一款适合您',

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
        about_offers_desc: '买三送一、不定期特惠，让您以最实惠的价格享受最优质的电子烟体验。',

        // 页脚
        footer_desc: '西班牙优质电子烟专卖店',
        copyright: '© 2026 VAPE STORE. 保留所有权利。',

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
            es: 'Diseño ergonómico, sabor suave y duradero',
            zh: '人体工学设计，口感柔和持久'
        },
        image: 'images/dash/coconut-water.webp',
        flavors: [
            { name: 'Coconut Water', nameCn: '椰子水', image: 'images/dash/coconut-water.webp' },
            { name: 'Matcha Smoothie', nameCn: '抹茶思慕雪', image: 'images/dash/matcha-smoothie.webp' },
            { name: 'Peach Ice', nameCn: '水蜜桃冰', image: 'images/dash/peach-ice.webp' },
            { name: 'Pink Guava', nameCn: '粉红番石榴', image: 'images/dash/pink-guava.webp' },
            { name: 'Jasmine LongJing Tea', nameCn: '茉莉龙井', image: 'images/dash/jasmine-longjing.webp' },
            { name: 'Green Grape', nameCn: '青葡萄', image: 'images/dash/green-grape.jpeg' }
        ]
    },
    {
        id: 2,
        name: '冰爆 (IceMax)',
        price: 20,
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
            { name: 'Peach', nameCn: '水蜜桃', image: 'images/lilblack/peach.webp' },
            { name: 'Guava', nameCn: '番石榴', image: 'images/lilblack/guava.webp' },
            { name: 'Lychee', nameCn: '荔枝', image: 'images/lilblack/lychee.webp' },
            { name: 'Longan', nameCn: '龙眼', image: 'images/lilblack/longan.webp' },
            { name: 'Mango', nameCn: '芒果', image: 'images/lilblack/mango.webp' },
            { name: 'Honeydew', nameCn: '哈密瓜', image: 'images/lilblack/honeydew.webp' }
        ]
    },
    {
        id: 99,
        name: '测试商品 (Test)',
        price: 0.50,
        description: {
            es: 'Producto de prueba',
            zh: '支付测试用，请勿购买'
        },
        image: ''
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
            { name: 'Grape Ice', nameCn: '黑葡萄冰', image: 'images/iceking/grape-ice.webp' },
            { name: 'Green Grape Ice', nameCn: '青葡萄冰', image: 'images/iceking/green-grape-ice.webp' },
            { name: 'Green Tea', nameCn: '绿茶', image: 'images/iceking/green-tea.webp' }
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

    langButtons.forEach(button => {
        button.addEventListener('click', () => {
            const lang = button.dataset.lang;

            // 更新按钮状态
            langButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // 切换语言
            switchLanguage(lang);
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
}

// ===== 产品渲染功能 =====
function renderProducts() {
    if (!domElements.productsGrid) return;

    domElements.productsGrid.innerHTML = '';

    products.forEach(product => {
        const productCard = createProductCard(product);
        domElements.productsGrid.appendChild(productCard);
    });
}

function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.dataset.productId = product.id;

    const flavorsHtml = product.flavors ? `
        <div class="flavor-selector">
            ${product.flavors.map((f, i) => `
                <button class="flavor-btn${i === 0 ? ' active' : ''}" data-flavor-index="${i}" title="${f.name}">
                    <img src="${f.image}" alt="${f.name}">
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
            ? { ...product, name: `${product.name} - ${currentLanguage === 'zh' ? activeFlavor.nameCn : activeFlavor.name}`, image: activeFlavor.image }
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
        flavorsEl.innerHTML = product.flavors.map((f, i) => `
            <button class="detail-flavor-btn${i === activeFlavorIndex ? ' active' : ''}" data-index="${i}">
                <img src="${f.image}" alt="${f.name}">
                <span>${currentLanguage === 'zh' ? f.nameCn : f.name}</span>
            </button>
        `).join('');
        flavorsEl.querySelectorAll('.detail-flavor-btn').forEach(btn => {
            btn.addEventListener('click', () => updateFlavor(parseInt(btn.dataset.index)));
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
            ? { ...product, name: `${product.name} - ${currentLanguage === 'zh' ? activeFlavor.nameCn : activeFlavor.name}`, image: activeFlavor.image }
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

    console.log('Vape Store initialized successfully');
    console.log('Product count:', products.length);
    console.log('Current language:', currentLanguage);
    console.log('Cart items:', cart.length);
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
    init();
    // 产品卡片渲染后再初始化动画（稍微延迟确保 DOM 已更新）
    setTimeout(initScrollAnimations, 50);
});

// ===== 导出供开发使用 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        products,
        TRANSLATIONS,
        switchLanguage,
        renderProducts
    };
}