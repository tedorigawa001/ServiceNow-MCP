# AP05 G02：ED07／CR04の回復先行案・受入条件

Version: release-ap05-g02-ed07-cr04-recovery-acceptance-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED07の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `06dd76a` は現行文書・source／旧testの読取り用で、製品候補ではない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED07だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)、[NS05のN5-C04](BEST_PRACTICE_RELEASE_AP01_NS05_OBSERVATION_COMPARISON_GUARANTEE_REVIEW.md)、[G01のED07](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)を、[AP02範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)のS02／04／07・通常K02／03と[PK03／FX06の試験分離](BEST_PRACTICE_RELEASE_AP05_PK03_FX06_VERIFICATION_SPLIT_DESIGN.md)に結ぶ。`53eff59` の[C07-B採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md)と[C06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md)は入口・型／import面の仕様根拠で、撤去・個別処遇・実行の許可ではない。正規旧case分類は未対応のまま。

通常経路・旧試験／fixture・期待値・注入位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・変異操作・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 H：旧CR04の同期拒否と3 callbackを元位置で保持する

[元CR04](../tests/review/release-comparison-receipt-session.test.ts)の `does not expose the source observation receiver through a guessed constructor key` は、通常生成した実 `BoundedReadSession` と通常source入力、推測の空object `key` を持つ旧creationを `new BoundedUpdateSetSource` に渡す。`check`／`take` は試験用の関数、`observe` の戻り値は合成の `start` であり、システム時計を採取した値として扱わない。

| 直接assertion | 元の注入位置・判定と限界 |
|---|---|
| 同期 `invalid_input` | 第3引数に旧creationを渡したconstructor呼出しが同期にthrow。元は `.toThrow('invalid_input')` のメッセージ検査で、`code` fieldの厳密比較や後段Promise拒否ではない |
| `capture` 未呼出し | constructorが旧consumerを渡す位置のspyを個別に検査。captureしてから失効した結果を未呼出しとしない |
| `observeReleaseUtc` 未呼出し | 旧観測時刻の供給用spy `observe` を個別に検査。通常の時計・全UTC読取りが0というassertionではない |
| `acceptReleaseObservation` 未呼出し | 旧ack／rows／観測UTCの受領用spy `accept` を個別に検査。後段比較候補やreceiptの状態全体を直接検査したものではない |

[現行source](../src/review/bounded-source.ts)は `#session` を代入してから、truthyなcreationの `key` を使い `claimPrivateCompositionSource` を呼ぶ。[現行session](../src/servicenow/bounded-read.ts)は通常生成したsessionで同private keyを満たさないため拒否し、sourceはcallback採用・captureより前で止まる。これは静的な停止位置。元CR04は3 spy以外の全hook・property参照、無割当て、`requests=0`、`finally` の `session.close()` の完了を直接assertしていない。ED01の直接claim／会計、ED04のkey variant／拒否後会計、ED05／06の別注入は足さない。

Hは元実class・元の第3引数・同じ推測key形状とspy位置を旧revisionで固定し、Pの展開物や別rootに置換しない。[FX06](../tests/review/fixtures/compiled-release-time-handoff.mjs)は旧値handoff・旧合成時刻経路の別対照で、CR04のconstructor拒否と3 callbackを収録した試験ではない。Dのschema拒否・事前に固定したO、近接caseの空200や会計もHの代用にならない。

## 2 P+：通常のrelease観測とPermitを独立に確認する（未実施）

P+とP0は同じ候補の空build・単一tarball由来の、未変更の隔離展開物を使う案。通常moduleを同展開rootから正常に解決・loadし、検査用添付物と配布payloadを分ける。repo `dist`、src／tsx、隣の成果物、開発loaderへのfallbackは不可。通常経路に与えるのは既存のfetch境界を通る合成応答だけで、旧creation、`synthetic_io`、Dの非実行draftや固定Oを供給しない。

| 独立した通常側の正対照 | 将来の受入条件と代用不可 |
|---|---|
| K02／SL09・SL12：観測日時とlegacy判断 | 通常2引数sourceで `readParent` → `resolveRelease()` を呼び、`#observeRelease` 内の通常 `#readReleaseRows`・取得後guard・従来判断を通す。判定には同sessionのpin済みpolicyを使い、そのpinの基準である `startedAt` と開始時点の全 `deadlineMs` を維持する。観測日時が付く分岐は通常clock由来の `observed_at` を確認し、開始UTC・残時間・設定日時・旧upper Oで代用しない。通常観測の日時は既存位置のままとし、新public clock／supplierは足さない |
| K02／SL09：`matched` 後の同Permit | 通常の実測相当の合成行で `matched` を経て、同sourceのPermit・固定release snapshot／portを `releasePortFor` と実 `bindReviewReleaseSource` で同session／owner・現在のreadyに結ぶ。同じPermitで通常の後続metadataを通す。観測結果や `prepared_only` summaryだけ、同値copy、no-op bindは不可。通常Permitは正式発行の許可ではない |
| K03／SL12：通常停止・回収 | 取消／期限とcloseの対照は正常継続から分ける。通常の一次理由、同run ownerの失効、signal・予約返却・固定closeおよび部分生成rollbackの解放責務を確認する。旧時刻slotのclear呼出しがないことを通常stop／close成功の根拠にせず、失効後のPermit継続は許さない |

観測側の期待は通常legacy契約から独立に定める。[通常fallback試験](../tests/review/operator-release-fallback.test.ts)を参照し、非空の観測成功、実測と設定の競合による `unknown`・`release_evidence_conflict`、空／観測不可の既存fallback可否、不完全／上限超過の拒否を別入力とする。`operator_config` の asserted結果は実測ではなく、`observed_at` を持たない分岐へ時刻を追加しない。`unknown`／`mismatched` にPermitを作らず、条件を満たす既存の asserted `matched` を一律に禁止もしない。[通常source結合試験](../tests/review/source-release-binding.test.ts)は実bind・同Permit継続・取消／close後拒否の静的参照であり、候補での実施結果ではない。

## 3 P0：候補の入口拒否・旧到達辺の不在を分ける（未実施）

| 判定対象 | 将来の受入条件 | 不足・不一致とするもの |
|---|---|---|
| C07-B／SL17の旧creation拒否 | 正常loadした候補の通常classに、同候補の通常生成session・正規source入力・3 hook付き旧creationを渡す独立対照。第3引数の内容を読む前に同期 `BoundedReadError`（`code=invalid_input`）。3 callbackは各未呼出し。2引数の成功、JSだけの「第3引数自体が明示 `undefined`」許容、他の第3値／4引数以上は別入力・別判定 | TSだけの拒否、Promise拒否、名前欠落、stub、値の`key`が`undefined`な旧objectを明示 `undefined` と扱うことは不可。候補の拒否位置は旧key照合と同じではない。引数式評価・class field初期化・割当て0は約束しない |
| S02：旧receiverの入口とC06出力 | `CompositionSourceConstruction`・旧第3引数の分岐・`claimPrivateCompositionSource` 側の旧採用辺・3 hookへの接続を、通常sourceとsessionの境界から追う。残すmoduleは通常load成功を先に確認し、対象の旧named／namespace、別名・再export・深い解決／転送、宣言上の2引数と専用型不在を別に判定 | 外部hookの関数が未呼出しでも旧採用辺が残れば不在ではない。型だけ・名前検索だけ・他の依存不全を成功扱いにしない。通常2引数sourceや通常実観測を削除しない |
| S04／07・SL20：旧時刻接続と共有解放 | 旧 `#prepareCompositionIO` の同projection／release ackでの結合、取得後guard後の観測UTC→receipt発行→比較・受理→handoffと、constructor・prepare・stop・`#rollbackConstruction` からの旧専用辺を照合。`#releaseInput*`・`#releaseObservation`・`#releaseComparison*`・`#clearReleaseComparison` 側の残留と、通常側のowner writer・停止／解放の存続を別に判定。JS／宣言／JS map／宣言map（埋込みsource含む）、別名・再export・解決済み動的辺を確認 | 純粋値moduleの同梱自体を旧runtime接続と数えない。未解決動的辺、共有writer／解放の責務先不明、stale出力は合格にしない。旧観測・比較・handoffを実行して不在検査を補わない |

[固定slot／変異manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のMT33〜43は旧時刻辺・私有本体・宣言／mapの残留、MT44／45はSL11の保持する値module／mapの欠落、MT46〜48はSL12の通常stop／close／時刻由来の破れを検出する別対照。PΔはP+／P0成立後、同候補由来の隔離copyごとに一変異だけを指定理由・一次判定で検出し、変異artifactは実行しない。SL17のMT11は禁止own `synthetic_io` 用で、CR04の旧creationと3 hookの独立変異に数えない。ED07固有の追加変異が必要なら、対象・許可差分・理由・終端・費目を別審査する。ここではslot・数値・観測手段を確定しない。

## 4 再審査へ渡す証拠と起動0条件

- Hの元拒否位置と3 spy、P0の候補拒否と旧到達辺、P+の通常観測・通常Permit・停止、PΔの指定理由を別記録にする。候補で旧入口がなくても元のkey照合位置が回復したことにはならない。Hを保持し、同位置の保証が要る場合は回復先を示すまで保留する。NS05の同時刻／receiptおよび旧handoffの未代替保証も埋めない。
- 同source／sessionの観測・receipt ownerは元の拒否と通常観測の境界、session／lifecycle ownerは同Permit・通常停止／回収、配布審査側は旧辺と出力層、旧試験担当はHの証拠を引き受ける。人の担当・期限は未割当。由来・実解決先・段階別pinは[G03](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)、slot／attempt別の終了四軸・未確認時の保全は[G04](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)へ結ぶ。記録は判定ID・到達位置・理由・責務参照に限り、clock／Permit／receiptの実体、認証情報や本文は出さない。
- 通常観測と旧hook、共有writer／解放責務が分離できない、候補pin・前slot終端・cleanup予約・承認が欠ける場合はUnknownとして起動0。試行後の未確認は新規slotを止め、一次理由と未解決責務を承認済みの上位枠へ渡す設計に限る。ED07の処遇・保証低下、AP02実装／friend撤去、候補検証、旧試験切替、公開は別承認。**現時点ではED07未選択・未承認、G02未充足、SL01から起動0。**
