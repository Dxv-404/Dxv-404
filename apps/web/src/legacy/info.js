import { h, cardEl } from './ui.js';

const HANDS = [
  ['Royal Flush', 'Ace, King, Queen, Jack and Ten, all of one suit. The best hand there is.', ['As', 'Ks', 'Qs', 'Js', 'Ts']],
  ['Straight Flush', 'Five cards in a row, all of one suit.', ['9h', '8h', '7h', '6h', '5h']],
  ['Four of a Kind', 'All four cards of one rank.', ['Qc', 'Qd', 'Qh', 'Qs', '7d']],
  ['Full House', 'Three of a kind plus a pair. Ranked by the three first.', ['Kd', 'Kh', 'Ks', '4c', '4d']],
  ['Flush', 'Any five cards of one suit. Highest card decides ties.', ['Ad', 'Jd', '8d', '6d', '2d']],
  ['Straight', 'Five cards in a row of mixed suits. Ace can be high (10-J-Q-K-A) or low (A-2-3-4-5).', ['Tc', '9d', '8s', '7h', '6c']],
  ['Three of a Kind', 'Three cards of one rank.', ['7s', '7h', '7d', 'Kc', '2s']],
  ['Two Pair', 'Two different pairs. Higher pair first, then lower pair, then the fifth card.', ['Jh', 'Js', '5c', '5d', 'Ah']],
  ['One Pair', 'Two cards of one rank. The other three cards break ties.', ['Th', 'Tc', 'Ks', '8d', '3c']],
  ['High Card', 'None of the above. Your highest card plays.', ['Ah', 'Qd', '9c', '6s', '3h']],
];

export function infoContent() {
  const list = h('ol', { class: 'rank-list' });
  HANDS.forEach(([name, desc, cards], i) => {
    list.append(h('li', {},
      h('div', { class: 'rank-head' }, h('span', { class: 'rank-n' }, String(i + 1)), h('strong', {}, name)),
      h('div', { class: 'mini-cards' }, cards.map((c) => cardEl(c, { size: 'xs', down: false }))),
      h('p', {}, desc)));
  });
  return h('div', { class: 'info' },
    h('h2', {}, 'Poker hands'),
    h('p', { class: 'lede' }, 'Strongest at the top. You make your best five cards from your two plus the five on the table. Same hand on both sides? The higher cards win; if everything matches, the pot is split. Suits never break ties.'),
    list,
    h('h3', {}, 'How a hand goes'),
    h('ol', { class: 'steps' },
      h('li', {}, 'The two players left of the button post the small and big blind. Everyone gets two cards.'),
      h('li', {}, 'Betting starts left of the big blind. Fold, call the current bet, or raise.'),
      h('li', {}, 'Flop: three cards on the table, then betting. Turn: a fourth card, betting. River: a fifth card, last betting round.'),
      h('li', {}, 'Showdown: the best five-card hand wins the pot. If everyone else folds, the last player wins without showing.')),
    h('h3', {}, 'Betting words'),
    h('dl', { class: 'terms' },
      h('dt', {}, 'Check'), h('dd', {}, 'Pass without betting. Only when nobody has bet this round.'),
      h('dt', {}, 'Call'), h('dd', {}, 'Match the current bet.'),
      h('dt', {}, 'Raise'), h('dd', {}, 'Increase the bet. A raise must be at least as big as the last raise.'),
      h('dt', {}, 'All-in'), h('dd', {}, 'Bet everything you have. You can only win from players up to what you put in; the rest goes to a side pot.')),
    h('p', { class: 'credit' }, 'Dealer photo: "Poker Dealer" by Fabsidea, CC BY-SA 4.0, via Wikimedia Commons (cropped).'));
}
