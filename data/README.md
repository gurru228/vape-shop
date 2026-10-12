# 鸭嘴兽互动区 / Sección interactiva Dash

首页「鸭嘴兽」互动区的全部内容都来自 `data/platypus.json`，改这一个文件即可，不用动 `platypus.js`。

## 加一个口味

在 `flavors` 数组里追加一项：

```json
{
  "id": "1-Lime Ice",
  "name": { "zh": "青柠冰", "es": "Lime Ice", "en": "Lime Ice" },
  "image": "images/dash/lime-ice.webp",
  "tags": {
    "zh": ["冰凉", "酸"],
    "es": ["helado", "ácido"],
    "en": ["icy", "sour"]
  }
}
```

- `id` 写成 `1-` 加上 `script.js` 里该口味的英文名，和购物车用的 id 一致。
- 新口味要先加进 `script.js` 的商品 1 和 `lib/catalog.json`，否则不能下单。这里只负责展示。
- 图片放进 `images/dash/`，宽约 400px 的 webp。
- `tags` 只写目录里已有的标签。不要编造口感、口数、尼古丁含量。

## 改热点（吸嘴 / 电池 / 气流）

`hotspots` 里每项的 `x`、`y` 是圆点在图片上的位置，单位是百分比（左上角为 0,0）。`info` 是提示文字。

目录里没有这些部件的规格，所以目前三项都是 `"placeholder": true`，界面会显示「占位」。拿到厂家资料后，把 `info` 换成真实内容并把 `placeholder` 改成 `false`。

## 其它字段

- `puffs`：整机口数，来自 `script.js` 的商品描述（4000）。不是每个口味的实测值。
- `description`：中文和西语抄自 `script.js`；英文是同一句的翻译。
- `ui`：标题、提示语等界面文字。`flavorTip` 里的 `{tags}`、`{puffs}`（以及可选的 `{name}`）会被替换；`puffLine` 里的 `{puffs}` 同理。

改完刷新页面即可。线上若看不到更新，可能是浏览器缓存，强制刷新一次。

---

ES: toda la sección se configura en `data/platypus.json`. Añada sabores en `flavors` y ajuste los puntos en `hotspots` (porcentajes sobre la foto). No invente especificaciones: deje `placeholder: true` hasta tener datos del fabricante.
