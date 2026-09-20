# cycle

A series of interactive explainers about hormones, ovulation, bleeding, time, and the feedback
loops that make a menstrual cycle.

Published at <https://rh42.github.io/cycle/>.

## Pieces

| | | |
|---|---|---|
| 01 | [Two bodies, one month](two-bodies/) | Estrogen and testosterone in a woman and a man, drawn the way charts usually draw them, then on one shared scale. |

## Sources

Every number printed on a page, and every number a printed one is computed from, is traced to a
primary source: a reference-interval table, a results table, or a methods paragraph. Each page
lists its sources with full citations and DOIs, and each mark on a chart names the study it came
from. Modelled curves are labelled as models and never presented as measurements.

## Accessibility

- Text meets WCAG 2.2 AA contrast in both light and dark themes. Lowest ratio in use is 4.89:1
  against 4.5:1 required; chart and molecule colours exceed the 3:1 non-text minimum.
- Charts and molecules are keyboard operable, and every data mark carries a text description.
- Each chart is also published as a data table.
- `prefers-reduced-motion` and `prefers-color-scheme` are both honoured.

## Privacy

No cookies, no advertising, no cross-site tracking. Fonts are self-hosted.
Page views are counted in aggregate; nothing identifies a visitor.

## Built with

No framework and no build step. Plain HTML, CSS and ES modules; SVG drawn directly.
Serve the directory and it runs.

## Licence

Copyright © 2026 rh42. All rights reserved. The text, charts, code and design in this repository
may not be reproduced or redistributed without permission.

Two exceptions:

- The fonts in `fonts/` are third-party and carry their own licences. Fraunces and IBM Plex are
  both SIL Open Font License 1.1; the licence texts ship alongside them.
- Molecular coordinates in `data/molecules.js` are from the RCSB Chemical Component Dictionary,
  which places its data in the public domain. Published research findings cited on these pages
  belong to their authors and are cited, not reproduced.
