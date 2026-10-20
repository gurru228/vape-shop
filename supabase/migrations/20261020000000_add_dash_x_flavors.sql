-- Dash X: add 西瓜冰 / 薄荷莫吉托 / 大红袍 / 老冰棍 to the 鸭嘴兽 (Dash) inventory.
--
-- flavor_name must match the `name` field in script.js and the `key` in
-- admin.html PRODUCTS_DEF, since stock is looked up as "{product_id}-{flavor_name}".
-- Price is not stored here; it comes from script.js (Dash = 17.9).
-- Stock starts at 0 (shown as sold out) until the owner sets real quantities.
-- ON CONFLICT DO NOTHING keeps any stock already entered via the admin panel.
-- RLS is unchanged: inventory stays writable only by the service role.

insert into public.inventory (product_id, product_name, flavor_name, stock)
values
    (1, '鸭嘴兽 (Dash)', 'Watermelon Ice',  0),
    (1, '鸭嘴兽 (Dash)', 'Mint Mojito',     0),
    (1, '鸭嘴兽 (Dash)', 'Da Hong Pao',     0),
    (1, '鸭嘴兽 (Dash)', 'Classic Ice Pop', 0)
on conflict (product_id, flavor_name) do nothing;
