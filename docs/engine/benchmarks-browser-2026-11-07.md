# Browser rendering benchmarks

Browser: chromium (Playwright headless), viewport 1600×1000, 2026-11-07T08:11:39.530Z

Medians over repeated frames. "drawn/culled" are the renderer's counts for one frame.

| Suite       | Metric                        |  Nodes | Value | Unit | Note                        |
| ----------- | ----------------------------- | -----: | ----: | ---- | --------------------------- |
| render      | loadDocument                  |    100 |  22.7 | ms   |                             |
| render      | full frame, zoom-to-fit       |    100 | 2.500 | ms   | drawn 100, culled 0         |
| render      | full frame, 100% zoom         |    100 | 1.500 | ms   | drawn 80, culled 20         |
| render      | pan frame, 100% zoom          |    100 | 1.300 | ms   |                             |
| render      | partial frame (1 node moved)  |    100 | 0.500 | ms   | dirty-region: yes           |
| interaction | pointermove → hover + overlay |    100 | 0.200 | ms   |                             |
| interaction | select all + overlay draw     |    100 | 1.700 | ms   |                             |
| memory      | JS heap used                  |    100 |  29.8 | MB   | Chromium performance.memory |
| render      | loadDocument                  |  1,000 |  31.1 | ms   |                             |
| render      | full frame, zoom-to-fit       |  1,000 |  11.8 | ms   | drawn 1000, culled 0        |
| render      | full frame, 100% zoom         |  1,000 | 1.500 | ms   | drawn 116, culled 133       |
| render      | pan frame, 100% zoom          |  1,000 | 2.000 | ms   |                             |
| render      | partial frame (1 node moved)  |  1,000 | 0.200 | ms   | dirty-region: yes           |
| interaction | pointermove → hover + overlay |  1,000 | 0.300 | ms   |                             |
| interaction | select all + overlay draw     |  1,000 | 6.600 | ms   |                             |
| memory      | JS heap used                  |  1,000 |  29.8 | MB   | Chromium performance.memory |
| render      | loadDocument                  | 10,000 |   256 | ms   |                             |
| render      | full frame, zoom-to-fit       | 10,000 |   171 | ms   | drawn 10000, culled 0       |
| render      | full frame, 100% zoom         | 10,000 | 1.800 | ms   | drawn 115, culled 509       |
| render      | pan frame, 100% zoom          | 10,000 | 1.900 | ms   |                             |
| render      | partial frame (1 node moved)  | 10,000 | 0.500 | ms   | dirty-region: yes           |
| interaction | pointermove → hover + overlay | 10,000 | 1.300 | ms   |                             |
| interaction | select all + overlay draw     | 10,000 |  39.9 | ms   |                             |
| memory      | JS heap used                  | 10,000 |  29.8 | MB   | Chromium performance.memory |
