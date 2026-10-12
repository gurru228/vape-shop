/**
 * 实拍照片 / Fotos reales del local
 *
 * 怎么加一张您自己拍的照片：
 * Cómo añadir una foto hecha por usted:
 * 1. 把文件放到 images/real/（建议宽约 800px 的 jpg 或 webp）
 *    Guarde el archivo en images/real/ (jpg o webp, unos 800px de ancho).
 * 2. 在 REAL_PHOTOS 里追加一项
 *    Añada un objeto al array:
 *    { src: 'images/real/mostrador.webp', alt: '店内柜台', altEs: 'Mostrador de la tienda' }
 * 3. 不要使用网图、图库照片或 AI 生成的图片
 *    No use fotos de stock ni imágenes generadas.
 *
 * 数组为空时，页面只显示空位和这段说明。
 * Si el array está vacío, la página muestra huecos vacíos y estas instrucciones.
 */
window.REAL_PHOTOS = [];
