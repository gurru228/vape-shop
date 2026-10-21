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

## 环境变量（Netlify：vapeshop2026 → Site configuration → Environment variables）

| 变量 | 状态 |
|---|---|
| `SUPABASE_URL` `SUPABASE_SERVICE_KEY` `ADMIN_PASSWORD` | 老站已经有了，不用动 |
| `TELEGRAM_BOT_TOKEN` `TELEGRAM_CHAT_ID` | 老站已经有了，新代码直接用（bot：@vapeshop888_pro_bot） |
| `TG_SECRET` | **要新加**：随便一串长密码。Telegram 的 ✅/❌ 按钮和店家指令需要它 |

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
- 访问统计（`track-click` / `stats.html`）和代理 `?ref=`：新首页没接（店主这次没选）。函数和页面还在，没删。
- 页面只有中文，没有西班牙语切换。
- 「代理统计」页的代理部分对新订单没数据（新首页不记 `agent_ref`）。
