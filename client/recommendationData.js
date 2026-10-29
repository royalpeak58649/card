// tools/recommend.js의 AI 대전 결과를 바탕으로 선정한 입고 추천. 운영 설명은 카드 효과를 기준으로 작성.
export const RECOMMENDATIONS = {
  "hayun": [
    {
      "name": "군수 전환과 무기 조달",
      "strategy": "예산 집행으로 구매력을 쌓고, 군수 전환으로 돌을 무기로 바꾸세요. 긴급 조달로 무기를 덱 위에 놓고 정비 교대로 다시 돌립니다. 무기 할증 때문에 조달 가능한 카드가 달라지니 현재 가격을 확인하세요.",
      "cardIds": [
        "s8_logistics",
        "s8_maintenance",
        "s8_emergencyProc",
        "s8_budget"
      ]
    },
    {
      "name": "보급 경제와 연속 구매",
      "strategy": "보급 지령으로 손패와 원을 보충하고 작전 자금으로 무기 구매 후 환급받으세요. 보급 창고로 구매 횟수를 늘린 뒤 무기를 두 장 이상 사면 별도 얻습니다. 하윤의 능력은 내 다섯 번째 차례부터 쓸 수 있습니다.",
      "cardIds": [
        "s8_supplyOrder",
        "s8_opFunds",
        "s8_emergencyProc",
        "s8_depot"
      ]
    }
  ],
  "kangjin": [
    {
      "name": "중기관총 집중 화력",
      "strategy": "작전 자금과 보급 지령으로 무기 구매를 준비하세요. 제식 기관단총은 재화 세 장을 낸 차례에 강해지고, 중기관총은 무기를 많이 낼수록 강해집니다. 무기 세 장을 모아 강진의 추가 피해를 노리세요.",
      "cardIds": [
        "s8_supplyOrder",
        "s8_opFunds",
        "s8_serviceSmg",
        "s8_heavyMg"
      ]
    },
    {
      "name": "무기 전환과 재순환",
      "strategy": "군수 전환으로 돌을 무기로 바꾸고 정비 교대로 무기를 다시 준비하세요. 보급 지령은 손패와 구매력을 보충합니다. 제식 기관단총과 권총을 함께 모아 무기 세 장 조건을 맞추세요.",
      "cardIds": [
        "s8_supplyOrder",
        "s8_logistics",
        "s8_maintenance",
        "s8_serviceSmg"
      ]
    }
  ],
  "doyun": [
    {
      "name": "참호와 제압 사격",
      "strategy": "참호 구축으로 방어를 얻은 뒤 제압 사격을 내면 추가 피해를 줍니다. 보급 지령으로 손패를 잇고 군수 전환으로 무기를 마련하세요. 공격이 약한 차례에는 무기를 내지 않고 도윤의 방어를 받는 선택도 좋습니다.",
      "cardIds": [
        "s8_supplyOrder",
        "s8_logistics",
        "s8_trench",
        "s8_suppress"
      ]
    },
    {
      "name": "참호 방어와 보급선 차단",
      "strategy": "참호 구축으로 버티면서 보급선 차단으로 상대 덱의 카드를 버리게 합니다. 작전 자금으로 구매력을 키우고 군수 전환으로 무기를 확보하세요. 무기를 내지 않는 차례에는 도윤의 추가 방어를 얻습니다.",
      "cardIds": [
        "s8_logistics",
        "s8_opFunds",
        "s8_trench",
        "s8_cutSupply"
      ]
    }
  ],
  "jin": [
    {
      "name": "연쇄 반응과 행동 연결",
      "strategy": "시냅스 점화와 폭주 연산으로 행동력을 잇고 신경망 동기화로 손패를 늘리세요. 연쇄 반응은 낸 행동카드 수에 비례해 피해를 주므로 여러 장을 연결한 차례에 힘을 냅니다. 폭주 연산은 다른 행동 뒤에 내면 카드 뽑기 조건을 맞추기 쉽습니다.",
      "cardIds": [
        "nu_synapse",
        "nu_sync",
        "nu_runaway",
        "nu_chain"
      ]
    },
    {
      "name": "재귀 호출과 전자기 펄스",
      "strategy": "시냅스 점화로 행동력을 보충하고 신경망 동기화로 카드를 뽑으세요. 재귀 호출로 버린 행동카드를 다시 사용하며 행동카드 네 장 조건을 맞추면 전자기 펄스가 추가 피해를 줍니다. 진의 별은 상대 행동카드 여섯 장 조건에서 얻습니다.",
      "cardIds": [
        "nu_synapse",
        "nu_sync",
        "nu_recursion",
        "nu_emp"
      ]
    }
  ],
  "gemini": [
    {
      "name": "과부하 자금과 뇌파 공격",
      "strategy": "사고 전파로 행동력을 유지하며 피해를 쌓고 신경망 동기화와 뇌파 공격으로 손패를 보충하세요. 과부하는 다른 행동카드를 낸 뒤 사용하면 구매력이 커집니다. 일회성 능력은 피해 행동카드가 여러 장 모인 차례에 사용하세요.",
      "cardIds": [
        "nu_sync",
        "nu_overload",
        "nu_thought",
        "nu_brainwave"
      ]
    },
    {
      "name": "공명 연속 공격",
      "strategy": "시냅스 점화와 사고 전파로 행동카드를 잇고 공명으로 낸 행동카드 수를 피해로 바꾸세요. 뇌파 공격도 함께 모인 차례에 제미니아노의 일회성 능력을 쓰면 피해 행동카드마다 추가 피해를 얻습니다.",
      "cardIds": [
        "nu_synapse",
        "nu_thought",
        "nu_brainwave",
        "nu_resonance"
      ]
    }
  ],
  "echo": [
    {
      "name": "과부하 복제와 펄스 화력",
      "strategy": "시냅스 점화로 행동력을 잇고 신경망 동기화로 손패를 늘립니다. 과부하는 행동카드를 여러 장 낸 뒤 사용하고 전자기 펄스로 마무리하세요. 내 네 번째 차례부터 처음 내는 행동력 비용 1 이상 카드가 두 번 발동하므로 어떤 카드를 먼저 낼지 확인하세요.",
      "cardIds": [
        "nu_synapse",
        "nu_sync",
        "nu_overload",
        "nu_emp"
      ]
    },
    {
      "name": "재귀 호출과 루프백 순환",
      "strategy": "시냅스 점화와 신경망 동기화로 손패를 돌리고 재귀 호출·루프백으로 버린 행동카드를 다시 준비합니다. 공격용 무기도 함께 구매하세요. 루프백은 강화하면 카드를 손으로 가져오며, 내 네 번째 차례부터 첫 행동력 비용 1 이상 카드를 두 번 발동합니다.",
      "cardIds": [
        "nu_synapse",
        "nu_sync",
        "nu_recursion",
        "nu_loopback"
      ]
    }
  ],
  "jace": [
    {
      "name": "장인의 검과 강화 경제",
      "strategy": "제이스의 별 3개 영구 강화를 활용해 장인의 검의 추가 피해를 키우세요. 연마는 일시 강화와 손패 순환을 돕고 명품 컬렉션은 강화 카드를 많이 낸 차례의 구매력을 늘립니다. 성좌 의식으로 별을 보충하세요.",
      "cardIds": [
        "lg_ritual",
        "lg_hone",
        "lg_masterSword",
        "lg_collection"
      ]
    },
    {
      "name": "유성과 장인의 검",
      "strategy": "연마로 카드를 강화해 손패를 돌리고 유성 낙하로 피해를 더하세요. 영구 강화가 쌓이면 장인의 검이 강해집니다. 별을 사용한 차례에는 왕실 천문대로 카드와 구매력을 보충할 수 있습니다.",
      "cardIds": [
        "lg_meteor",
        "lg_observatory",
        "lg_hone",
        "lg_masterSword"
      ]
    }
  ],
  "elena": [
    {
      "name": "별 소모와 성광 폭발",
      "strategy": "성좌 의식으로 별을 보충하고 강화와 유성 낙하에 별을 사용하세요. 성광 폭발은 쓴 별 수를 피해로, 성운 금화는 구매력으로 바꿉니다. 한 차례 별 세 개 이상을 쓰면 엘레나가 차례 끝에 별을 하나 돌려받습니다.",
      "cardIds": [
        "lg_ritual",
        "lg_meteor",
        "lg_starburst",
        "lg_nebulaCoin"
      ]
    },
    {
      "name": "별의 계약과 천문대 순환",
      "strategy": "별의 계약으로 별을 사용해 손패와 행동력을 늘린 뒤 왕실 천문대로 이어 가세요. 성광 폭발은 차례 동안 쓴 별 수만큼 강해집니다. 성좌 의식으로 별을 보충하면서 한 차례 별 세 개 사용 조건을 노리세요.",
      "cardIds": [
        "lg_ritual",
        "lg_observatory",
        "lg_starburst",
        "lg_pact"
      ]
    }
  ],
  "astra": [
    {
      "name": "별의 무게와 천문대",
      "strategy": "별빛 헌금으로 별을 쌓고 별의 무게로 보유한 별을 피해에 활용하세요. 별의 무게는 별을 소비하지 않습니다. 유성 낙하와 강화에 별을 쓴 차례에는 천문대로 구매력을 보충하고, 다음 차례 시작에 별 다섯 개를 유지할지 판단하세요.",
      "cardIds": [
        "lg_offering",
        "lg_meteor",
        "lg_observatory",
        "lg_starWeight"
      ]
    },
    {
      "name": "별 보급과 무료 강화",
      "strategy": "별빛 헌금·성좌 의식으로 별을 모으고 별의 축복으로 별을 쓰지 않고 카드를 강화하세요. 유성 낙하로 공격하면서도 아스트라의 별 다섯 개 보너스를 유지할 여지를 남길 수 있습니다. 기본 무기도 함께 구매해 공격을 보충하세요.",
      "cardIds": [
        "lg_offering",
        "lg_ritual",
        "lg_blessing",
        "lg_meteor"
      ]
    }
  ],
  "lime": [
    {
      "name": "대출 순환과 직접 획득",
      "strategy": "선지급으로 행동력과 손패를 늘리고 신용 대출로 카드를 더 뽑으세요. 채권 발행과 미래 자원은 빚이 있어도 카드를 얻을 수 있습니다. 빚을 남기면 라임은 다음 손패를 여섯 장 뽑지만, 구매하려면 먼저 빚을 갚아야 합니다.",
      "cardIds": [
        "vc_creditLoan",
        "vc_bond",
        "vc_advance",
        "vc_futures"
      ]
    },
    {
      "name": "레버리지 상환과 무기 확보",
      "strategy": "선지급으로 빚을 만든 뒤 레버리지의 추가 원을 받아 상환하세요. 미래 자원으로 무기를 손에 얻고, 빚을 모두 갚은 차례에는 강제 집행의 추가 피해를 노립니다. 빚을 남겨 여섯 장을 뽑을지 구매를 열지 판단하세요.",
      "cardIds": [
        "vc_seizure",
        "vc_advance",
        "vc_leverage",
        "vc_futures"
      ]
    }
  ],
  "sol": [
    {
      "name": "파산 정리와 강제 집행",
      "strategy": "신용 대출로 손패를 늘리고 고리대금으로 구매력을 보충하세요. 파산 신청은 행동단계에 빚을 정리하며 한 번 쓰면 제거됩니다. 이후 고리대금으로 생긴 빚은 구매단계에 갚아야 강제 집행의 추가 피해를 받을 수 있습니다. 솔은 차례 시작마다 빚 하나를 없앱니다.",
      "cardIds": [
        "vc_usury",
        "vc_creditLoan",
        "vc_seizure",
        "vc_bankruptcy"
      ]
    },
    {
      "name": "채권 획득과 책임 전가",
      "strategy": "채권 발행으로 빚이 있어도 카드를 얻고 신용 대출로 손패를 보충하세요. 책임 전가로 빚을 상대에게 넘겨 상환 부담을 줄입니다. 솔의 차례 시작 상환도 활용해 빚을 비운 뒤 강제 집행으로 공격하세요.",
      "cardIds": [
        "vc_creditLoan",
        "vc_bond",
        "vc_seizure",
        "vc_blameShift"
      ]
    }
  ],
  "argus": [
    {
      "name": "대차대조표와 상환 공격",
      "strategy": "신용 대출로 손패와 빚을 늘린 뒤 대차대조표로 원을 확보하세요. 채무 상환은 원 없이 빚을 갚으며 피해를 줍니다. 빚을 비우면 강제 집행이 강해지고, 빚을 남기면 아르거스의 공격 보너스가 생기므로 이번 손패에 맞춰 조절하세요.",
      "cardIds": [
        "vc_creditLoan",
        "vc_seizure",
        "vc_balanceSheet",
        "vc_debtRepay"
      ]
    },
    {
      "name": "채권 성장과 이자 화력",
      "strategy": "신용 대출과 채권 발행으로 빚을 쌓으며 덱을 키우세요. 이자 계산과 아르거스의 능력은 남은 빚을 피해로 바꿉니다. 빚이 있으면 일반 구매는 막히므로 채권 발행으로 필요한 카드를 얻고, 빚을 갚은 차례에는 강제 집행을 활용하세요.",
      "cardIds": [
        "vc_creditLoan",
        "vc_bond",
        "vc_seizure",
        "vc_interest"
      ]
    }
  ]
};
