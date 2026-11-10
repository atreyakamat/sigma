# SIGMA brand guide

Made by [atreyakamat.dev](https://atreyakamat.dev).

## Positioning

**For** design teams who are tired of renting their tools **and** want control over where their
work lives, **SIGMA is** the self-hosted design platform **that** runs on your own machine in
minutes, with realtime co-editing, components, prototyping and an AI assistant that actually edits
the file. **Unlike** closed cloud design tools, you own the data, the server and the code (MIT).

**One line:** Design without limits. Own every pixel.

**Elevator pitch (20 seconds):** SIGMA is a Figma-class design tool you install like an app. Double
click, make an account, start designing. Invite teammates on your network, or run it on a server
with one Docker command. Nothing leaves your computer unless you say so.

## Audience

| Segment                                     | What they care about                  | Message                                                                              |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Small studios and agencies                  | Cost per seat, client confidentiality | "No per-seat bill. Client files never leave your machine."                           |
| Startups and product teams                  | Speed, handoff to developers          | "Designers and developers in the same file, with tokens and exports one click away." |
| Privacy-minded organisations, schools, NGOs | Data location, compliance             | "Self-hosted, audit log, two-factor sign-in, open source."                           |
| Developers who design                       | Scriptability                         | "An API, a CLI and an MCP server: let Claude or your scripts build screens."         |
| Students and hobbyists                      | Free, easy                            | "Download, open, create. No account with anyone."                                    |

## Pillars

1. **Yours.** Self-hosted by default, MIT licensed, no telemetry.
2. **Instant.** Desktop app or one command; first shape in under five minutes.
3. **Together.** Realtime cursors, comments, versions, roles.
4. **Smart.** An assistant and an open protocol (MCP) for AI that works on your files.
5. **Precise.** A purpose-built canvas engine with real vector tools, components and auto layout.

## Voice

Confident, plain and a little playful. Short sentences. Say what it does, not what it is "revolutionising".

| We say                              | We avoid                                      |
| ----------------------------------- | --------------------------------------------- |
| "Your files stay on your computer." | "Enterprise-grade data sovereignty solution." |
| "Double-click, then draw."          | "Seamless onboarding experience."             |
| "The AI assistant is in beta."      | Claiming more than is tested.                 |

Never claim what has not been verified: say Beta, say Unsigned, say Coming soon.

## Logo

The mark is a **sigma (Σ) inside a selection box**: the glyph for "sum of everything" caught in the
handles every designer knows. It reads as a letter, a tool and a promise (everything, in one place).

| File                  | Use                                     |
| --------------------- | --------------------------------------- |
| `logo-mark.svg`       | App icon, avatars, favicon (dark tile)  |
| `logo-mark-light.svg` | On light backgrounds                    |
| `logo-wordmark.svg`   | Headers, documents                      |
| `banner.svg`          | README and social previews (1280 × 400) |

Rules: keep clear space equal to the width of a corner handle on every side; minimum size 24 px;
do not rotate, recolour outside the palette, stretch, or add effects other than the gradient shown.
The wordmark uses live text (Inter, falling back to the system font); export it to outlines before
sending to print.

## Colour

| Name         | Hex       | Use                                    |
| ------------ | --------- | -------------------------------------- |
| Void         | `#0B0B10` | Page background (dark)                 |
| Ink          | `#141418` | Logo tile, panels                      |
| Violet       | `#8B7CFF` | Primary accent, handles, links         |
| Violet deep  | `#6D5DFC` | Gradient end, buttons                  |
| Violet light | `#B6AAFF` | Gradient start, highlights             |
| Mist         | `#E9E7FF` | Text on dark                           |
| Signal coral | `#FF7A59` | Cursors, notifications, single accents |
| Mint         | `#3DDC97` | Success, "online"                      |

Contrast: Mist on Void is 15:1; Violet on Void is 6.5:1 (large text and UI only below 18 px use Mist).

## Typography

- **Interface and headings:** Inter (700–800 for headings, 400–500 body), system sans fallback.
- **Code and commands:** JetBrains Mono or the system monospace.
- Headlines in sentence case, tight tracking (-0.02em); the wordmark alone uses wide tracking.

## Motion

Motion explains, it does not decorate: cursors glide to where collaborators work, panels slide
from the side they belong to, selection handles pulse once. 200–400 ms, ease-out. Respect
reduced-motion settings everywhere.

## Naming and credit

- Product: **SIGMA** (capitals in headings; "Sigma" in running text is fine).
- Credit line: "Built by atreyakamat.dev".
- Tagline options: "Design without limits." (primary) · "Your canvas. Your server." · "Draw. Share. Own."

## Launch narrative (first 90 days)

1. **Show, don't tell:** a 30-second screen recording: download, open, draw, invite, AI edits a layer.
2. **Where to be:** GitHub (stars come from a great README), Hacker News "Show HN: a self-hosted design tool", r/selfhosted, r/webdev, Product Hunt after the Windows and macOS installers are signed.
3. **Proof points to collect:** time to first shape, number of self-hosted installs (opt-in only), real testimonials. Do not publish numbers that were not measured.
4. **Content:** "How a design tool's realtime engine works" (CRDT), "Building a canvas renderer from scratch", "Connect Claude to your design tool with MCP".
5. **Community:** GitHub Discussions, a public roadmap (the housekeeping list is a start), a "good first issue" label.

## Do / Don't

- Do lead with ownership and speed. Don't compare feature-by-feature with named competitors.
- Do show real screenshots. Don't show mock UI that the product cannot produce.
- Do say "beta" where it is true. Don't say "production-ready" for the AI assistant or unsigned installers.
