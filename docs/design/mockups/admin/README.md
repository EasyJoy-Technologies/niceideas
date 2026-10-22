# Admin console mockups (2026-10-22)

Light theme; differs from the public site in layout (wide, dense tables and charts), not in colour.
- `dashboard-a.html` — classic white sidebar + card grid
- `dashboard-b.html` — top navigation, to-do first, centred 1280px
- `dashboard-c.html` — icon rail + right activity column
- `stats-and-modules.html` — stats page (same in every variant) + all 13 modules

Figures are sample data. Metrics tagged "需新增采集" (views, visitors, regions, referrers) are not collected yet.
Regenerate: `cd _gen && python3 gen.py .. && python3 stats.py ..`

## Chosen: variant A (2026-10-22)
- `a-dashboard-light.html`, `a-dashboard-dark.html`, `a-reports-light.html`, `a-reports-dark.html` — theme button (dropdown) at the end of the sidebar account row.
- Regenerate: `cd _gen && python3 variant_a_more.py ..`
