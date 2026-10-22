# 口粮专卖店 v3 — 交接说明

> 给新会话的 Claude：这是正式站 `gurru228/vape-shop` 的 v3 分支（`v3-3d`），代码在 `~/vape-shop-v3`。
> 回复店主请用中文、简短。**合并到 main、改 Supabase、改 Netlify 设置、在正式 Telegram 里测试，都要先问店主。**
> `~/vape-shop` 里有店主没提交的改动，不要碰。`~/vape-shop-3d` 是之前的 3D 样稿，已经搬进这里，不再用。

## 这次做了什么

把 3D 样稿（`~/vape-shop-3d`）变成正式站，直接替换老首页；后台和数据都并到原来的 Supabase。

- **首页** = 3D 样稿：鸭嘴兽 3D、衣架海报墙、选口味抽屉、三步下单、集章卡（每款满 10 送 1）、开屏海报、会员账户。
  - 源码在 `site/`（`site/index.html` + `site/src/*.js`），`sh build.sh` 生成根目录 `index.html`（提交到 git，Netlify 不用构建）。
  - 图片不再内嵌，直接用 `images/`（页面从 3 MB 变成约 180 KB）。
  - 保留 noindex（店主要求继续保密）：页面 meta + `_headers` 的 `X-Robots-Tag`。不要加 robots.txt。
- **数据全在 Supabase**（不再用 Netlify Blobs）：
  - 新表 `members`（会员 + 章）、`member_sessions`（只存 token 的 sha256）；
  - `orders` 表加了列：`member_id earn gifts stamped gift_held form coupon tg_message tg_text decided_at`。新订单和老订单在同一张表，后台一起看；
  - 函数 `member_add_stamps()`：一句 SQL 原子加/扣章；
  - 迁移文件：`supabase/migrations/20261021000000_members_stamps.sql`（只加不删，可重复执行）。
- **状态统一**（`orders.payment_status`）：`pending` 待确认 · `paid` 已确认 · `shipped` 已发货 · `delivered` 已完成 · `cancelled` 已取消。
  - 不管在 Telegram 点 ✅ 还是在后台改成「已确认」，走的都是同一个 `setStatus()`（`netlify/lib/shop.mjs`）：会员盖章（只盖一次）、扣库存。
  - 改回待确认会退库存。改成「已取消」会撤章、退赠品用掉的 10 个章、退库存。
  - 后台改状态后，Telegram 里那条订单消息也会更新。
- **库存 / 缺货**：后台「库存管理」填 0，网站上那个口味就变灰、标「缺货」，不能加购（`/api/stock`，缓存 60 秒）。
  - 服务器下单时也会再查一遍，拦住缺货的口味。空着不填 = 不记库存，照常卖。
- **后台 `admin.html`**（同一个 ADMIN_PASSWORD）：
  - 产品口味表由 build.sh 从 `site/src/products.json` 自动生成；
  - 「待付款」改成「待确认」，去掉了付款方式筛选，加了「邮寄」筛选；
  - 订单卡显示「会员 · 已盖章」「🎁 集章赠品」和优惠码；老订单显示「老网站 · Bizum/现金」；
  - 「注册用户」页改成「会员 · 集章」：每款章数，可以 ＋/− 手动补章、扣章；下面是还没搬过来的老网站邮箱账号。
- **老网站账号**（Supabase Auth，44 个邮箱）：用原邮箱 + 原密码登录新站，第一次登录时去 Supabase Auth 核对一次密码，然后自动建成会员，章从 0 开始；他在老网站的订单会出现在「我的」里。
- **已删除**：Stripe 刷卡、Bizum 下单（店主说付款都走 WhatsApp）、老的 `script.js` / `styles.css` / `order-status.html` / `checkout-success.html`。
- **sw.js**：换成一个「清缓存」版本。老访客的浏览器会删掉旧缓存，自动刷新一次到新页面，以后不再缓存任何东西。

## IceMax 清仓（2026-10-21 加的）

- 价格：`site/src/products.json` 里 IceMax 现在是 `price 15.9`，`was 22.9`（原价，划线显示），`clearance: true`。页面和海报上的价格都从这里读，改价只改这一个文件再跑 `sh build.sh`。
  清仓结束时：删掉 `was` 和 `clearance`，`price` 改回去，再跑 `sh build.sh`。
  页面上的清仓区块（`#clearance`）和开屏清仓弹窗（`createClearance` 那段，在 `site/src/app.js`）也要一起去掉。
- 3D 模型：`site/src/ice-model.js`（`buildIcemax`），照店主拍的实物照片做的。`createDevice(canvas, { build: buildIcemax })` 就能用。
- 弹窗：每次进站先弹「买 10 送 1」集章卡海报（注册会员），关掉后再弹清仓海报（`site/src/clearance.js`）。海报里不写漏油。
  顺序在 `site/src/app.js`：`createPromo({ ..., onDone: showClearance })`。
- 漏油提示：出现在首页清仓区块、选口味抽屉、购物车、结算页。文案在 `site/src/util.js` 的 `LEAK_TITLE` 和 `LEAK_BODY`，不写「当面检查 / 联系我们」（店主说：已告知，不退）。
- 下单：购物车里有 IceMax（或者用集章换的赠品是 IceMax）时，必须勾选「我已看清」才能提交；服务器也会检查（`order.mjs`）。
  订单的 `form.ackLeak = true`，Telegram 消息里会多一行「⚠️ 含 IceMax 清仓款：顾客已勾选确认知晓少量漏油」。
- 集章照常：清仓价的 IceMax 一样每支盖 1 个章。
- 清仓海报只写 IceMax（不写「冰爆」），价签放在模型右边，不挡模型。

## 集章卡入口

- 顶部购物车左边有「集章卡」按钮（手机上只显示图标 + 数字）。点开是一个小面板，列出每款的章数；会员有满卡时，按钮上显示「N 满」。
- 页面里的 3D 集章卡区块在 IceMax 清仓下面、尼古丁警告上面。面板里点「看 3D 集章卡」会滚到那里。
- 领卡 = 注册会员账号：海报、集章区块、顶部面板、结算页、注册弹窗都写明了「注册会员账号（手机号或邮箱 + 密码）」，按钮叫「注册会员领卡」/「注册账号并领卡」。
- 测试：`ONLY=d sh qa/run.sh node qa/sweep.mjs     # 全站走一遍（d / m 分开跑）
ONLY=d sh qa/run.sh node qa/perf.mjs      # 开页卡不卡
ONLY=d sh qa/run.sh node qa/clearance.mjs`。

## 海报墙点不了（2026-10-22 修好）

- 原因：海报是布料模拟，每帧都在动，但点击检测用的包围球还停在刚生成时的位置，鼠标在海报滑进来时扫过就会点不中。
- 修法：`site/src/tags.js` 每帧 `computeBoundingSphere()`；海报背面也能点。

## 2026-10-22：流畅度、保护、小修

- 赠品价格显示 `€0.00`（购物车、结算、收据、Telegram、后台）。
- 弹窗：游客先看集章卡注册海报，再看 IceMax；**已登录会员只弹 IceMax**。弹窗、抽屉、购物车、账户框打开时页面不能滚（`lockScroll` 在 `site/src/util.js`），点海报上的按钮要等最后一张关掉才滚动。
- 流畅度（`qa/perf.mjs` 量开页卡顿）：
  - 口味颜色在 `build.sh` 里算好（`FLAVOR_COLORS`），浏览器不再每张图算一次（以前开页卡好几秒）；
  - IceMax、海报墙、集章卡三个 3D 场景滚到附近才创建（`whenNear`），离开屏幕就停；
  - 清仓海报关掉时不再 `forceContextLoss`（会卡 5 秒）；
  - 手机上降低分辨率和阴影；字体不挡首屏；图片缓存一天。
  - 本地测开页阻塞从约 9.5 秒降到约 1.2 秒（软件渲染，真机快得多）。
- 保护：
  - 限流（Netlify 自带，写在函数的 `config.rateLimit`，所有套餐都能用）：下单 8 次/分钟/IP，登录注册 40 次/分钟/IP，后台 60 次/分钟/IP；会员密码错 8 次锁 15 分钟（原来就有）。
  - 后台密码：常数时间比较，错了停 1.2 秒再回（`netlify/lib/admin-auth.js`、`shop.mjs` 的 `adminOk`）。`notify-status` 现在也要后台密码。
  - 安全响应头（`_headers`）：禁止被别的网站嵌入、HTTPS、CSP 等。首页还有自己更严的 CSP：只允许那一段内联脚本（`build.sh` 算 hash），所以**改完 site/ 一定要跑 `sh build.sh`**，不能手改根目录的 index.html。
  - 后台订单卡上的 id / 代理名也做了转义。
- 小修：同一个 IceMax 勾选不会带到下一单；外送不满 5 件会提示原因；赠品口味缺货服务器会拦；游客在海报里点「已经有账户？登录」，登录后 IceMax 海报照常出现。
- 文字精简：首页、两张海报、购物车、注册框的说明都缩短了（意思不变）。
- 游客下单：点「提交订单」时先问一次「这单能盖 N 个章，现在注册就算数；直接下单这单不能集章，以后也补不了」。
  选「注册会员，这单集章」→ 注册框 → 注册完回到结算再点提交，这单就是会员单；选「不注册，直接下单」→ 照常提交（`checkout.js` 的 `askGuest`）。
- 改价：IceMax €15.90（原价 €22.90），冰王 €30.00。
- 只领赠品：会员卡满了，购物车里什么都不买也能下单领那 1 支（应付 €0.00，按钮写「只领赠品，去填写取货信息」）。服务器只允许已登录会员这样下单，游客空单照样拦；这单扣 10 个章、不盖章，取消会退回。
- 有货的口味排前面，缺货的放最后（选口味抽屉、IceMax 口味按钮）；首页鸭嘴兽那 9 个口味按钮只挑有货的，自动轮播也跳过缺货。测试：`sh qa/run.sh node qa/giftonly.mjs`。
- 集满提示：会员某张卡满 10 个章时，开屏海报关掉后左下角弹出小提示「✱ 鸭嘴兽 集满 10 个章了！送你 1 支……」，点「去领取」打开购物车（赠品已在里面）。每张卡每次打开网站只提示一次，12 秒后自动消失。下单确认后刚集满时也会弹。测试：`sh qa/run.sh node qa/fullnote.mjs`。
- 新测试：`ONLY=d sh qa/run.sh node qa/sweep.mjs`（全站走一遍：报错、溢出、遮罩、锁滚动）、`ONLY=d sh qa/run.sh node qa/perf.mjs`（卡顿）。

## 赠品要顾客自己领（2026-10-22）

- 卡满 10 个章后，购物车里只出现「领取赠品」按钮，不会自动加一支。顾客点了才加进这单（可以选口味、也可以点「这次不领」）；不领的话章保留，下次再领。
- 集满提示的「去领取」只是打开购物车，顾客自己点领取。

## 页面顺序（2026-10-22）

- 首页从上到下：鸭嘴兽 Dash → 海报墙（「挂在墙上的口粮」+ 款式按钮）→ IceMax 清仓 → 集章卡 → 尼古丁警告 → 配送。
- 自取不写营业时间，改成「WhatsApp 联系客服约时间」（首页配送卡片、结算页自取说明都是）。

## 购物车按钮 · 游客横幅 · 精简文字（2026-10-22）

- 选口味抽屉：加入购物车后，底部出现「查看购物车 (N)」整行按钮（`#dCart`），手机上不用往下翻也能去结算。
- 游客横幅（`#joinStrip`）：顶部年龄提示下面一条砖红色横幅，文字慢慢滚动「注册会员就能集章 · 同一款满 10 支送 1 支 · 点这里 30 秒注册」，点它打开注册框，× 关掉（本次浏览不再出现）。会员看不到。
- 精简文字：去掉首页「拖动转一圈…」、集章区的说明段、「常驻活动」、样卡上的「注册后是你的」、页脚的 WhatsApp 链接（右下角绿色按钮已经有）；产品简介缩短（`products.json` 的 `desc.zh`）；年龄提示缩短。

## 手机流畅度 · 集章图标 · 二维码（2026-10-22）

- 手机打开网站不再卡：IceMax 清仓弹窗在手机上显示产品照片（轮流换口味），不建 3D；电脑上弹窗打开后再在空闲时建 3D。
  页面里的 3D（IceMax、海报墙、集章卡）一个一个排队建，建之前先编译好；手机上不建反光贴图（用天光代替），海报墙阴影用简单模式。
  测试机上手机最长一次卡顿从约 2.5 秒降到约 0.16 秒。
- 顶部集章卡按钮的图标换成红色圆章「章」（SVG，在 `site/index.html` 的 `#cardBtn` 里）；手机上只显示章，有章时右上角显示数字。
- 网站二维码在 `qrcode/`：`网站二维码.png` / `.svg`（纯码），`网站二维码-卡片.png`（带店名和「扫码下单」，适合打印）。指向 https://vapeshop2026.netlify.app/ ——如果以后换了自己的域名，要重新生成。

## 上线前最后检查（2026-10-22）

- 修了审查发现的问题：
  - 一张满卡能领多个赠品（用 "01"、"1.0" 这种重复的款式号）→ 服务器只认标准款式号，一款一个赠品。
  - 登录过期的会员下单会悄悄变成游客单（没章、赠品丢了）→ 现在提示重新登录（401）。
  - 已取消的会员订单在后台改回去会重复给章 / 赠品 → 会员订单取消后不能恢复，后台会提示让顾客重新下单。
  - 读不到库存时服务器不再「当作都有货」，会拒绝下单。
  - 删除账户时，它的订单保留但解除关联（同号码重新注册的人看不到也继承不了）。
  - 购物车里已下架的商品 / 口味加载时自动去掉。
  - 后台统计的取货方式文字转义。
- 删掉了没人用、又能被人乱刷的老函数：`track-click`（访问统计，会刷屏 Telegram）、`get-clicks`、`notify-register`、`stats.html`；`package.json` 里没用的依赖也去掉了。
- `get-inventory`（精确库存数字）现在要后台密码；网站前台只用 `/api/stock`（哪些缺货）。
- `HANDOFF.md`、`README.md`、`package.json`、`images_original/`、`*.bak` 等内部文件不再能从网址打开（`_redirects`）。
- Three.js 加了 SRI 校验（CDN 文件被改就不运行）。
- WhatsApp 链接不再在网页里露出手机号：页面链到 `/api/wa?text=…`，由 `netlify/functions/wa.mjs` 跳转到 wa.me。号码在 Netlify 环境变量 `WA_NUMBER`（没设就用代码里的默认号）。注意：打开 WhatsApp 对话后，号码在 WhatsApp 里还是看得到，这是 WhatsApp 本身的限制。
- 新测试：`sh qa/run.sh node qa/abuse.mjs`（服务器规则：重复赠品、过期登录、取消后恢复、删除账户）。

## 后台新界面（2026-10-22）

- `admin.html` 重做，颜色字体和网站一样；电脑上左边菜单，手机上底部菜单（订单 / 库存 / 会员集章 / 统计 / 退出）。后端接口没变。
- 订单：待确认的单排最前、红框；卡片上一个按钮推进状态（确认订单 → 标记已发货 → 标记已完成），下拉框可以改成任何状态；WhatsApp 模板在卡片的绿色按钮里；IceMax 订单显示「已勾选知晓漏油」。「今天」也会显示以前还没确认的单。浏览器标签页标题显示待确认数。
- 库存：每个口味一个输入框 + 「缺货」按钮，改了先存在页面上，底部条点「保存库存」才提交；可以筛选缺货 / 库存少 / 没记库存、搜口味。
- 会员：卡片列表，满卡的排前面红框，每款 ＋/－ 补章扣章。
- 统计：近 30 天 / 本月 / 全部；营业额、订单数、卖出支数、会员单占比；14 天柱状图；按款式、最好卖的口味、取货方式；有代理链接订单时显示代理表。
- 同一个浏览器标签页里刷新不用重新输密码（存在 sessionStorage，关掉标签页就忘）。
- 测试：`sh qa/run.sh node qa/admin-ui.mjs`（电脑 + 手机截图 `qa/adm-*.png`）、`qa/v3.mjs`（后台改状态、补章、库存）。

## 环境变量（Netlify：vapeshop2026 → Site configuration → Environment variables）

| 变量 | 状态 |
|---|---|
| `SUPABASE_URL` `SUPABASE_SERVICE_KEY` `ADMIN_PASSWORD` | 老站已经有了，不用动 |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` | 老站已经有了，新代码直接用（bot：@vapeshop888_pro_bot） |
| `TG_SECRET` | 已加。只能用字母、数字、`_`、`-`（Telegram 的要求） |
| `WA_NUMBER` | 可选：店里的 WhatsApp 号（带国家码，如 34697332407）。不设就用代码里的默认号 |

## 上线步骤（每一步都要店主同意）

1. 店主在 Mac 终端推分支：`cd ~/vape-shop-v3 && git push -u origin v3-3d`。然后在 GitHub 开 PR，Netlify 会出 deploy-preview 链接。
   - ⚠️ 预览站连的是**正式** Supabase 和正式 Telegram。在预览站下的测试单会进真实订单表、发到真实 bot。测完在后台删掉。
2. **先跑迁移**（不然预览站上登录、下单会报错）：Supabase → SQL Editor → 粘贴 `supabase/migrations/20261021000000_members_stamps.sql` → Run。老网站照常运行，不受影响。
3. Netlify 加 `TG_SECRET`，重新部署预览。然后浏览器打开 `https://<预览或正式域名>/api/tg-setup?key=<TG_SECRET>`，看到 `"ok": true`。
   - 注意：webhook 绑的是打开链接的那个域名。合并上线后要在正式域名再打开一次。
4. 店主在预览站走一遍：下单 → Telegram 点 ✅ → 后台看到「已确认 · 已盖章」→ 删测试单。
5. 合并 PR 到 main，正式站就换成新版。

## 本地测试（不碰真实数据）

```sh
cd ~/vape-shop-v3
sh build.sh                         # 改了 site/ 或 products.json 之后
sh qa/run.sh node qa/v3.mjs         # 缺货、后台改状态→盖章/扣库存/撤章、会员页 ±、老账号登录
sh qa/run.sh node qa/account.mjs    # 会员全流程（注册→下单→Telegram 确认→盖章→集满送 1→取消退章）
sh qa/run.sh node qa/checkout.mjs   # 游客下单三步
sh qa/run.sh node qa/tgadmin.mjs    # Telegram 指令 查/盖/重置
ONLY=d sh qa/run.sh node qa/promo.mjs   # 开屏海报（d / m / dk 分开跑，一次一个）
ONLY=d sh qa/run.sh node qa/account.mjs # account 也要 d / m 分开跑
ONLY=d sh qa/run.sh node qa/clearance.mjs  # IceMax 清仓：弹窗顺序、区块、漏油提示、勾选确认（d / m,srv 分开跑）
M=1 sh qa/run.sh node qa/rail.mjs       # 海报墙每张都能点开
sh qa/run.sh node qa/check.mjs      # 海报墙、抽屉、首屏轮播
```

- `qa/run.sh` 会临时起一个本地 Postgres + PostgREST + `qa/dev-server.mjs`（假 Supabase、假 Supabase Auth；老账号 `old@example.com / oldpass1`），跑完自动关掉。
  - 表结构见 `qa/schema-base.sql`，是照正式库抄的，然后套上 `supabase/migrations/*`。
- 依赖（放在 /tmp，被清空了就重装）：
  - Postgres 14：`apt-get download postgresql-14 postgresql-client-14 libpq5 libllvm14`，再 `dpkg -x` 解压到 `/tmp/pg/root`；
  - PostgREST：静态版放到 `/tmp/pg/postgrest`；
  - Playwright：`/tmp/vsprev/node_modules/playwright-core`；
  - Chromium 缺 `libXdamage`：`apt-get download libxdamage1`，解压到 `/tmp/xlib/root`。
- WebGL 是软件渲染，比较慢；沙盒里每条命令最多跑 3 分钟，所以测试要一个一个跑。
- 测试最后都应该打印 `errors: none`。

## 还没做 / 待定

- RELX「C味鲜橙」缺图（`images/relx/vitamin-c-orange.webp`）。
- 优惠码只记录，后台订单卡上显示，店家在 WhatsApp 里手动减。
- 访问统计（`track-click` / `stats.html`）已删除；代理 `?ref=` 新首页没接。
- 页面只有中文，没有西班牙语切换。
- 「代理统计」页的代理部分对新订单没数据（新首页不记 `agent_ref`）。
