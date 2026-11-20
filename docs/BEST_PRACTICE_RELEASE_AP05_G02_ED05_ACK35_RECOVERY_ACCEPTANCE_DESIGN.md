# AP05 G02：ED05／ACK-35の回復先行案・受入条件

Version: release-ap05-g02-ed05-ack35-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED05の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `8c1d7ca` は文書・現行source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED05／ACK-35だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)と[NS02 N2-X08](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)の元保証を保持し、[G01のED05](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)と[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS02・通常K02／04に結ぶ。`53eff59` の[C07-B採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)と[C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は入口仕様の根拠で、撤去・個別処遇・実行の許可ではない。正規旧case分類は未対応のまま。

通常経路・旧試験／fixture・期待値・故障位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 旧ACK-35と、候補で別に確認する境界

[元ACK-35](../tests/review/private-composition-ack.test.ts)は `BoundedReadSession` のclass staticに常に `true` を返す `claimCompositionSource` を**試験から設置**し、通常生成したsessionに旧creation objectを渡す。直接観測は、source生成が同期に `invalid_input` を含むerrorをthrowすることと、captureが呼ばれないこと。設置した関数の呼出し回数、その戻り値を利用したかの内部観測、他callback・全状態の不変、cleanup完了は直接assertしていない。元testは `finally` でsessionをcloseし、設置名を削除するが、後始末を別に証明したわけではない。

`claimCompositionSource` はこのtestが置く名前で、現行製品のverifier APIとは数えない。[現行source](../src/review/bounded-source.ts)はtruthyなcreationの`key`を読み、別名の実関数 `claimPrivateCompositionSource` を[現行session](../src/servicenow/bounded-read.ts)から呼び、falseならcaptureより前に止まる。これは静的な実行経路の説明。元testの2点だけから任意のstatic／prototypeの非介在や候補での不在を証明しない。ED04の3 key variant／後続会計と、ED06の後段bindのno-op／Promise拒否も、ED05の観測へ加えない。

## 2 三つの独立した対照（未実施）

| 対照 | 対象・固定点 | 将来の受入条件 | 代用不可・停止条件 |
|---|---|---|---|
| H／成功staticを置いた旧creation拒否 | 元revision・元実classのACK-35。classに成功関数を設置し、元creationと同じ既存sessionを使う。候補Pとは実行元・fixture・結果を分ける | 元の注入位置に結び、同期 `invalid_input` を含むthrowとcapture未呼出しを確認する。外部の成功値でsourceが採用されないことをこの範囲で記録し、設置・close・除去の確認は別欄 | 入口が存在しないP、型エラー、直接throwする試験stub、正常preparedの[FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)では代用しない。verifier呼出し0を元assertionとして追加しない |
| P+／通常の同owner実照合 | 未変更の同候補配布物、固定の通常entry・合成入力。K04の省略時の初期結合と、K02の通常matched後のPermit結合を**別run**で確認する。Hのstatic設置を持ち込まない | K04は同session／snapshot／core／lease／ownerとそのsourceへの初期結合・会計接続を保ち、通常同期summary、予約返却・固定close。K02は通常2引数sourceから同source／Permit／port・owner／readyの照合、実際に同Permitで正規の後続操作。K04はdispatch unavailableを維持し、K02の正規の取得を止めない。どちらも正式発行・本文非露出の既存境界を弱めない | 成功値、summary上の `bound`、同値copy、別rootでの結合成功だけでは不可。通常の観測範囲で実参照の結合が確認できなければUnknown。確認のため新friend／公開getterを足さない |
| P0とPΔ／旧入口の再露出検査 | P0はP+と同じ未変更の展開payload。PΔはP+／P0成立後にだけ、固定manifestが承認された一変異ごとの別copyで検査器の感度を確認する案 | 通常moduleの正常loadと通常経路を正対照に、S02の外部採用辺、別名・再export、専用宣言・stale出力がないことを判定。再露出対照は構造で指定箇所・判定・理由の一致を確認し、変異artifactを実行しない | Hの試験用staticの設置を製品の再露出に数えない。名前検索のみ、依存欠落、一般起動不能・別理由では不在や検出成功としない。未解決の動的辺はUnknown |

## 3 通常経路と再露出の受入境界

1. **初期結合と後段bindを混ぜない。** 現行の省略経路は `#openComposition` で作ったsourceを、同じhandle／snapshot／leaseの `bindInitialSource` → `claimStatusBinding` → 同core会計の接続へ渡す。[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)は同sourceと初期stateを照合し、後段の `bindSource` は通常matchedで作られた実Permit／portとreadyを別に照合する。候補の通常内部呼出しはC07-Bどおり2引数へ揃える条件で、現行の共有呼出しで第3に変数を渡す事実を実施済みに読み替えない。省略時はready前・C/G/P=0の観測で、後段Permitが既にあるとは扱わない。[現行compiled通常準備](../tests/review/fixtures/compiled-canonical-session.mjs)と[通常source結合試験](../tests/review/source-release-binding.test.ts)は各境界の静的な参照のみ。
2. **再露出は定義・登録・到達を分ける。** 観測対象は、テストが設置する `claimCompositionSource` の文字列そのものではなく、候補で外部の成功値が採用に使われる経路。class static／prototype・moduleの旧named／namespace・残留する `claimPrivateCompositionSource`／`sourceConstructionClaim` とその登録・旧creation／capture側の呼出しをそれぞれ照合する。別名、shim、再export、解決済み動的辺、JS／宣言／両mapは別欄とし、試験時添付と配布payloadを混ぜない。廃止対象が確定した専用moduleのdeep解決は、残る通常moduleの旧名不在とは別である。
3. **検査器の感度と元保証の再現を分ける。** [固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL08／09の通常正対照とSL17等の入口確認は参照先。ED05固有の旧claim／verifier再露出を検出する変異行・指定判定・期待理由はまだ固定しておらず、既存MTで検査済みとはしない。別審査に回す場合は対象・許可差分・判定／理由・独立終端を一変異ごとに固定し、所定位置で検出する構造対照に限る。これはHの成功static注入をPで再現する許可ではない。

## 4 再審査に渡す証拠と停止条件

- **証拠を3区分で保持する。** Hの注入位置と同期拒否／capture、Pの同owner初期結合／通常Permitの正対照、Pの旧入口不在／構造対照を別記録にする。各artifact・entry・依存と期間を[G03の段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)へ、停止・post-pin・終了四軸と未確認責務を[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)へ結ぶ。保証回復はPの不在やDの結果で代用しない。
- **責務先と許可を分ける。** source／session・登録ownerは通常Kと外部成功値の非採用、配布審査側はS02／C06の出力と再露出検査、AP05旧試験担当は元注入と期待値の保持。人の担当・期限は未割当。ED05の個別処遇、AP02実装、候補検証、旧試験切替は別の承認記録とし、候補revision・digest、観測手段／数値／保全方式・保全先をここでは決めない。
- 3区分のいずれかが欠ける、通常Kと共有責務が分離できない、または実施方法が未承認なら、元保証を回復済みにせず審査保留。**ED05の処遇は未選択・未承認、G02は未充足、SL01は起動0**のままとする。
