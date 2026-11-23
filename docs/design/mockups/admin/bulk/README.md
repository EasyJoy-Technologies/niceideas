# Admin bulk actions — draft (2026-11-23)

Posts and comments lists: a checkbox column plus one bulk bar (select all on this page, action, visibility target when narrowing, one required reason, "Apply to N").
Bar sits at the top of the table card (sticky); on phones it docks at the bottom of the list. Works without JS (checkboxes use `form="ad-bulk"`); JS adds select-all, the count and disabled state.
- `sheet-1-posts.jpg` — narrow visibility of 3 posts (desktop) · remove 2 posts (phone)
- `sheet-2-comments.jpg` — hide 3 comments (desktop + phone); bulk hide never bans
- `sheet-3-result-en.jpg` — result notice + idle bar · English at 1280 px (denser cells: the posts table no longer overflows)

Sources in `_src/`: real pages rendered by `render.test.ts.txt` + `vitest.config.ts.txt` (copy to `var/bulk-admin/` without `.txt`), then `inject.py`, then `shoot.mjs` (playwright-core in /tmp/pw).
