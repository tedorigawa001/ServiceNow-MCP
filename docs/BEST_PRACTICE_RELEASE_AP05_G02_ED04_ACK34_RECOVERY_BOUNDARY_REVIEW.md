# AP05 G02：ED04／ACK-34 回復先行審査 — C07-Bと拒否後の同session会計

Version: release-ap05-g02-ed04-ack34-recovery-boundary-review-draft-0.1 / Date: 2026-11-20。

Status: **静的審査のみ。ED04は未選択・未承認、旧保証の回復は未確認。候補revision・digest・観測手段は未確定。G02未充足、SL01は起動0。ED06の保留に変更なし。実資料は未指定、外部利用はUnknown、閲覧は未承認・閲覧0。**

[横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)の順序に従い、ED06の不足を保留したままED04を静的に審査した。[ED04回復先行案](BEST_PRACTICE_RELEASE_AP05_G02_ED04_ACK34_RECOVERY_ACCEPTANCE_DESIGN.md)と[C07-Bの採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)を基準とする。読取りHEADは `32a24ae`。回復先行案の基準 `a57400b` から、今回照合したsource・session・adapter・canonical budget・旧試験とcompiled fixture 2本の7ファイルに差分なし。HEADには1.16.2の記録があるが、この移行の候補指定や受入結果ではない。

## 1 旧caseの直接assertionと候補仕様との差

[旧ACK-34](../tests/review/private-composition-ack.test.ts#L77)は、同じ通常sessionで、creation objectの `key` が空object・`undefined`・`null` の各組について、旧claimのfalseと第3引数付きsource生成の同期 `invalid_input` を確認する。全variant後に共有captureが未呼出しで、同じsessionの `chargePayload('x')` 後に `payload_bytes=1` を確認する。拒否前後のC／G／P全項目、variantごとの会計差分、getter／trapの非実行、cleanup完了は元caseの直接assertionではない。

[現行constructor](../src/review/bounded-source.ts#L58)は `if (creation)` で分岐し、truthyなcreationの `key` を評価してから旧claimに進む。実引数数を照合しないため、以下は**現行sourceの分岐と将来の候補要件の差**であり、実行結果ではない。

| JSで実際に届く形 | 現行sourceの読み取り | C07-Bで候補に要求すること |
|---|---|---|
| 通常2引数／第3引数そのものが明示 `undefined` の3引数 | どちらもcreation分岐なし | 別入力として通常相当を確認。第3引数を省略してから渡すwrapperの成功は、実引数3個の受入証拠にしない。出力宣言は別判定で2引数 |
| 3引数、creation object内の `key` がobject／`undefined`／`null` | objectに入って `key` を読む。旧caseはその後のclaim拒否 | 3 variantそれぞれで、creation中身の読取り・旧claim／callbackへの到達より前に同期 `invalid_input`。入口拒否と旧claimのfalseは別の位置 |
| 第3引数そのものが `null`／`false`／`0`／空文字、又は4引数以上 | falsyな第3値は分岐なし。第4以降は個数の拒否条件にならない | いずれも同期 `invalid_input`。直接のnewと実引数を保った転送を分け、第3・第4が共に `undefined` でも4個ある場合は受理しない |

## 2 通常維持は二つの呼出し経路と同session会計で分ける

- **通常取得と省略時の初期結合は別対照。** [通常adapter](../src/review/update-set-adapter.ts#L90)と[公開helper](../src/review/bounded-source.ts#L262)は2引数。一方、[通常準備の省略側](../src/servicenow/bounded-read.ts#L331)は `#prepareComposition → #openComposition` を通り、[今も実引数3個](../src/servicenow/bounded-read.ts#L366)で、直後に初期source結合・status binding・会計接続が続く。したがってadapterの通常成功やJSの明示undefined受入だけでは、採用記録が求める内部通常呼出しの2引数化と、初期結合・予約返却・固定closeの維持を示せない。旧callbackを渡す専用枝と一括変更してはならない。
- **会計は拒否結果から独立。** [sessionの通常charge](../src/servicenow/bounded-read.ts#L835)はcheck後に同budgetのwriterへ進み、[canonical側](../src/servicenow/review-canonical-budget.ts#L115)でUTF-8長を加える。候補の独立対照では同session・同ownerを保持し、拒否前／拒否直後／正規charge後の順に、拒否の影響と一度の `+1 byte` を分ける。終了・予約返却は別確認。新sessionや計上済みの値のresetでも `payload_bytes=1` は見え得るため、非ゼロ開始の別対照と拒否なしの健全runが必要。これは元ACK-34のassert強化ではない。
- **既存compiled本文の限界。** [compiled-canonical-session](../tests/review/fixtures/compiled-canonical-session.mjs)の通常payload会計と省略時summary、および[FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)の旧prepared／会計は、拒否を挟んだ同session継続を直接確認しない。三つの観測を一つの連続証拠に読み替えない。

## 3 個別票へ渡す不足と次の審査

[既存の固定slot案](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)で、通常準備・通常結合はSL08／09、明示undefinedと宣言はSL10、同期拒否はSL17に対応する。ただしslot名だけでは、ED04の3 creation variant・直接と転送の実引数・同session会計の拒否前後・終了を確認したことにならない。MT11は準備入口の `synthetic_io` 構造対照で、sourceのC07拒否やED04会計の対照ではない。今回はslot、変異、費目、固定入力を追加・承認しない。

**静的に区別できる範囲は整理済みだが、候補での証拠は未取得。** [個別処遇票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)には、元Hの直接assertion、候補の入口と通常側の二つの呼出し、同session会計の独立対照を分けて渡す。旧claim不在だけで元位置のfalseを代替せず、同候補・実解決・終了・許可の根拠が揃うまで回復・非提供の受容に進まない。ED04／ED06の処遇は未承認のまま。静的審査の次点はED05／ACK-35。

旧試験・期待値・注入位置、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、元期限・既定並列度、調査保留・閲覧0・起動0を維持する。変更は本MDのみ。外部照会・外部資料閲覧、実装・故障注入・試験実行・梱包、設定変更・公開・コミット・Pushは行わない。
