# Headless engine benchmarks

Environment: Node v26.12.0, linux x64 — 2026-11-09T05:53:11.446Z

Median of 5 runs unless noted. Hit tests are 1,000 random world points against the page's spatial index.

| Suite    | Metric                               |  Nodes | Value | Unit | Note                 |
| -------- | ------------------------------------ | -----: | ----: | ---- | -------------------- |
| document | validate JSON (zod)                  |    100 | 6.447 | ms   |                      |
| document | load into SceneGraph                 |    100 | 5.757 | ms   |                      |
| document | serialize toJSON                     |    100 | 0.418 | ms   |                      |
| document | world bounds (all nodes, cold cache) |    100 | 5.162 | ms   |                      |
| engine   | build spatial index                  |    100 | 1.114 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       |    100 | 5.190 | ms   | 735 hits             |
| engine   | hit test, single query               |    100 | 0.005 | ms   |                      |
| engine   | marquee query (quarter of page)      |    100 | 0.117 | ms   |                      |
| commands | move 1 node (execute + index update) |    100 | 0.106 | ms   |                      |
| commands | move 9 nodes                         |    100 | 0.196 | ms   |                      |
| commands | undo + redo (10% move)               |    100 | 0.255 | ms   |                      |
| commands | restyle all nodes (one command)      |    100 | 0.466 | ms   |                      |
| engine   | select all + bounds                  |    100 | 0.176 | ms   |                      |
| memory   | heap used after benchmarks (process) |    100 |  24.6 | MB   | includes test runner |
| document | validate JSON (zod)                  |  1,000 |  18.2 | ms   |                      |
| document | load into SceneGraph                 |  1,000 |  20.7 | ms   |                      |
| document | serialize toJSON                     |  1,000 | 1.218 | ms   |                      |
| document | world bounds (all nodes, cold cache) |  1,000 |  21.6 | ms   |                      |
| engine   | build spatial index                  |  1,000 | 3.022 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       |  1,000 | 9.271 | ms   | 772 hits             |
| engine   | hit test, single query               |  1,000 | 0.009 | ms   |                      |
| engine   | marquee query (quarter of page)      |  1,000 | 0.611 | ms   |                      |
| commands | move 1 node (execute + index update) |  1,000 | 0.037 | ms   |                      |
| commands | move 95 nodes                        |  1,000 | 1.214 | ms   |                      |
| commands | undo + redo (10% move)               |  1,000 | 1.520 | ms   |                      |
| commands | restyle all nodes (one command)      |  1,000 | 1.876 | ms   |                      |
| engine   | select all + bounds                  |  1,000 | 1.701 | ms   |                      |
| memory   | heap used after benchmarks (process) |  1,000 |  40.5 | MB   | includes test runner |
| document | validate JSON (zod)                  | 10,000 |   143 | ms   |                      |
| document | load into SceneGraph                 | 10,000 |   148 | ms   |                      |
| document | serialize toJSON                     | 10,000 |  14.1 | ms   |                      |
| document | world bounds (all nodes, cold cache) | 10,000 |   169 | ms   |                      |
| engine   | build spatial index                  | 10,000 |  21.3 | ms   |                      |
| engine   | hit test ×1000 (spatial index)       | 10,000 |  13.5 | ms   | 782 hits             |
| engine   | hit test, single query               | 10,000 | 0.013 | ms   |                      |
| engine   | marquee query (quarter of page)      | 10,000 | 4.651 | ms   |                      |
| commands | move 1 node (execute + index update) | 10,000 | 0.044 | ms   |                      |
| commands | move 958 nodes                       | 10,000 | 7.313 | ms   |                      |
| commands | undo + redo (10% move)               | 10,000 |  13.1 | ms   |                      |
| commands | restyle all nodes (one command)      | 10,000 |  15.9 | ms   |                      |
| engine   | select all + bounds                  | 10,000 |  20.6 | ms   |                      |
| memory   | heap used after benchmarks (process) | 10,000 |  87.4 | MB   | includes test runner |
