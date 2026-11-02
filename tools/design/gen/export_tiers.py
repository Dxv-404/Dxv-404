"""Export the signed-off win-tier scenes (builders.TIERS, theme.tier_set()) for the live app.

    cd tools/design/gen && python3 export_tiers.py

Writes apps/web/src/table/tiers.json: {theme: [{html, css, dur, shake}, ...5 scenes]} where
- the sample text of the design (Meera, 1,480, Full House, ...) is replaced by {{placeholders}} that
  apps/web/src/table/tiers.ts fills with the real result (see VALUES there for every key),
- cards become slots: the suit class is {{cs:N}} and the card face {{ci:N:size}}, N being the card's place in
  the winning five as the scene shows them (straights low to high, everything else by group then rank),
- per-letter titles are {{#each KEY}}...{{/each}} blocks ({{k}} = index, {{ch}} = the letter),
- the scene's main animations play once (in the boards they looped), every keyframe name is made unique,
  every selector is scoped under .tpw (the scene's host), and the screen shake (.tN>.arena ...) targets the
  live table through the class .tpw-shake,
- images point at /tp/img/ (where the app serves the theme assets),
- elements that sat on Arjun's seat (bust-out) are placed from --sx/--sy, the busted seat on the real table.
The script fails if a sample literal is left over in any template.
"""
import json, os, re, sys
import run
from core import seat_xy

OUT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'apps', 'web', 'src', 'table', 'tiers.json')

# Longest "main" animation per scene kind (index 0..4); shorter loops inside a scene keep looping (sparkle,
# confetti), longer ones are ambient (a slow rotation) and also keep going until the scene is removed.
MAX_T = [3.2, 3.8, 5.0, 7.0, 3.6]

# ---------------- the sample text of every scene -> placeholders ----------------
# Keys (filled at runtime, apps/web/src/table/tiers.ts):
#   name / NAME          winner name(s) ("Meera and Riya")        I      first letter of the first winner
#   amt / amtRaw         amount won, "1,480" / "1480"              amt@F  that amount times F (rolling counters)
#   wins / takes         "wins"/"win", "takes"/"take" (one or several winners)
#   hand / HAND / H1     "Full House" / "FULL HOUSE" / "F"         madeA  "made a" / "made" / "takes the"
#   aHand                "a Straight" / "Two Pair" / "the Pot"     art    "a" / "" / "the"
#   L1 / L2              the hand on two lines ("FULL"/"HOUSE", "ACE"/"FLUSH", "ROYAL"/"FLUSH")
#   desc / Desc / DESC   "kings full of sevens", "Ace-high flush, all hearts", "ten to ace of hearts"
#   Short                "Kings full" (what the dealer exclaims)  HIGH   "ACE HIGH" / "KINGS FULL"
#   ranksDot             "8 · 9 · 10 · J · Q"                     CLS    hand class "07"
#   JA / EDO / EDO1      the hand in Japanese (ink katakana / edo kanji, edo one-glyph crest)
#   PREV_A / NEXT_A / TRAIN_LINE   neighbouring hands on the train line ("← FLUSH", "FOUR OF A KIND →")
#   odds / PKEY / PCT    "649,740" / "ROYAL" / "0.000154%"        yy / year  "26" / "2026" (in place of a season)
#   handNo / TABLE / tableAt       hand number, "TABLE QK7P", "table QK7P"
#   five                 true unless the hand is four of a kind (edo shows only the four)
#   scr0..scr4           the cyber decrypt frames of HAND           tw0 / tw2  typewriter step counts (pixel)
# Bust-out: bname / BNAME, place / PLACE ("9th of 13"), rebuyNote (" · rebuy open" or ""), stack (rebuy chips),
#   seatNo ("5"), seatNo2 ("05"); buttons carry data-tpw="rebuy" / "watch" inside a data-tpw-btns box.

R = {
 ('classic', 0): [('<small>Meera wins 860</small><b>Straight</b><span>8 · 9 · 10 · J · Q</span>', '<small>{{name}} {{wins}} {{amt}}</small><b>{{hand}}</b><span>{{ranksDot}}</span>')],
 ('classic', 1): [('<small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera takes 1,480</span>', '<small>{{Desc}}</small><b>{{hand}}</b><span>{{name}} {{takes}} {{amt}}</span>')],
 ('classic', 2): [('Bellissimo!<br><b>Kings full.</b>', 'Bellissimo!<br><b>{{Short}}.</b>'),
                  ('<small>Meera made a</small><b>Full House</b><span>kings full of sevens</span>', '<small>{{name}} {{madeA}}</small><b>{{hand}}</b><span>{{desc}}</span>'),
                  ('<small>Pot to Meera</small>', '<small>Pot to {{name}}</small>'),
                  ('"420"', '"{{amt@0.1469}}"'), ('"980"', '"{{amt@0.3427}}"'), ('"1,540"', '"{{amt@0.5385}}"'),
                  ('"2,120"', '"{{amt@0.7413}}"'), ('"2,640"', '"{{amt@0.9231}}"'), ('"2,860"', '"{{amt}}"')],
 ('classic', 3): [('>Meera · S3</text>', ">{{name}} · '{{yy}}</text>"), ('<b>Royal Flush</b>', '<b>{{hand}}</b>'),
                  ('ten to ace of hearts · once in a lifetime', '{{desc}} · once in a lifetime'), ('Bravissimo, Meera!', 'Bravissimo, {{name}}!')],
 ('classic', 4): [('<b>Arjun is out</b><small>Finishes 9th of 13 · 1 rebuy left</small><div><span class="p">Rebuy 1,000</span><span>Watch instead</span></div>',
                   '<b>{{bname}} is out</b><small>Finishes {{place}}{{rebuyNote}}</small><div data-tpw-btns><span class="p" data-tpw="rebuy">Rebuy {{stack}}</span><span data-tpw="watch">Watch instead</span></div>')],
 ('noir', 0): [('<small>Meera</small><b>a Straight</b>', '<small>{{name}}</small><b>{{aHand}}</b>')],
 ('noir', 1): [('<small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera · 1,480</span>', '<small>{{Desc}}</small><b>{{hand}}</b><span>{{name}} · {{amt}}</span>')],
 ('noir', 2): [('<small>Kings full of sevens</small><b>Full House</b>', '<small>{{Desc}}</small><b>{{hand}}</b>'),
               ('<span>Meera</span><b>2,860</b>', '<span>{{name}}</span><b>{{amt}}</b>')],
 ('noir', 3): [('<small>Once in 649,740 hands</small><b>Royal Flush</b><i></i><span>Meera</span>', '<small>Once in {{odds}} hands</small><b>{{hand}}</b><i></i><span>{{name}}</span>')],
 ('noir', 4): [('<small>Seat 5</small><b>Arjun leaves the table</b><span>9th of 13 · one rebuy remains</span><div><em>Rebuy</em><em>Watch</em></div>',
                '<small>Seat {{seatNo}}</small><b>{{bname}} leaves the table</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Rebuy</em><em data-tpw="watch">Watch</em></div>')],
 ('ivory', 0): [('<small>Meera made a</small><b>Straight</b><span>eight to queen · 860</span>', '<small>{{name}} {{madeA}}</small><b>{{hand}}</b><span>{{desc}} · {{amt}}</span>')],
 ('ivory', 1): [('<small>Ace-high flush, all hearts</small><b>Flush</b><span>Meera takes 1,480</span><div class="seal">M</div>', '<small>{{Desc}}</small><b>{{hand}}</b><span>{{name}} {{takes}} {{amt}}</span><div class="seal">{{I}}</div>')],
 ('ivory', 2): [('<small>Kings full of sevens</small><b data-t="Full House">Full House</b><b class="iv3_foil">Full House</b>', '<small>{{Desc}}</small><b data-t="{{hand}}">{{hand}}</b><b class="iv3_foil">{{hand}}</b>'),
                ('TRAIN POKER · PRESS NO. 23', 'TRAIN POKER · PRESS NO. {{handNo}}'),
                ('<small>Pot to</small><b>Meera</b><em>2,860</em>', '<small>Pot to</small><b>{{name}}</b><em>{{amt}}</em>'),
                ('Proof 1 of 1 · pressed at the Friday Night Table', 'Proof 1 of 1 · pressed at {{tableAt}}')],
 ('ivory', 3): [('>R</text>', '>{{H1}}</text>'), ('<b>Royal Flush</b>', '<b>{{hand}}</b>'), ('ten to ace of hearts · Meera', '{{desc}} · {{name}}'),
                ('<div class="iv4_seal">M</div>', '<div class="iv4_seal">{{I}}</div>')],
 ('ivory', 4): [('OUT<br><small>HAND 23</small>', 'OUT<br><small>HAND {{handNo}}</small>'),
                ('<b>Arjun is out</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy</em><em>Watch</em></div>',
                 '<b>{{bname}} is out</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Rebuy</em><em data-tpw="watch">Watch</em></div>')],
 ('velvet', 0): [('<small>Meera made a</small><b>Straight</b><span>eight to queen · +860</span>', '<small>{{name}} {{madeA}}</small><b>{{hand}}</b><span>{{desc}} · +{{amt}}</span>')],
 ('velvet', 1): [('<small>Ace-high flush, all hearts</small><b>Flush</b>', '<small>{{Desc}}</small><b>{{hand}}</b>'),
                 ('<span>Meera takes <em>1,480</em></span>', '<span>{{name}} {{takes}} <em>{{amt}}</em></span>')],
 ('velvet', 2): [('<small>Kings full of sevens</small><b>' + ''.join(f'<span style="--k:{k}">{ch}</span>' for k, ch in enumerate(['F', 'u', 'l', 'l', '&nbsp;', 'H', 'o', 'u', 's', 'e'])) + '</b>',
                  '<small>{{Desc}}</small><b>{{#each hand}}<span style="--k:{{k}}">{{ch}}</span>{{/each}}</b>'),
                 ('<small>To Meera</small><b>2,860</b>', '<small>To {{name}}</small><b>{{amt}}</b>')],
 ('velvet', 3): [('<b>Royal Flush</b>', '<b>{{hand}}</b>'), ('<span>Meera · Season 3 · member no. 1</span>', '<span>{{name}} · Season {{year}} · member no. 1</span>')],
 ('velvet', 4): [('<b>Arjun has left the table</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy 1,000</em><em>Watch</em></div>',
                  '<b>{{bname}} has left the table</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Rebuy {{stack}}</em><em data-tpw="watch">Watch</em></div>')],
 ('cyber', 0): [('<small>// HAND CLASS 05</small><b>STRAIGHT</b>', '<small>// HAND CLASS {{CLS}}</small><b>{{HAND}}</b>'),
                ('8 · 9 · 10 · J · Q', '{{ranksDot}}'), ('MEERA +860', '{{NAME}} +{{amt}}')],
 ('cyber', 1): [('<small>// HAND CLASS 06 · ACE-HIGH FLUSH, ALL HEARTS</small><b>ACE<br>FLUSH</b><span>MEERA +1,480</span>', '<small>// HAND CLASS {{CLS}} · {{DESC}}</small><b>{{L1}}<br>{{L2}}</b><span>{{NAME}} +{{amt}}</span>')],
 ('cyber', 2): [('// ICE BREACH // HAND CLASS 07 // KINGS FULL OF SEVENS // ICE BREACH // HAND CLASS 07 //', '// ICE BREACH // HAND CLASS {{CLS}} // {{DESC}} // ICE BREACH // HAND CLASS {{CLS}} //'),
                ('Kings full. I', '{{Short}}. I'),
                ('<span>MEERA</span><b>+2,860 CR</b>', '<span>{{NAME}}</span><b>+{{amt}} CR</b>'),
                ('// PAYOUT CONFIRMED // MEERA // PAYOUT CONFIRMED // MEERA // PAYOUT CONFIRMED //', '// PAYOUT CONFIRMED // {{NAME}} // PAYOUT CONFIRMED // {{NAME}} // PAYOUT CONFIRMED //'),
                ('<b class="y3_dc"></b><b class="y3_dc2"></b>', '<b data-fit="h" data-t="{{HAND}}" class="y3_dc"></b><b data-fit="h" data-t="{{HAND}}" class="y3_dc2"></b>'), ('"#$%&*/@!=?"', '"{{scr0}}"'), ('"F#%L ?0U$E"', '"{{scr1}}"'), ('"FU@L H0#SE"', '"{{scr2}}"'), ('"FULL H0US3"', '"{{scr3}}"'), ('"FULL HOUSE"', '"{{HAND}}"')],
 ('cyber', 3): [('TARGET LOCK // MEERA', 'TARGET LOCK // {{NAME}}'), ('P(ROYAL) = 0.000154%', 'P({{PKEY}}) = {{PCT}}'),
                ('data-t="ROYAL FLUSH">ROYAL FLUSH', 'data-t="{{HAND}}">{{HAND}}'),
                ('LEGENDARY // 1 IN 649,740 // MEERA // TROPHY ACQUIRED // SEASON 3 //', 'LEGENDARY // 1 IN {{odds}} // {{NAME}} // TROPHY ACQUIRED // SEASON {{year}} //')],
 ('cyber', 4): [('<small>SEAT 05 // SIGNAL LOST</small><b>ARJUN · FLATLINED</b><span>9th of 13 · 1 rebuy left</span><div><em>REBUY 1,000</em><em>SPECTATE</em></div>',
                 '<small>SEAT {{seatNo2}} // SIGNAL LOST</small><b>{{BNAME}} · FLATLINED</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">REBUY {{stack}}</em><em data-tpw="watch">SPECTATE</em></div>')],
 ('ink', 0): [('<b>ストレート!</b><span>STRAIGHT · MEERA +860</span>', '<b>{{JA}}!</b><span>{{HAND}} · {{NAME}} +{{amt}}</span>')],
 ('ink', 1): [('<b>フラッシュ</b>', '<b>{{JA}}</b>'), ('<small>ACE-HIGH FLUSH, ALL HEARTS</small><b>FLUSH!!</b><span>Meera takes 1,480</span>', '<small>{{DESC}}</small><b>{{HAND}}!!</b><span>{{name}} {{takes}} {{amt}}</span>')],
 ('ink', 2): [('<b>FULL<br>HOUSE!!</b><span>KINGS FULL OF SEVENS</span>', '<b>{{L1}}<br>{{L2}}!!</b><span>{{DESC}}</span>'),
              ('<b>Meera</b> wins 2,860!', '<b>{{name}}</b> {{wins}} {{amt}}!')],
 ('ink', 3): [('<b>ROYAL</b><b>FLUSH</b>', '<b>{{L1}}</b><b>{{L2}}</b>'), ('<b>MEERA</b> · ten to ace of hearts · trophy unlocked', '<b>{{NAME}}</b> · {{desc}} · trophy unlocked')],
 ('ink', 4): [('<b>ARJUN IS OUT…</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy!</em><em>Watch</em></div>',
               '<b>{{BNAME}} IS OUT…</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Rebuy!</em><em data-tpw="watch">Watch</em></div>')],
 ('pixel', 0): [('<span class="who">MEERA</span><p><span class="tw">found a <b>STRAIGHT</b>! +860 gold</span></p>', '<span class="who">{{NAME}}</span><p><span class="tw">found {{art}} <b>{{HAND}}</b>! +{{amt}} gold</span></p>'),
                ('steps(28)', 'steps({{tw0}})')],
 ('pixel', 1): [('<b>ACE<br>FLUSH</b><span>+1,480 GOLD · MEERA</span>', '<b>{{L1}}<br>{{L2}}</b><span>+{{amt}} GOLD · {{NAME}}</span>')],
 ('pixel', 2): [(''.join(f'<span class="p3_lt" style="--k:{k}">{ch}</span>' for k, ch in enumerate(['F', 'U', 'L', 'L', '&nbsp;', 'H', 'O', 'U', 'S', 'E'])) + '<span class="p3_lt" style="--k:10">!</span>',
                 '{{#each HAND}}<span class="p3_lt" style="--k:{{k}}">{{ch}}</span>{{/each}}<span class="p3_lt" style="--k:{{HANDlen}}">!</span>'),
                ('<p class="p3_sub">KINGS FULL OF SEVENS</p>', '<p class="p3_sub">{{DESC}}</p>'),
                ('MEERA obtained FULL HOUSE!<br>+2860 GOLD', '{{NAME}} obtained {{HAND}}!<br>+{{amtRaw}} GOLD'), ('steps(26)', 'steps({{tw2}})')],
 ('pixel', 3): [('<div>' + ''.join(f'<span class="p4_rl" style="--k:{k}">{ch}</span>' for k, ch in enumerate('ROYAL')) + '</div><div>' + ''.join(f'<span class="p4_rl" style="--k:{k}">{ch}</span>' for k, ch in enumerate('FLUSH')) + '</div>',
                 '<div>{{#each L1}}<span class="p4_rl" style="--k:{{k}}">{{ch}}</span>{{/each}}</div><div>{{#each L2}}<span class="p4_rl" style="--k:{{k}}">{{ch}}</span>{{/each}}</div>'),
                ('<b>ACHIEVEMENT UNLOCKED</b>Royal Flush · Meera', '<b>ACHIEVEMENT UNLOCKED</b>{{hand}} · {{name}}'), ('GOLD <em>+4,120</em>', 'GOLD <em>+{{amt}}</em>')],
 ('pixel', 4): [('<small>ARJUN · 9TH OF 13</small>', '<small>{{BNAME}} · {{PLACE}}</small>'),
                ('<div><span>REBUY ×1</span><span>WATCH</span></div>', '<div data-tpw-btns><span data-tpw="rebuy">REBUY</span><span data-tpw="watch">WATCH</span></div>')],
 ('train', 0): [('<b>STRAIGHT</b><span>← THREE OF A KIND · FLUSH →</span><em>MEERA +860</em>', '<b>{{HAND}}</b><span>{{TRAIN_LINE}}</span><em>{{NAME}} +{{amt}}</em>')],
 ('train', 1): [('EXPRESS · ACE-HIGH FLUSH, ALL HEARTS', 'EXPRESS · {{DESC}}'),
                ('<div class="fl">' + ''.join(f'<span style="--d:{k * .05:.2f}s">{ch}</span>' for k, ch in enumerate('FLUSH')) + '</div>',
                 '<div class="fl">{{#each HAND}}<span style="--d:calc({{k}} * .05s)">{{ch}}</span>{{/each}}</div>'),
                ('MEERA · 1,480 · ON TIME', '{{NAME}} · {{amt}} · ON TIME')],
 ('train', 2): [('Well, I never!<br><b>Kings full!</b>', 'Well, I never!<br><b>{{Short}}!</b>'),
                ('<small>KINGS FULL OF SEVENS</small><b>FULL HOUSE</b><div class="r3_ln"><span>← FLUSH</span><span>FOUR OF A KIND →</span></div>',
                 '<small>{{DESC}}</small><b>{{HAND}}</b><div class="r3_ln"><span>{{PREV_A}}</span><span>{{NEXT_A}}</span></div>'),
                ('FRIDAY NIGHT TABLE · HAND 23', '{{TABLE}} · HAND {{handNo}}'), ('<b>MEERA</b><em>+2,860</em>', '<b>{{NAME}}</b><em>+{{amt}}</em>')],
 ('train', 3): [('<div class="r4_rd"><i></i><b>ROYAL FLUSH</b>', '<div class="r4_rd"><i></i><b>{{HAND}}</b>'),
                ('<div class="r4_fl">' + ''.join(f'<span style="--k:{k}">{ch}</span>' for k, ch in enumerate('ROYAL FLUSH')) + '</div>',
                 '<div class="r4_fl">{{#each HAND raw}}<span style="--k:{{k}}">{{ch}}</span>{{/each}}</div>'),
                ('<em>MEERA · TEN TO ACE OF HEARTS</em>', '<em>{{NAME}} · {{DESC}}</em>'), ('<b>MEERA</b>', '<b>{{NAME}}</b>'),
                ('SEASON 3 · ROYAL FLUSH · NO. 001', 'SEASON {{year}} · {{HAND}} · NO. 001')],
 ('train', 4): [('<b>Arjun gets off here</b><span>9th of 13 · 1 rebuy left</span><div><em>Catch the next train · 1,000</em><em>Ride along and watch</em></div>',
                 '<b>{{bname}} gets off here</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Catch the next train · {{stack}}</em><em data-tpw="watch">Ride along and watch</em></div>')],
 ('edo', 0): [('<b>順</b><span>STRAIGHT · MEERA +860</span>', '<b>{{EDO}}</b><span>{{HAND}} · {{NAME}} +{{amt}}</span>')],
 ('edo', 1): [('<span class="t">一色</span><span class="u">FLUSH · ACE HIGH</span>', '<span class="t">{{EDO}}</span><span class="u">{{HAND}} · {{HIGH}}</span>'),
              ('<div class="e3h">色</div>', '<div class="e3h">{{EDO1}}</div>'), ('<b>Meera</b>takes 1,480', '<b>{{name}}</b>{{takes}} {{amt}}')],
 ('edo', 2): [('<b>四枚</b><small>FOUR OF A KIND</small>', '<b>{{EDO}}</b><small>{{HAND}}</small>'), ('<div class="e3_hanko">四</div>', '<div class="e3_hanko">{{EDO1}}</div>'),
              ('<b>Meera</b>four nines · takes 2,860', '<b>{{name}}</b>{{desc}} · {{takes}} {{amt}}')],
 ('edo', 3): [('<span>天下一</span><b>ROYAL FLUSH</b><small>ten to ace of cherry blossom</small>', '<span>{{EDO}}</span><b>{{HAND}}</b><small>{{desc}}</small>'),
              ('<b>Meera</b>once in a season · trophy added to her player card', '<b>{{name}}</b>once in a season · trophy added to the player card')],
 ('edo', 4): [('<b>Arjun leaves the den</b><span>9th of 13 · one rebuy left</span><div><em>Rebuy 1,000</em><em>Watch</em></div>',
               '<b>{{bname}} leaves the den</b><span>{{place}}{{rebuyNote}}</span><div data-tpw-btns><em data-tpw="rebuy">Rebuy {{stack}}</em><em data-tpw="watch">Watch</em></div>')],
}

# Sample literals that must not survive in any template (checked on the visible text and attributes).
SAMPLES = ['Meera', 'MEERA', 'Arjun', 'ARJUN', '1,480', '2,860', '2860', '4,120', '1,000', '+860', ' 860', '>860', 'Straight', 'STRAIGHT', 'Flush', 'FLUSH',
           'Full House', 'FULL HOUSE', 'Royal', 'ROYAL', 'FOUR OF A KIND', 'THREE OF A KIND', 'Kings full', 'KINGS FULL', 'kings full', 'sevens', 'SEVENS',
           'all hearts', 'ALL HEARTS', 'of hearts', 'OF HEARTS', 'cherry blossom', 'four nines', 'eight to queen', '9th of 13', '9TH OF 13', 'rebuy left',
           'rebuy remains', 'Seat 5', 'SEAT 05', '649,740', '0.000154', ' S3', 'Season 3', 'SEASON 3', 'HAND 23', 'NO. 23', 'Friday Night', 'FRIDAY NIGHT',
           'ACE HIGH', 'ACE-HIGH', 'Ace-high', 'ACE<br>', 'CLASS 0', 'ストレート', 'フラッシュ', '一色', '四枚', '天下一', '>順<', '>色<', 'hanko">四<', 'seal">M<', '>R</text>', 'her player']


# ---------------- cards ----------------
CARD_RE = re.compile(r'<div ((?:style="[^"]*" )?)class="cd ([sml]) ([shdc])( [^"]*)?"((?: style="[^"]*")?)>(.*?)</div>')
RANKS = '23456789TJQKA'
# Fixed copy of the design that happens to contain a sample word (it stays as drawn).
DECOR = ['The Royal Table']


# Text that changes length with the real result: the element that holds it gets data-fit, and tiers.ts
# shrinks its type if the real text would take more lines than the sample did, or run off the screen.
FIT = set('name NAME bname BNAME hand HAND L1 L2 JA EDO aHand desc Desc DESC ranksDot TRAIN_LINE PREV_A NEXT_A Short place PLACE rebuyNote HIGH madeA'.split())
# the hand's name: never wider than the sample's was (a ribbon, a plaque, a sign is drawn around it)
TITLE = set('hand HAND L1 L2 JA EDO aHand'.split())
VOID = {'br', 'img', 'input', 'hr', 'use', 'path', 'circle', 'rect', 'line', 'ellipse', 'polygon', 'stop'}

def mark_fit(h):
    stack, marks = [], {}
    for m in re.finditer(r'<(/?)([\w-]+)([^>]*?)(/?)>|([^<]+)', h):
        if m.group(5) is not None:
            keys = set(re.findall(r'\{\{([\w]+)\}\}', m.group(5))) | ({'each'} if '{{#each' in m.group(5) else set())
            if stack and (keys & FIT or 'each' in keys):
                marks[stack[-1]] = marks.get(stack[-1], '') or ('h' if keys & TITLE or 'each' in keys else '')
            continue
        close, tag, selfc = m.group(1), m.group(2).lower(), m.group(4)
        if close:
            while stack and stack[-1][0] != tag: stack.pop()
            if stack: stack.pop()
        elif not selfc and tag not in VOID: stack.append((tag, m.end(2)))
    for (tag, pos), kind in sorted(marks.items(), key=lambda x: -x[0][1]):
        if tag in ('text', 'tspan'): continue  # svg text: fitted by its data-fitw width
        h = h[:pos] + (' data-fit="h"' if kind else ' data-fit') + h[pos:]
    return h


def card_slots(h, kind):
    """Replace every face-up card with a slot; return the new html. kind: 'asc' (straights) or 'grp'."""
    occ = []
    for m in CARD_RE.finditer(h):
        r = re.search(r'<b class="r(?: ten)?">(\w+)</b>', m.group(6)).group(1)
        occ.append(('T' if r == '10' else r) + m.group(3))
    if not occ: return h
    uniq = list(dict.fromkeys(occ))
    cnt = {r: sum(1 for c in uniq if c[0] == r) for r in RANKS}
    if kind == 'asc': uniq.sort(key=lambda c: RANKS.index(c[0]))
    else: uniq.sort(key=lambda c: (-cnt[c[0]], -RANKS.index(c[0])))
    idx = {c: i for i, c in enumerate(uniq)}
    it = iter(occ)
    def sub(m):
        i = idx[next(it)]
        return f'<div {m.group(1)}class="cd {m.group(2)} {{{{cs:{i}}}}}{m.group(4) or ""}"{m.group(5)}>{{{{ci:{i}:{m.group(2)}}}}}</div>'
    return CARD_RE.sub(sub, h)

# which order the sample cards of each scene follow (scene 1 is a flush, 2 a full house / quads, 3 a royal flush)
CARD_KIND = {0: 'grp', 1: 'grp', 2: 'grp', 3: 'asc', 4: 'grp'}


# ---------------- css ----------------
def split_top(v):
    """Split an animation shorthand at top-level commas."""
    out, d, cur = [], 0, ''
    for ch in v:
        if ch == '(': d += 1
        elif ch == ')': d -= 1
        if ch == ',' and d == 0: out.append(cur); cur = ''
        else: cur += ch
    out.append(cur)
    return out

def secs(tok):
    m = re.fullmatch(r'([\d.]+)(m?s)', tok)
    return None if not m else float(m.group(1)) / (1000 if m.group(2) == 'ms' else 1)

def durations(c):
    ds = []
    for v in re.findall(r'animation:([^;}]*)', c):
        for a in split_top(v):
            t = next((secs(x) for x in a.split() if secs(x) is not None), None)
            if t: ds.append(t)
    return ds

def fix_animations(c, names, pre, T):
    def one(a):
        toks = a.split()
        toks = [pre + t if t in names else t for t in toks]
        d = next((secs(x) for x in toks if secs(x) is not None), None)
        if d is not None and abs(d - T) < 1e-6 and 'infinite' in toks:
            toks = ['1' if t == 'infinite' else t for t in toks]
            if not any(t in ('none', 'forwards', 'backwards', 'both') for t in toks): toks.append('both')
        return ' '.join(toks)
    c = re.sub(r'animation:([^;}]*)', lambda m: 'animation:' + ','.join(one(a) for a in split_top(m.group(1))), c)
    c = re.sub(r'animation-name:([^;}]*)', lambda m: 'animation-name:' + ','.join(pre + a.strip() if a.strip() in names else a for a in m.group(1).split(',')), c)
    return re.sub(r'@keyframes\s+([\w-]+)', lambda m: '@keyframes ' + (pre + m.group(1) if m.group(1) in names else m.group(1)), c)

def scope_sel(sel, key):
    sel = sel.strip()
    m = re.fullmatch(r'\.t\d>(\.[\w-]+)', sel)
    if m: return '.tpw-shake ' + m.group(1)          # the screen shake: the live table's own parts
    if sel.startswith('.th-' + key): return '.tpw' + sel
    return '.tpw ' + sel

def scope_css(c, key):
    out, i = '', 0
    while i < len(c):
        j = c.find('{', i)
        if j < 0: out += c[i:]; break
        head = c[i:j]
        # find the matching close brace
        d, k = 0, j
        while True:
            if c[k] == '{': d += 1
            elif c[k] == '}':
                d -= 1
                if d == 0: break
            k += 1
        body = c[j + 1:k]
        h = head.strip()
        if h.startswith('@keyframes'): out += f'{h}{{{body}}}'
        elif h.startswith('@media') or h.startswith('@supports'): out += f'{h}{{{scope_css(body, key)}}}'
        elif h: out += ','.join(scope_sel(s, key) for s in split_top(h)) + '{' + body + '}'
        i = k + 1
    return out


def export(key, th):
    sx, sy = seat_xy(4)
    scenes = []
    for i, (h, c) in enumerate(th.tier_set()):
        where = f'{key} {i}'
        h = card_slots(h, CARD_KIND[i])
        for old, new in R.get((key, i), []):
            if old in h: h = h.replace(old, new)
            elif old in c: c = c.replace(old, new)
            else: sys.exit(f'{where}: sample text not found: {old[:90]!r}')
        if (key, i) == ('edo', 2):   # edo shows the four of a kind; any other hand gets its fifth card
            last = re.findall(r'<div class="cd [^>]*>\{\{ci:3:\w\}\}</div>', h)[-1]
            h = h.replace(last, last + '{{?five}}' + last.replace(':3', ':4').replace('cs:3', 'cs:4') + '{{/five}}', 1)
        h = mark_fit(h)
        h = h.replace(">{{name}} · '{{yy}}</text>", ' data-fitw="70">{{name}} · \'{{yy}}</text>')
        # the bust-out marks sat on Arjun's seat in the sample: place them on the real busted seat instead
        h = re.sub(r'left:(\d+\.\d{6,})px', lambda m: f'left:calc(var(--sx) + {float(m.group(1)) - sx:.1f}px)', h)
        h = re.sub(r'top:(\d+\.\d{6,})px', lambda m: f'top:calc(var(--sy) + {float(m.group(1)) - sy:.1f}px)', h)
        h = h.replace('src="img/', 'src="/tp/img/').replace('url(img/', 'url(/tp/img/')
        c = c.replace('url(img/', 'url(/tp/img/')
        ds = [d for d in durations(c) if d <= MAX_T[i]]
        T = max(ds)
        names = set(re.findall(r'@keyframes\s+([\w-]+)', c))
        c = fix_animations(c, names, f'tw{key[:3]}{i}_', T)
        shake = bool(re.search(r'\.t\d>\.', c))
        c = scope_css(c, key)
        # nothing of the sample may be left in what the player sees
        vis = re.sub(r'<svg class="(?:art|bk)[^"]*"[^>]*>.*?</svg>', '', h)
        txt = ' '.join(re.findall(r'>([^<]+)<', vis)) + ' ' + ' '.join(re.findall(r'(?:data-t|aria-label)="([^"]*)"', vis))
        txt += ' ' + ' '.join(re.findall(r'content:"([^"]*)"', c))
        for ok in DECOR: txt = txt.replace(ok, '')
        for s in SAMPLES:
            if s.endswith('<') or s.endswith('</text>'):
                if s in vis: sys.exit(f'{where}: sample {s!r} left in the template')
            elif s in txt: sys.exit(f'{where}: sample {s!r} left in the template: ...{txt[max(0, txt.find(s) - 60):txt.find(s) + 40]}...')
        scenes.append({'html': h, 'css': c, 'dur': round(T * 1000), 'shake': shake})
    return scenes

if __name__ == '__main__':
    data = {k: export(k, th) for k, th in run.THEMES.items()}
    with open(OUT, 'w') as f: json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(OUT, os.path.getsize(OUT), 'bytes;', {k: [s['dur'] for s in v] for k, v in data.items()})
