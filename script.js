// ===== 配置信息 =====
const CONFIG = {
    bizumPhone: '+34 612 345 678', // 替换为你的Bizum电话号码
    defaultCurrency: '€',
    storeName: 'VAPE STORE'
};

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
        payment_title: 'Pago Seguro',
        bizum_title: 'Pago con Bizum',
        bizum_desc: 'Pago directo a la cuenta del vendedor, rápido y seguro',
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

        // 页脚
        footer_desc: 'Tienda de vapeadores premium en España',
        copyright: '© 2026 VAPE STORE. Todos los derechos reservados.'
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
        payment_title: '安全支付',
        bizum_title: 'Bizum 支付',
        bizum_desc: '直接付款到商家账户，快速安全',
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

        // 页脚
        footer_desc: '西班牙优质电子烟专卖店',
        copyright: '© 2026 VAPE STORE. 保留所有权利。'
    }
};

// ===== 产品数据 =====
let products = [
    {
        id: 1,
        name: '鸭嘴兽 (Dash)',
        price: 12.99,
        description: {
            es: 'Diseño ergonómico, sabor suave y duradero',
            zh: '人体工学设计，口感柔和持久'
        },
        image: 'https://via.placeholder.com/300x200/000000/FFFFFF?text=Dash+Vape'
    },
    {
        id: 2,
        name: '冰爆 (IceMax)',
        price: 14.99,
        description: {
            es: 'Sabor intenso a menta con efecto refrescante',
            zh: '强劲薄荷口味，清凉感十足'
        },
        image: 'https://via.placeholder.com/300x200/000000/FFFFFF?text=IceMax+Vape'
    },
    {
        id: 3,
        name: '小黑条 (Lil Black)',
        price: 10.99,
        description: {
            es: 'Compacto y discreto, ideal para llevar',
            zh: '小巧隐蔽，便携设计'
        },
        image: 'https://via.placeholder.com/300x200/000000/FFFFFF?text=Lil+Black+Vape'
    },
    {
        id: 4,
        name: '冰王 (Elfbar IceKing)',
        price: 16.99,
        description: {
            es: 'Sabor frío potente, experiencia refrescante extrema',
            zh: '极强冰感，极致清凉体验'
        },
        image: 'https://via.placeholder.com/300x200/000000/FFFFFF?text=IceKing+Vape'
    }
];

// ===== 状态管理 =====
let currentLanguage = 'zh'; // 默认语言：中文
let currentOrderId = 1;

// ===== DOM 元素 =====
const domElements = {
    languageSwitcher: document.querySelector('.language-switcher'),
    productsGrid: document.getElementById('products-grid'),
    productForm: document.getElementById('product-form'),
    purchaseModal: document.getElementById('purchase-modal'),
    modalProductInfo: document.getElementById('modal-product-info'),
    modalPhone: document.getElementById('modal-phone'),
    modalAmount: document.getElementById('modal-amount'),
    modalOrder: document.getElementById('modal-order')
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

    card.innerHTML = `
        <div class="product-image">
            ${product.image ?
                `<img src="${product.image}" alt="${product.name}">` :
                `<div class="product-image-placeholder">
                    <i class="fas fa-smoking"></i>
                </div>`
            }
        </div>
        <div class="product-info">
            <h3 class="product-name">${product.name}</h3>
            <p class="product-description">${product.description[currentLanguage]}</p>
            <div class="product-price">${CONFIG.defaultCurrency}${product.price.toFixed(2)}</div>
            <button class="buy-btn" data-product-id="${product.id}">
                <i class="fas fa-shopping-cart"></i>
                <span data-lang-key="buy_now">${TRANSLATIONS[currentLanguage].buy_now}</span>
            </button>
        </div>
    `;

    // 添加购买按钮事件
    const buyBtn = card.querySelector('.buy-btn');
    buyBtn.addEventListener('click', () => openPurchaseModal(product));

    return card;
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

// ===== 产品管理功能 =====
function initProductForm() {
    if (!domElements.productForm) return;

    const clearBtn = document.getElementById('clear-form');

    // 表单提交
    domElements.productForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const productId = document.getElementById('product-id').value;
        const name = document.getElementById('product-name').value;
        const price = parseFloat(document.getElementById('product-price').value);
        const descEs = document.getElementById('product-desc-es').value;
        const descZh = document.getElementById('product-desc-zh').value;
        const image = document.getElementById('product-image').value;

        if (productId) {
            // 编辑现有产品
            const index = products.findIndex(p => p.id === parseInt(productId));
            if (index !== -1) {
                products[index] = {
                    id: parseInt(productId),
                    name,
                    price,
                    description: { es: descEs, zh: descZh },
                    image: image || products[index].image
                };
            }
        } else {
            // 添加新产品
            const newProduct = {
                id: products.length > 0 ? Math.max(...products.map(p => p.id)) + 1 : 1,
                name,
                price,
                description: { es: descEs, zh: descZh },
                image: image || ''
            };
            products.push(newProduct);
        }

        // 重新渲染产品并重置表单
        renderProducts();
        domElements.productForm.reset();
        document.getElementById('product-id').value = '';

        alert('Producto guardado exitosamente');
    });

    // 清空表单
    clearBtn.addEventListener('click', () => {
        domElements.productForm.reset();
        document.getElementById('product-id').value = '';
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

    // 初始化产品列表
    renderProducts();

    // 初始化产品表单
    initProductForm();

    // 初始化Bizum信息
    initBizumInfo();

    // 设置默认语言
    switchLanguage(currentLanguage);

    console.log('Vape Store initialized successfully');
    console.log('Product count:', products.length);
    console.log('Current language:', currentLanguage);
}

// ===== 页面加载完成后初始化 =====
document.addEventListener('DOMContentLoaded', init);

// ===== 导出供开发使用 =====
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        products,
        TRANSLATIONS,
        switchLanguage,
        renderProducts
    };
}