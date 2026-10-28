/** @typedef {import('./match.js').MatchState} MatchState */

/**
 * viewerIndex 기준으로 보여줄 경기 상태를 만든다.
 * 원본 match 는 바꾸지 않고 JSON 왕복 복사본을 가공해 돌려준다.
 * @param {MatchState} match
 * @param {number} viewerIndex
 * @returns {Record<string, any>}
 */
export function viewFor(match, viewerIndex) {
  if (viewerIndex !== 0 && viewerIndex !== 1) {
    throw new Error(`잘못된 플레이어 번호: ${viewerIndex}`);
  }

  const view = JSON.parse(JSON.stringify(match));
  // 셔플 예측을 막기 위해 난수 상태는 내보내지 않는다.
  delete view.seed;
  delete view.rngState;

  // 드래프트 중에는 상대의 선택을 숨긴다.
  if (view.stage === 'draft') {
    for (let i = 0; i < view.picks.length; i++) {
      if (i !== viewerIndex) view.picks[i].cardIds = null;
    }
  }

  if (view.game) {
    // 내 선택지가 카드 uid 라면 어떤 카드인지 알려준다(덱 위 카드처럼 가려진 구역의 카드도 포함).
    const ownPending = match.game.pending;
    if (ownPending && ownPending.playerIndex === viewerIndex) {
      /** @type {Record<string, string>} */
      const optionCards = {};
      const zones = match.game.players.flatMap((p) => [p.hand, p.drawPile, p.discard, p.inPlay]).concat([match.game.trash]);
      for (const zone of zones) {
        for (const card of zone) {
          if (ownPending.options.includes(card.uid)) optionCards[card.uid] = card.cardId;
        }
      }
      view.game.pending.optionCards = optionCards;
    }

    delete view.game.seed;
    delete view.game.rngState;

    for (let i = 0; i < view.game.players.length; i++) {
      const player = view.game.players[i];
      // 자기 덱 순서도 숨긴다.
      player.drawCount = player.drawPile.length;
      player.drawPile = [];
      if (i !== viewerIndex) {
        player.handCount = player.hand.length;
        player.hand = [];
      }
    }

    const pending = view.game.pending;
    if (pending) {
      delete pending.ctx;
      delete pending.rest;
      delete pending.data;
      if (pending.playerIndex !== viewerIndex) {
        view.game.pending = {
          playerIndex: pending.playerIndex,
          prompt: pending.prompt,
          waiting: true,
        };
      }
    }
  }

  view.you = viewerIndex;
  return view;
}
