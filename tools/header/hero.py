#!/usr/bin/env python3
"""Rebuild assets/01_hero.svg for the current hour and commit count.

    python tools/header/hero.py --commits 31
    python tools/header/hero.py --state night --out assets/01_hero.svg

The README points at ONE file, assets/01_hero.svg, and this script rewrites it.
The alternative - shipping four SVGs and having the workflow edit the README's
src attribute - churns the README on every run and shows a diff in the profile
timeline every three hours, which is noise.

The scene is not regenerated here.  Four pre-lit layer sets live in
tools/header/layers/, one per hour, and this only re-assembles the SVG around
them.  That keeps the workflow to numpy + Pillow + OpenCV and a couple of
seconds, instead of carrying the k-means quantiser and the Gemini-derived
mattes into CI.
"""
import argparse
import datetime as dt
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import svgmake  # noqa: E402  (needs HERE on the path first)

# Local time, not UTC.  A header that says "night" while it is mid-afternoon
# where the person actually is defeats the point of having hours at all.
TZ = dt.timezone(dt.timedelta(hours=5, minutes=30), "IST")

# Bands chosen so the two short, distinctive states get the hours they belong
# to and the two long ones absorb the rest.
BANDS = [(5, "dawn"), (9, "day"), (17, "dusk"), (20, "night")]

# How many lit windows one commit is worth.  Kept here rather than in svgmake
# because it is a property of THIS city: the skyline is a 166x20 silhouette
# holding 38 window slots, so the default 2.6 saturates at 15 commits and every
# busier day would render identically.
WIN_RATIO = 0.78

# Per-hour scaling on top of that, and the star count.  A city does not light
# the same number of windows at nine in the morning as at midnight, and without
# this the commit count alone drives the lights - so every hour rendered with
# an identical skyline and the day state had a fully lit city under a blue sky.
# plane: an aircraft crosses once per loop where the sky is bright enough to
# show a contrail.  moon: drawn at its real phase where the sky is dark enough
# to show one; at dawn it is still up but dimmed, the way it actually looks.
HOUR = {
    "dawn":  dict(winmul=0.75, stars=14, plane=True,  moon=True,  dim=0.55),
    "day":   dict(winmul=0.06, stars=0,  plane=True,  moon=False, dim=1.0),
    "dusk":  dict(winmul=1.00, stars=26, plane=True,  moon=False, dim=1.0),
    "night": dict(winmul=1.55, stars=44, plane=False, moon=True,  dim=1.0),
}

SYNODIC = 29.530588853                       # days, mean lunation
NEW_MOON_REF = dt.datetime(2000, 1, 6, 18, 14, tzinfo=dt.timezone.utc)


def moon_phase(now=None):
    """0 = new, .25 first quarter, .5 full, .75 last quarter.

    A mean-lunation count from a reference new moon.  It drifts from the true
    phase by up to about half a day over a cycle, which at a 13px moon is well
    under one pixel of terminator - astronomical precision would buy nothing
    visible here.
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    days = (now - NEW_MOON_REF).total_seconds() / 86400.0
    return (days % SYNODIC) / SYNODIC


def state_for(now=None):
    now = now or dt.datetime.now(TZ)
    h = now.hour
    out = "night"
    for start, name in BANDS:
        if h >= start:
            out = name
    return out


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--commits", type=int, default=24,
                   help="recent commit count; drives how many windows are lit")
    p.add_argument("--state", choices=[b[1] for b in BANDS],
                   help="override the hour (default: derived from IST now)")
    p.add_argument("--out", default="assets/01_hero.svg")
    p.add_argument("--layers", default=str(HERE / "layers"))
    p.add_argument("--moon", type=float, default=None,
                   help="override the moon phase in [0,1) (default: real phase now)")
    a = p.parse_args()

    state = a.state or state_for()
    # Clamp rather than trust. The count arrives from a network call that can
    # fail open, and a wild value would either black out the city or light
    # every window - both of which read as broken rather than as "quiet week".
    commits = max(0, min(200, a.commits))

    h = HOUR[state]
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    phase = a.moon if a.moon is not None else moon_phase()
    r = svgmake.build(f"{a.layers}/{state}", str(out), stars=h["stars"],
                      commits=int(round(commits * h["winmul"])),
                      win_ratio=WIN_RATIO, plane=h["plane"],
                      moon=(phase if h["moon"] else None),
                      moon_at=dict(dim=h["dim"]))
    print(f"{out}  state={state}  commits={commits}  "
          f"lit={r['lit']}/{r['total']}  stars={h['stars']}  "
          f"plane={h['plane']}  moon={(phase if h['moon'] else 0):.2f}  "
          f"{r['bytes'] // 1024}KB")


if __name__ == "__main__":
    main()
