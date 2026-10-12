/**
 * 顾客评价 / Reseñas de clientes
 *
 * 不要编造评价。SHOP_REVIEWS 留空时，首页只显示「暂无评价」说明。
 * No invente reseñas. Si el array está vacío, la página solo muestra que aún no hay reseñas.
 *
 * 添加一条真实评价时，追加一个对象（不要把 placeholder 设为 true）：
 * Para añadir una reseña real, añada un objeto (sin placeholder: true):
 *
 * {
 *   name: '顾客昵称或名字',
 *   text: '顾客原话，不要改写成广告。',
 *   date: '2026-03-01',
 *   product: '鸭嘴兽 (Dash)',
 *   placeholder: false
 * }
 *
 * placeholder: true 的条目会带上「这不是真实评价」标记，只适合看版式。
 * Las entradas con placeholder: true se marcan como ejemplo y no son reseñas reales.
 */
window.SHOP_REVIEWS = [];
