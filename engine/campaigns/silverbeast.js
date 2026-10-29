import { registerCampaign } from '../campaign.js';
import '../cards/silverbeast.js';

// 모험 모드 1: 은빛 야수 소탕 작전.
// 스테이지마다 캐릭터와 입고 카드를 새로 고른다. 지면 1스테이지부터 다시.
registerCampaign({
  id: 'silverbeast',
  name: '은빛 야수 소탕 작전',
  description: '숲을 피로 물들이는 은빛 야수들을 소탕하라. 그들의 발톱은 출혈을 남긴다.',
  stages: [
    {
      name: '숲 어귀',
      bossId: 'sb_pup',
      intro: '무리에서 떨어진 어린 늑대다. 아직 이빨이 무르다.',
    },
    {
      name: '달빛 계곡',
      bossId: 'sb_wolfpack',
      intro: '은빛 늑대들이 무리를 지어 덤벼든다. 발톱에 베이면 피가 멎지 않는다.',
    },
    {
      name: '안개 덤불',
      bossId: 'sb_stalker',
      intro: '보이지 않는 곳에서 상처를 노린다. 피를 흘리는 사냥감일수록 더 사납게 문다.',
    },
    {
      name: '은빛 동굴',
      bossId: 'sb_bear',
      intro: '은빛 갑주를 두른 곰. 웬만한 공격은 튕겨 낸다.',
    },
    {
      name: '야수왕의 둥지',
      bossId: 'sb_king',
      intro: '모든 은빛 야수를 다스리는 왕. 피 냄새를 맡으면 멈추지 않는다.',
    },
  ],
});
