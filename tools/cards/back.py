# -*- coding: utf-8 -*-
"""The back of each project card: the same frame, no painting, the repo explained.

    python tools/cards/back.py            -> assets/<nn>_<id>_back.svg for every card

GitHub cannot flip an image on click, so the README puts each back inside a
<details> block under its front; opening it is the flip.  The back carries the
same frame kit and plate so the pair reads as one object, and the same idle
motion (frame light, corner gems) so it is never a dead image next to a live one.
Every sentence here was checked against the repo's README or API record.
"""
import pathlib, sys
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent)); sys.path.insert(0, str(HERE))
from px import rect, pixel_text, mono, svg, text_width  # noqa: E402
import card as C  # noqa: E402

CW, CH, M, T = C.CW, C.CH, C.M, C.T
PALE, MUTED, PANEL, LINE, GOLD, GOLD2, GOLD3 = C.PALE, C.MUTED, C.PANEL, C.LINE, C.GOLD, C.GOLD2, C.GOLD3

BACKS = {
    "g_one": [
        ("WHAT IT ASKS", ["Does self-preservation emerge from selection alone, in agents",
                          "that were never taught what death is?"]),
        ("HOW", ["Populations of small recurrent networks evolve in a grid world.",
                 "No human priors, no pretrained weights, no demonstrations, no",
                 "text. Fitness rewards collecting forage and nothing else; dying",
                 "is never punished. If self-protective behaviour appears, it",
                 "cannot be imitation, because the concept exists nowhere."]),
        ("WHY IT MATTERS", ["Evidence for instrumental self-preservation in AI comes from",
                            "language models trained on text full of survival and fear.",
                            "This design removes that confound by construction."]),
        ("BUILT WITH", ["JAX on GPU, a deliberately slow NumPy oracle for differential",
                        "checks, and two tiers of gates: engineering (is the code right)",
                        "and scientific (can the experiment answer at all). 125 tests."]),
        ("STATUS", ["Research in progress, June to August 2026, 166 commits."]),
    ],
    "crossroads_rl": [
        ("WHAT IT ASKS", ["When agents share a crossing with no lights, no signs and no",
                          "rules, do they invent right of way, and can they lie?"]),
        ("HOW", ["PPO agents (Stable-Baselines3) share one crossing. Each",
                 "chooses from six actions: accelerate, maintain or brake,",
                 "with a one-bit signal on or off. Three reward regimes, selfish,",
                 "cooperative and aggressive, produce three driving cultures:",
                 "gap-forcing and collisions, turn-taking and honest signals,",
                 "racing and dominance hierarchies."]),
        ("WHAT SHIPS", ["A Gymnasium environment, twelve experiments, trained",
                        "checkpoints, a Pygame replay, and a Next.js dashboard with",
                        "eleven analysis pages served by FastAPI."]),
        ("STATUS", ["Complete, February 2026. Python and TypeScript."]),
    ],
    "stride": [
        ("WHAT IT ASKS", ["Can evolution alone teach a jointed figure to walk?"]),
        ("HOW", ["A 2D stick figure with six motorised joints (hips, knees,",
                 "shoulders) and two spring elbows in a pymunk physics world.",
                 "Each joint follows a sine wave with three genes, amplitude,",
                 "frequency and phase, so a walker is eighteen numbers. A genetic",
                 "algorithm breeds, mutates and selects 100 walkers over 75",
                 "generations; fitness is distance minus falls and wasted energy."]),
        ("COMPARED AGAINST", ["Particle swarm, differential evolution and CMA-ES across",
                              "seventeen experiments, with a React and Three.js dashboard",
                              "where the walkers can be watched and their genes edited."]),
        ("STATUS", ["Live at stridewalk.fun. February to March 2026, ten commits."]),
    ],
    "arivu": [
        ("WHAT IT DOES", ["Traces the intellectual ancestry of a paper: what it inherited,",
                          "which earlier papers the field cannot stand without, and",
                          "where the unexplored space lies."]),
        ("HOW", ["Citations from OpenAlex and Semantic Scholar are stored in",
                 "Postgres with pgvector. An ancestral trace draws the lineage;",
                 "cascading pruning removes a paper and watches the field collapse",
                 "to find the bottlenecks; consensus clustering profiles the",
                 "field's methods; a diversity radar scores author concentration,",
                 "method spread, venue breadth and interdisciplinarity."]),
        ("ALSO", ["Semantic search for research gaps, a year-by-year time machine,",
                  "confidence badges and evidence trails on every output, and a",
                  "plain-language layer for non-specialists."]),
        ("STATUS", ["Built, March to April 2026, 92 commits. Flask, FastAPI,",
                    "sentence-transformers, NetworkX."]),
    ],
    "apin": [
        ("WHAT IT DOES", ["Diagnoses leaf disease in tomato, okra and brassica from one",
                          "smartphone photo, and keeps a personal field notebook."]),
        ("HOW", ["Several models read the leaf as an ensemble; where they",
                 "disagree, the app says so rather than guessing. Confidence is",
                 "calibrated, and a Grad-CAM heat map shows exactly where the",
                 "model looked before it answered."]),
        ("WHAT YOU GET", ["The diagnosis, its confidence, a severity estimate, and",
                          "treatment and prevention advice for that crop."]),
        ("STATUS", ["Live on Hugging Face Spaces. Python."]),
    ],
    "afwah": [
        ("WHAT IT ASKS", ["Which social platform lets a rumour live longest, and which",
                          "interventions actually kill it?"]),
        ("HOW", ["A discrete-event Monte Carlo simulation seeds one rumour on a",
                 "few nodes and lets it run across four platforms, each with its",
                 "own network shape and rules: a scale-free network with algorithmic",
                 "amplification and community notes, a stories network with 24-hour",
                 "expiry, a small-world network with forward limits, and community",
                 "blocks with karma and moderators. The rumour hops between",
                 "platforms, mutates, meets fact-checkers, and eventually dies."]),
        ("RESULT", ["A thousand runs give a statistical picture of vulnerability:",
                    "infection ran from roughly a quarter of nodes on the moderated",
                    "network to over half on the amplified ones."]),
        ("STATUS", ["Complete, February 2026. Python, a D3 visualisation, a report."]),
    ],
    "oracle": [
        ("WHAT IT IS", ["A template for a research group's record: decisions, notes,",
                        "living documents and a library, kept as a repository."]),
        ("THE RULE", ["Nothing changes without review. Every edit goes through a",
                      "governed pull request with an approval rule the group sets",
                      "in one file, and that rule itself can only change by proposal."]),
        ("WHAT IS THERE", ["Authored templates for a decision, a document, a note, a",
                           "library entry and a proposal, each with annotated guidance,",
                           "and a versioning rule for living documents."]),
        ("STATUS", ["In progress, July to August 2026. The approval-gate check that",
                    "enforces the rule is still to be added; a group generated today",
                    "should not yet rely on it."]),
    ],
    "ink": [
        ("WHAT IT IS", ["A retro, gamified toolkit for students, built to make",
                        "studying feel like a game worth playing."]),
        ("HOW", ["Post a doubt and it becomes a bounty with a coin reward that",
                 "peers earn by solving it. Buy and sell notes, templates and",
                 "papers in a marketplace. Book one-to-one or group tutoring by",
                 "subject, rating and price. Find a study spot on a live map."]),
        ("ALSO", ["A forum with votes, badges and achievements, and a dashboard",
                  "of drag-and-drop widgets: Pomodoro timer, streak counter,",
                  "GitHub and Spotify. Firebase sign-in with email verification."]),
        ("STATUS", ["Shipped 2025, 23 commits. Flask, MongoDB, HTML and CSS."]),
    ],
}


def build_back(key):
    spec = C.CARDS[key]
    W, H = CW + 2 * M, CH + 2 * M
    g, css = [rect(0, 0, CW, CH, PANEL)], []
    cs = C.frame(g)
    # plate at the top, same as the front's
    name = spec["name"]
    ns = 3 if text_width(name, 3, 2) + 40 <= 200 else 2
    pw = text_width(name, ns, 2) + 40; px = T + 12; py = T + 14
    g += [rect(px - 2, py - 2, pw + 4, 40, GOLD3), rect(px, py, pw, 36, GOLD2), rect(px + 2, py + 2, pw - 4, 32, "#171219")]
    for (x, y) in ((px + 3, py + 3), (px + pw - 6, py + 3), (px + 3, py + 30), (px + pw - 6, py + 30)): g.append(rect(x, y, 3, 3, GOLD2))
    g.append(C.ptext(name, px + 20, py + (36 - 7 * ns) // 2 + 1, ns, GOLD, 2, shadow=GOLD3))
    g.append(pixel_text("THE BACK OF THE CARD", CW - cs - 8 - text_width("THE BACK OF THE CARD", 1), py + 14, 1, MUTED, 1))
    g.append(rect(T + 12, py + 48, CW - 2 * T - 24, 1, LINE))
    # sections
    y = py + 66; x0 = T + 12
    for head, lines in BACKS[key]:
        g.append(pixel_text(head, x0, y, 1, GOLD, 1)); y += 15
        for l in lines:
            g.append(mono(l, x0, y + 8, 10, PALE)); y += 13
        y += 9
    # footer sits above the corner medallions, which are taller than the edge
    g.append(rect(x0, CH - cs - 24, CW - 2 * T - 24, 1, LINE))
    g.append(pixel_text("OPEN THE REPOSITORY  >", x0, CH - cs - 14, 1, MUTED, 1))
    # the same idle motion as the front
    per = 2 * (CW - T + CH - T)
    g.append(f'<rect class="run" x="{T // 2}" y="{T // 2}" width="{CW - T}" height="{CH - T}" fill="none" stroke="{PALE}" stroke-width="1" stroke-dasharray="16 {per}" opacity=".85"/>')
    css.append(f".run{{animation:run 16s linear infinite}}@keyframes run{{to{{stroke-dashoffset:-{per + 16}}}}}")
    gx = cs // 2
    for i, (x, yy) in enumerate(((gx, gx), (CW - gx, gx), (gx, CH - gx), (CW - gx, CH - gx))):
        g.append(f'<rect class="gem g{i}" x="{x - 3}" y="{yy - 3}" width="6" height="6" fill="{PALE}"/>')
    css.append(".gem{opacity:0;animation:gg 7s steps(1) infinite}@keyframes gg{0%,3%{opacity:1}4%,100%{opacity:0}}.g1{animation-delay:1.75s}.g2{animation-delay:3.5s}.g3{animation-delay:4.25s}")
    # the back reveals like the front, so opening the flip feels like a turn
    css.append(f".card{{animation:rv .6s ease-out both}}@keyframes rv{{from{{opacity:0;transform:translate({M}px,{M}px) scale(.98)}}to{{opacity:1;transform:translate({M}px,{M}px) scale(1)}}}}")
    body = f'<g class="card" transform="translate({M} {M})">{"".join(g)}</g>'
    s = svg(W, H, body, "".join(css), title=name + ", the back of the card", desc=" ".join(" ".join(l) for _, l in BACKS[key]))
    out = HERE.parent.parent / spec["out"].replace(".svg", "_back.svg")
    out.write_text(s, encoding="utf-8")
    return out, len(s.encode()) // 1024, y


if __name__ == "__main__":
    for key in (sys.argv[1:] or C.CARDS):
        out, kb, ylast = build_back(key)
        print(out.name, kb, "KB", "text ends at", ylast)
