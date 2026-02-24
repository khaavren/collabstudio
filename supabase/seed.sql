with upsert_rooms as (
  insert into rooms (name, slug)
  values
    ('Hard Hat System', 'hard-hat-system'),
    ('Grid System', 'grid-system'),
    ('Outdoor Series', 'outdoor-series'),
    ('Shipping / ShipCross™', 'shipcross')
  on conflict (slug) do update
    set name = excluded.name,
        updated_at = now()
  returning id, slug
),
all_rooms as (
  select id, slug from upsert_rooms
  union
  select id, slug from rooms where slug in ('hard-hat-system', 'grid-system', 'outdoor-series', 'shipcross')
),
seed_assets as (
  insert into assets (room_id, title, current_version, image_url, edited_by)
  values
    ((select id from all_rooms where slug = 'hard-hat-system'), 'Band Joes Hard Hat Tri-Mount™ v3', 'v3', 'https://picsum.photos/seed/hardhat-v3/1200/900', 'Phil'),
    ((select id from all_rooms where slug = 'hard-hat-system'), 'Band Joes Connect™ Cross Adapter Clip', 'v2', 'https://picsum.photos/seed/connect-clip-v2/1200/900', 'Sarah'),
    ((select id from all_rooms where slug = 'hard-hat-system'), 'Band Joes Hard Hat Mount Kit™', 'v1', 'https://picsum.photos/seed/mount-kit-v1/1200/900', 'Phil'),
    ((select id from all_rooms where slug = 'grid-system'), 'Band Joes Grid System™ Starter Kit', 'v2', 'https://picsum.photos/seed/grid-kit-v2/1200/900', 'Phil'),
    ((select id from all_rooms where slug = 'outdoor-series'), 'Band Joes Outdoor Camp Kit™', 'v1', 'https://picsum.photos/seed/outdoor-kit-v1/1200/900', 'Sarah'),
    ((select id from all_rooms where slug = 'shipcross'), 'Band Joes ShipCross™ Coffee Subscription', 'v1', 'https://picsum.photos/seed/shipcross-v1/1200/900', 'Phil')
  on conflict do nothing
  returning id, title
),
all_assets as (
  select id, title from seed_assets
  union
  select id, title from assets
)
insert into asset_tags (asset_id, tag)
values
  ((select id from all_assets where title = 'Band Joes Hard Hat Tri-Mount™ v3'), 'W40'),
  ((select id from all_assets where title = 'Band Joes Hard Hat Tri-Mount™ v3'), 'Industrial'),
  ((select id from all_assets where title = 'Band Joes Hard Hat Tri-Mount™ v3'), 'Prototype'),
  ((select id from all_assets where title = 'Band Joes Connect™ Cross Adapter Clip'), 'Connector'),
  ((select id from all_assets where title = 'Band Joes Connect™ Cross Adapter Clip'), 'Universal'),
  ((select id from all_assets where title = 'Band Joes Hard Hat Mount Kit™'), 'Kit'),
  ((select id from all_assets where title = 'Band Joes Hard Hat Mount Kit™'), 'Complete'),
  ((select id from all_assets where title = 'Band Joes Grid System™ Starter Kit'), 'Modular'),
  ((select id from all_assets where title = 'Band Joes Grid System™ Starter Kit'), 'Storage'),
  ((select id from all_assets where title = 'Band Joes Outdoor Camp Kit™'), 'Camping'),
  ((select id from all_assets where title = 'Band Joes Outdoor Camp Kit™'), 'Portable'),
  ((select id from all_assets where title = 'Band Joes ShipCross™ Coffee Subscription'), 'Subscription'),
  ((select id from all_assets where title = 'Band Joes ShipCross™ Coffee Subscription'), 'Packaging')
on conflict do nothing;

insert into asset_versions (asset_id, version, prompt, size, style, notes, editor, created_at)
values
  (
    (select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1),
    'v1',
    'Industrial hard hat with basic mounting points, standard safety design',
    '1024x1024',
    'Product Photography',
    'Initial concept exploration',
    'Phil',
    now() - interval '9 days'
  ),
  (
    (select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1),
    'v2',
    'Industrial hard hat with dual mounting system, added safety orange color accents for visibility',
    '1024x1024',
    'Product Photography',
    'Added brand color elements',
    'Sarah',
    now() - interval '7 days'
  ),
  (
    (select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1),
    'v3',
    'Industrial hard hat with triple mounting system, safety orange accents, modern minimal design',
    '1024x1024',
    'Product Photography',
    null,
    'Phil',
    now() - interval '5 days'
  )
on conflict (asset_id, version) do nothing;

insert into annotations (asset_id, number, x_position, y_position)
values
  ((select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1), 1, 30, 25),
  ((select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1), 2, 70, 40)
on conflict (asset_id, number) do nothing;

insert into comments (asset_id, author, avatar_url, content, created_at)
values
  (
    (select id from assets where title = 'Band Joes Hard Hat Tri-Mount™ v3' limit 1),
    'Sarah',
    'https://api.dicebear.com/7.x/initials/svg?seed=Sarah',
    'Love the orange accents, very on-brand',
    now() - interval '1 hour'
  )
on conflict do nothing;
