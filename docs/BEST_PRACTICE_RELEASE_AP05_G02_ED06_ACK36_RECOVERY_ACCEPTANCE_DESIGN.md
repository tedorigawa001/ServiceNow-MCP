# AP05 G02：ED06／ACK-36の回復先行案・受入条件

Version: release-ap05-g02-ed06-ack36-recovery-acceptance-draft-0.4 / Date: 2026-11-20。

Status: **設計のみ。ED06の処遇は未選択・未承認。回復は未確認、G02は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 静的照合基準 `99066f7` は文書・現行source／旧testの読取り用で、製品候補ではない。

draft-0.4のレビュー修正：レビュー修正の基準HEADは`ee51ea7`（修正時のHEADは`ee51ea7`）。draft-0.3の修正記録は12本の間の後の文書への参照を1件としていたが、これは`781c9b6`時点の数で、draft-0.2の基準HEAD`41c897a`では確認手順案から段階1〜4への4件を加えた5件だった。draft-0.2の修正記録の括弧書きに4件を補記した。12本の外からの入口がなかったという到達性の結論、§4末尾の参照段落、3対照・固定境界・受渡し欄・停止条件は変更していない。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`24b58e0`（修正時のHEADは`24b58e0`）。draft-0.2の修正記録で12本が「前段の文書だけを参照」としていたが、12本の間には後の文書への参照が1件あったため、「主に前段の文書を参照」に改め、その参照を補記した。12本の外からの入口がなかったという到達性の結論、§4末尾の参照段落、3対照・固定境界・受渡し欄・停止条件は変更していない。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`41c897a`（修正時のHEADは`41c897a`）。本書の後に追加されたED06の後続検討12本（`42d803c`〜`781c9b6`）は主に前段の文書を参照し（12本の間では、限定確認・承認票案draft-0.2から資料候補・閲覧前確認条件への参照と、`41c897a`で加えた閲覧承認前の確認手順案から段階1〜4への参照がある）、本書から後続への参照がなかったため、AP05候補入場設計からたどれなかった。§4の末尾に後続文書への参照を検討順に加えた。3対照・固定境界・受渡し欄・停止条件は変更していない。

[ED01〜07個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED06／ACK-36だけを対象とする。[G02旧assertion・回復条件](BEST_PRACTICE_RELEASE_AP05_G02_OLD_ASSERTION_RECOVERY_DESIGN.md)と[NS02 N2-R11](BEST_PRACTICE_RELEASE_AP01_NS02_ACK_RELEASE_GUARANTEE_REVIEW.md)の元保証を保持し、[G01のED06](BEST_PRACTICE_RELEASE_AP05_G01_ENTRY_EVIDENCE_RECONCILIATION_DESIGN.md)が残すAP02 S03／05／07と通常K02〜04を区別する。回復先行案を審査する条件で、処遇の選択、保証回復の認定、旧試験切替のいずれでもない。

通常経路・旧試験／fixture・期待値・故障位置を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 元試験と現行コードから分かる範囲

- [旧ACK-36](../tests/review/private-composition-ack.test.ts)は旧synthetic transcript（通常の親行とmatchedとなるrelease行）を使い、`BoundedReadSession.prototype.bindReviewReleaseSource` をthrowしないno-opに置換する。直接assertするのは `run()` が返したPromiseの `code: internal_review_error` による拒否。正確な内部拒否箇所、一次理由、bindやI/Oの回数、cleanup完了はこのcaseの直接assertionではない。[既存FX05](../tests/review/fixtures/compiled-private-composition-ack.mjs)は正常prepared側の別対照で、no-op故障は収録していない。
- [通常source](../src/review/bounded-source.ts)は `readParent`／`resolveRelease` のmatched側で、そのsourceのPermit・固定snapshot・portを作り、sessionのbindを呼ぶ。[session](../src/servicenow/bounded-read.ts)は `releasePortFor` で同source／session／Permitからportを取り、登録ownerへ渡す。[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)の `bindSource` は同snapshot／lease・ready・portを条件に登録し、`inspectSource` は登録済みsource／Permit／port／readyと `port.matches()` を再照合する。source内のPermit生成やhook復帰だけでは登録ownerの結合を証明しない。
- **合成と通常で「bind後に何が照合するか」が違う。** 旧bootstrapの `hooks.bind` はこの実classの接続では登録済み結合の検査であり、後から欠けた結合を作る処理ではない。その後に `inspectPrepared` の確認がある（[旧bootstrap](../src/servicenow/review-bootstrap-contract.ts)）。通常側では `#requirePermit` がsessionの結合確認を経てから `listMetadata`／`readPayload`／`verify` の取得に進む。[通常adapter](../src/review/update-set-adapter.ts)の `matched` 分岐も直後に `listMetadata` を通る。no-opで `resolveRelease` がmatchedを返し得ても、それを通常経路の受入成功とはしない。

## 2 独立した3つの対照（実行は未承認）

| 対照 | 対象と差分 | 将来の受入条件 | 不合格・代用不可 |
|---|---|---|---|
| H／旧Promise拒否 | 元の旧revision・元実class／fixtureのACK-36。親／release入力とprototypeのno-op位置を保持。故障なしの旧正常対照は別の実行として参照 | 呼出しが同期throwに変わらず、返ったPromiseが `code: internal_review_error` で拒否。故障なし側のprepared成功と分け、対象と終了を同runに結ぶ。終了の新しい観測を追加するなら元assertionとは別に記録 | 候補のown `synthetic_io` に対する同期 `invalid_input`、直接throw、Dのunknown／withheld、FX05の正常prepared、汎用timeout／依存不備では代替しない |
| P／通常の実bind（正対照） | 隔離した未変更の同候補配布物、通常2引数sourceと同session、承認済みの合成fetchだけ。通常の親→releaseを正常入力で通す | matched後、同source／Permit／port・登録owner／ready・同snapshot／leaseの実結合が成立。既存のreadonly診断・固定snapshotの非同一コピー／不変性を保ち、同Permitで最初の通常metadata取得が進む。通常の予算／予約・停止／close・非露出を弱めない | `matched`、呼出し回数、mock済み `prepared_only`、等しい値／family、公開の成功結果のみでは不可。同一性確認に元Permit／portやleaseを外部へ出さない。readonly診断・通常利用で不足分を観測できなければUnknown |
| P／通常の結合欠失（負対照案） | 正対照と同じ候補pin・入力・通常entryを用いる独立したfresh run。確認対象は「matched素材とsource内Permit／portは正規にできたが、登録ownerの結合だけが書かれない」場合。故障の入れ方・観測点は別承認 | 親／releaseは正規位置まで到達。候補の通常継続（`listMetadata` の最初のpermit／結合guard）で結合欠失を拒否し、取得の副作用へ進まない。結合不成立は元ownerのbinding診断、外側の固定拒否は別欄。既知の親／release費用は保持し、以後のmetadata／payload／verifyのGET・worker dispatchを起動せず、停止／解放は別に確認 | 異なるPermitの偽造・別session混入、故障の直接throw、入口拒否、先行cancel／timeout、検査器の故障や診断先行で作った停止は、この欠失の証拠でない。欠失到達・最初の拒否点が確認できなければUnknown |

[現行source-release-binding試験](../tests/review/source-release-binding.test.ts)は実bind・snapshot・後続metadata、foreign／copy／重複・close後拒否等を別々に検査する。[既存compiled fixture boundary](../tests/review/fixtures/compiled-fixture-boundary.mjs)は通常matched・不変snapshotと偽Permitを確認するが、登録結合だけを欠く同Permitの対照ではない。いずれも候補Pの実行実績ではない。

## 3 通常の結合欠失を判別する固定境界

1. **一差分を先に固定。** 候補のsource／session／adapter、通常entry・依存・同じ合成入力／期限を正負で固定し、負対照で欠くのはownerへの登録結合だけ。source内のPermit／port生成やrelease判定まで止めない。正負は別owner・別runとし、故障の注入方式・対象・復元／終了の責務を個別承認の前に特定する。候補配布物を変更・変異artifactを実行する経路、新friend／公開supplier、通常動作の切替は許可しない。未変更の候補と両立する方法がなければPの負対照は未確認。別の開発成果物はDとして記録し、Pを代替しない。
2. **最初の通常guardを観測。** 負対照で `listMetadata` の呼出し自体を0とはしない。判定点は、通常entryから到達した `#requirePermit` の後段で、同Permitに対するsession／登録ownerの照合が欠失を検出し、取得前に止まること。前もって `reviewReleaseStatus` 等を呼ぶと照合自身が拒否・停止させ得るため、先に呼んで結果を作らない。固定の観測方法により、故障到達、取得未到達、一次理由と停止結果を区別する。現行sourceではowner内の `evidence_binding_mismatch`（binding）と固定外向きの `internal_review_error` は別層で、通常adapterから見る場合は `metadata` の段が照合先。候補の経路・公開写像は別途照合し、旧HのPromise拒否の型をPのadapter結果へそのまま要求しない。
3. **無効化と終了は別証拠。** 拒否後に同Permitから再利用・dispatchへ進まないことと、同runの先行理由・会計・予約／停止／closeの保持を分けて確認する。親／releaseの既消費を0にせず、後続取得0を全I/Oゼロ、固定拒否をcleanup完了としない。適用する終了四軸、post-pin、残存責務、未確認時の保全は[G04の条件](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)に従う。観測／終了の不足は次slot起動0、遅着で判定を戻さない。

## 4 再審査に渡す記録と停止条件

| 受渡し欄 | 必要な証拠と責務 |
|---|---|
| 元保証と互換差 | Hの元case／入力／注入位置／Promise拒否、Pの通常実bind／欠失対照、案Pの入口同期拒否を別々に記録。[AP04の結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)に照らし、旧結果と非同等の範囲を残す |
| 同一性・観測・終了 | [G03の同候補pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)に結んだ各artifact／entry／依存／固定入力、故障位置と単独差分、前後照合、結合・一次理由・取得／dispatch・停止・終了の別記録。候補ID・digest、観測の方法と数値、保全方式・保全先は記入しない |
| 責務先と承認 | session／source／Permit／port・登録ready ownerは通常Kと欠失時停止、AP05旧fixture担当はHの故障条件・期待値、AP04側は結果差、AP01側は個別処遇の再審査。人の担当・期限は未割当。ED06個別処遇、AP02実装、候補検証、旧試験切替は別の承認記録 |

3対照の必要証拠が揃って初めて回復先行案を再審査できる。Hの保持はPで旧synthetic返却を提供する意味ではなく、Pの両対照だけでもHの保証を代替しない。いずれかが欠ける、通常K・共有責務が不明、または候補での実施方法が未承認なら、旧試験と通常経路を保持し、**ED06は未選択・未承認、G02は未充足、SL01は起動0**のままとする。

本書の後の検討は、[未変更候補の実bind・登録結合欠失の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)→[登録結合欠失の既存境界・観測非介在の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_BIND_BOUNDARY_STATIC_REVIEW_DESIGN.md)→[欠失対照が見つからない場合の処遇審査条件](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NO_CONTROL_DISPOSITION_REVIEW_DESIGN.md)→[非提供審査前の経路分離・旧Promise影響の静的照合](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_NON_PROVISION_BOUNDARY_REVIEW_DESIGN.md)→[旧Promise利用影響の確認範囲・外部説明案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_PROMISE_IMPACT_NOTICE_DESIGN.md)→[外部利用影響の限定確認・個別承認票案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_EXTERNAL_USAGE_LIMITED_REVIEW_APPROVAL_DESIGN.md)→[資料候補・閲覧前確認条件](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_EXTERNAL_USAGE_MATERIAL_PRECHECK_DESIGN.md)→[閲覧承認前の不足証拠・確認順序](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_EXTERNAL_USAGE_PREAPPROVAL_EVIDENCE_CHECKLIST.md)の順に続き、段階1〜4の様式は最後の手順案から参照する。いずれも設計・様式案で、ED06の処遇の選択、回復の認定、閲覧・外部利用の承認ではなく、本節の停止条件を変更しない。
