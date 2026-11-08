# Headless engine benchmarks

Environment: Node v26.12.0, linux x64 — 2026-11-07T08:11:21.941Z

Median of 5 runs unless noted. Hit tests are 1,000 random world points against the page's spatial index.

| Suite    | Metric                               |  Nodes | Value | Unit | Note                 |
| -------- | ------------------------------------ | -----: | ----: | ---- | -------------------- |
| document | validate JSON (zod)                  |    100 | 3.787 | ms   |                      |
| document | load into SceneGraph                 |    100 | 3.520 | ms   |                      |
| document | serialize toJSON                     |    100 | 0.213 | ms   |                      |
| document | world bounds (all nodes, cold cache) |    100 | 3.403 | ms   |                      |
| engine   | build spatial index                  |    100 | 0.797 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       |    100 | 7.388 | ms   | 735 hits             |
| engine   | hit test, single query               |    100 | 0.007 | ms   |                      |
| engine   | marquee query (quarter of page)      |    100 | 0.100 | ms   |                      |
| commands | move 1 node (execute + index update) |    100 | 0.089 | ms   |                      |
| commands | move 9 nodes                         |    100 | 0.147 | ms   |                      |
| commands | undo + redo (10% move)               |    100 | 0.203 | ms   |                      |
| commands | restyle all nodes (one command)      |    100 | 0.446 | ms   |                      |
| engine   | select all + bounds                  |    100 | 0.269 | ms   |                      |
| memory   | heap used after benchmarks (process) |    100 |  23.1 | MB   | includes test runner |
| document | validate JSON (zod)                  |  1,000 |  13.6 | ms   |                      |
| document | load into SceneGraph                 |  1,000 |  15.1 | ms   |                      |
| document | serialize toJSON                     |  1,000 | 0.994 | ms   |                      |
| document | world bounds (all nodes, cold cache) |  1,000 |  22.7 | ms   |                      |
| engine   | build spatial index                  |  1,000 | 2.502 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       |  1,000 | 8.978 | ms   | 772 hits             |
| engine   | hit test, single query               |  1,000 | 0.009 | ms   |                      |
| engine   | marquee query (quarter of page)      |  1,000 | 0.710 | ms   |                      |
| commands | move 1 node (execute + index update) |  1,000 | 0.028 | ms   |                      |
| commands | move 95 nodes                        |  1,000 | 1.297 | ms   |                      |
| commands | undo + redo (10% move)               |  1,000 | 1.911 | ms   |                      |
| commands | restyle all nodes (one command)      |  1,000 | 1.437 | ms   |                      |
| engine   | select all + bounds                  |  1,000 | 1.186 | ms   |                      |
| memory   | heap used after benchmarks (process) |  1,000 |  42.7 | MB   | includes test runner |
| document | validate JSON (zod)                  | 10,000 |  91.5 | ms   |                      |
| document | load into SceneGraph                 | 10,000 |   111 | ms   |                      |
| document | serialize toJSON                     | 10,000 | 8.413 | ms   |                      |
| document | world bounds (all nodes, cold cache) | 10,000 |   120 | ms   |                      |
| engine   | build spatial index                  | 10,000 |  19.7 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       | 10,000 |  12.7 | ms   | 782 hits             |
| engine   | hit test, single query               | 10,000 | 0.013 | ms   |                      |
| engine   | marquee query (quarter of page)      | 10,000 | 6.494 | ms   |                      |
| commands | move 1 node (execute + index update) | 10,000 | 0.020 | ms   |                      |
| commands | move 958 nodes                       | 10,000 | 7.326 | ms   |                      |
| commands | undo + redo (10% move)               | 10,000 |  12.8 | ms   |                      |
| commands | restyle all nodes (one command)      | 10,000 |  17.1 | ms   |                      |
| engine   | select all + bounds                  | 10,000 |  10.3 | ms   |                      |
| memory   | heap used after benchmarks (process) | 10,000 |  72.6 | MB   | includes test runner |
