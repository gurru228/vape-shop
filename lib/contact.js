/**
 * 店铺联系方式：全站唯一来源。
 * 浏览器通过 <script src="lib/contact.js"> 读取 window.SHOP_CONTACT，
 * Netlify 函数和测试通过 require('./contact') 读取。
 */
(function (root) {
    const WHATSAPP_PHONE = '34697332407';

    function whatsappDisplay(phone) {
        const digits = String(phone || WHATSAPP_PHONE);
        return `+${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 8)} ${digits.slice(8)}`;
    }

    function whatsappChatUrl(phone) {
        return `https://wa.me/${phone || WHATSAPP_PHONE}`;
    }

    const contact = Object.freeze({
        WHATSAPP_PHONE,
        whatsappDisplay,
        whatsappChatUrl,
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = contact;
    } else {
        root.SHOP_CONTACT = contact;
    }
})(typeof window !== 'undefined' ? window : globalThis);
