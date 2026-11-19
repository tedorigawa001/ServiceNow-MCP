# AP05 G01：ED01〜07の候補仕様根拠・到達辺照合表

Version: release-ap05-g01-entry-evidence-reconciliation-draft-0.1 / Date: 2026-11-20。

Status: **静的照合のみ。G01は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** 読取り基準 `16e7148` はコミット済み資料と現行source／旧testの照合用であり、製品候補ではない。

[AP05候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のAP5-G01を、[入口7件の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)のED01〜07と[AP02撤去範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)の撤去S／維持Kに結ぶ。ED番号は既存IDの参照で、新しい承認・旧case処遇ではない。入口7件の正規分類はすべて未対応のまま。[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の保証低下受容・個別処遇、旧試験の削除・skip・期待値変更、friend撤去・設定変更・公開は今回未承認。

先行AP03の未コミット差分5ファイルを維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・コミット・Pushは行わない。

## 1 根拠の所在：コミット済みと未コミットを混ぜない

| 資料 | `16e7148` に含まれる根拠 | 作業中のAP03記録と今回の扱い |
|---|---|---|
| 入口引渡し | draft-0.2。ED01〜07の元assertion・影響・処遇案。判断材料であり、候補証拠ではない | draft-0.6の採用記述と参照更新は未コミット。元7件の対応は維持され、候補patch・実施結果・個別処遇の承認は未記入 |
| [AP02／03親設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md) | draft-0.3。撤去R01〜08・維持K01〜06と比較案。D03／D04の方針採用を含む版ではない | 作業中の版は方針採用を反映。外部利用・同候補での実際の到達辺・保証の扱いは未確認で、採用を撤去許可とみなさない |
| [C07比較設計](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md) | draft-0.1。第3引数を巡る比較とC07-V1〜4。選択は未承認の記録 | 作業中の版はBの採用先を参照。比較表と採用決定の所在を区別する |
| [C05／C07採用記録](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md) | 当該採用記録ファイルは含まれない | 未追跡のdraft-0.4。C05-B＝外側Proxyを反射前に拒否し、非Proxyは許可されたown dataのみ。C07-B＝宣言2引数、JSの第3引数は明示undefinedを1個だけ許容。他の第3値・4個以上は同期 `invalid_input`。承認は入力方針に限る |
| [C02〜04／06採用記録](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md) | 当該採用記録ファイルは含まれない | 未追跡のdraft-0.2。案Pは非Proxyのown `synthetic_io` の存在を値・列挙性に依存せず副作用前に同期拒否。C06は専用宣言、残るmoduleでの旧named／namespace、廃止専用moduleのdeep解決を分ける方針。撤去対象の確定・実装は別判断 |

別に、コミット済みのAP02撤去範囲基準draft-0.2はS01〜07／K01〜04の**設計基準**。S02のC07-BとS03の案Pを記載するが、採用記録は未コミットと明記しており、これらの行だけを採用の証拠にできない。以下のK番号はAP02範囲基準のKで、親設計側の番号とは区別する。

## 2 ED01〜07：旧証拠・採用方針・切る辺・残す辺

「撤去候補」は候補で切ることを審査する辺であり、現行から消えた意味ではない。「未確認」は棚卸し・候補固有の証拠がまだ必要な範囲で、不在とは判定しない。

| ED／旧case | コミット済み根拠（元testの直接assertion） | 未コミット採用記録との対応 | 撤去候補の経路 | 残す通常経路 | 未確認の到達辺・候補仕様に使う前の不足 |
|---|---|---|---|---|---|
| ED01／SA-25 | [元SA](../tests/review/source-status-binding.test.ts)：通常生成sessionへの推測object keyでclaim=false、第3引数付きsource生成が同期 `invalid_input` を含むthrow、capture未呼出し、requests=0 | C07-Bの旧creation object拒否と、C06のclaim export・専用型の扱いを分離。`takeStatus` 自体の呼出し数は元assertionにない | S02：`bounded-source` の第3引数creation分岐、`claimPrivateCompositionSource` → `sourceConstructionClaim`／static登録、外部take／status／capture経路 | K02／04：通常2引数source、同rootの初期source結合・通常status binding／同core会計、後段の通常Permitを残す | 宣言・JS・転送呼出し・別名／再export・深いimportからの旧claim到達を同候補で確認。JS明示undefinedと旧object拒否の境界、通常経路の正対照が不足。requests=0だけで資源未生成とはしない |
| ED02／SA-26 | [元SA](../tests/review/source-status-binding.test.ts)：wrapper静的import後、class own `probeNewStatusAcceptance` なし、`takeStatusAcceptanceProbe()` が同期 `internal_review_error` を含むthrow。最初の取得はこのcaseの直接assertionではない | C06。旧再取得throwと、候補の旧named link失敗・namespace own名不在は別 | S01／06：SAの取得export → `statusProbe`／static登録 → `#runStatusAcceptanceProbe`／専用 `pinStatusProbeFake`、SA wrapperの評価時取得と旧probeへの辺 | K01／04：通常constructor・通常factory・close、lifecycleの通常 `claimStatusBinding` は維持。H側にSA wrapper／旧試験を残す | 残る `bounded-read` の正常load、namedとnamespaceの区別、廃止wrapperのdeep解決、別名／動的辺、JS・宣言・map、休眠登録／runner残留を候補で別々に確認。FX04／PK02の旧対照だけでは、本番側の不在にならない |
| ED03／ND-30 | [元ND](../tests/review/native-session-composition.test.ts)：wrapper静的import後、class own `probeNativeStatusComposition` なし、`takeNativeStatusCompositionProbe()` が同期 `internal_review_error` を含むthrow | C06。SAと別のnamed／namespace／deep境界。旧再取得拒否を候補不在と同一視しない | S01／06：NDの取得export → `nativeStatusProbe`／static登録 → `#runNativeStatusProbe`／専用driver、ND旧rootの評価時取得と旧probeへの辺 | K01／04：通常constructor／close・通常lifecycle結合。純粋診断・無bridge・resource所有の責務はB-03で別扱い、Hの旧試験を維持 | SA側の結果ではND側を確定できない。ND由来の別名／型辺、driverと共有診断の分離、`#probeStatusAcceptance` の旧SA／ND双方の呼出し残り、外部利用は未確認。候補の不在・FX03の旧保証・Dの連続試験は別証拠。UN62は別gate |
| ED04／ACK-34 | [元ACK](../tests/review/private-composition-ack.test.ts)：creation内keyのobject／undefined／null各variantでclaim=falseと同期 `invalid_input`、captureは全variant後に未呼出し、同sessionの `chargePayload('x')` 後に1 | C07-B。**creation内のkeyがundefined** と **第3引数そのものが明示undefined** を分離。C06は旧claim公開面の扱い | S02：外部creation objectによるconsumer／captureの採用経路。通常sessionへの会計経路とは分離 | K01／02／04：同sessionの単一会計・通常source／Permit、拒否後の既存session利用と固定close | wrapper／引数転送からの実JS、型だけが消えて実行辺が残る場合、拒否位置と同sessionの後続会計の正対照が未確認。旧assertionのpayload=1を全状態不変へ広げない |
| ED05／ACK-35 | [元ACK](../tests/review/private-composition-ack.test.ts)：テストがclassに成功を返す `claimCompositionSource` を設置し、creation付きsourceが同期 `invalid_input`、capture未呼出し。設置関数の呼出し数は直接assertしていない | C07-Bの旧creation拒否、C06の公開claim／専用型。旧hookを信頼しない保証と候補で旧入口がないことは別 | S02：外部creation branch／claimと、置換可能な公開verifierを採用経路にしない。テストが設置する名前を現行の製品定義とは数えない | K02／04：固定root内の初期source／ownerの実照合、通常Permit結合。公開verifierや新friendで代用しない | static／prototype／別名の再露出、通常root内部の同一性照合、正規private経路が承認された呼出し元からだけ到達することの証拠が不足。旧hook注入試験とPでの再露出対照を分ける |
| ED06／ACK-36 | [元ACK](../tests/review/private-composition-ack.test.ts)：`bindReviewReleaseSource` をno-opに置換したsynthetic runのPromiseが `internal_review_error` で拒否。FX05に同じ故障があるとはみなさない | C02〜04案Pなら禁止own `synthetic_io` は外側で同期拒否。C05-Bの通常options／Proxy境界とC06のsynthetic overload・専用型を別確認。元Promise拒否の回復ではない | S03／05／07（R04／07）：synthetic prepareのoverload・`PreparedSummary`・fake I/O／ack／capture・旧fake継続。共有の `bindReviewReleaseSource` 自体は撤去しない | K02／03／04：matched後の同source／Permit／port／登録owner・readyの実結合、通常の省略時同期summary／同core／予約返却・停止／close | fakeと通常のbind到達辺、生成／rollback／stopの共有参照、fake同梱JS／宣言／map・外部Promise呼出しの影響が未確認。通常の実bindingと成功風hookだけでは通らない証拠、元faultの残差・AP04判断が別途必要 |
| ED07／CR04 | [元CR](../tests/review/release-comparison-receipt-session.test.ts)：推測key付きsourceが同期 `invalid_input`、capture／`observeReleaseUtc`／`acceptReleaseObservation` は全て未呼出し | C07-Bの旧creation拒否とC06の専用宣言の扱い。通常の実観測・release判断まで止める仕様ではない | S02／04／07：外部観測receiver／callbackの採用、旧fake専用projection・比較／handoffに向かう辺を共有経路から分離 | K02／03：通常 `#observeRelease`、既存の観測日時・pin済みpolicy・legacy release判断、同owner／Permitと通常stop／close | 通常読取／観測とsynthetic注入の境界、prepare／stop／rollbackの旧時刻参照と共有writer、専用型・動的辺・stale出力は未確認。通常の実観測と旧callback非実行は別証拠。Dのschema拒否で元field／時計位置を代替しない |

source上の照合起点は[session](../src/servicenow/bounded-read.ts)、[source constructor／通常release](../src/review/bounded-source.ts)、[SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts)、[ND旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)。名前の存在・静的参照は現行の証拠。候補での不在／通常到達や、外部の実利用を証明しない。

## 3 G01に渡す条件と起動0

1. **採用根拠を別途確定する。** EDごとに、元case、適用するC方針、承認記録・範囲・除外事項、S／Kと責務先を同一の審査記録に並べる。作業中のAP03記録をHEADに足してコミット済みの根拠と呼ばない。今回の照合は、先行5ファイルの確定・コミットの許可ではない。
2. **切る側と残す側の到達辺を対にする。** 定義・登録／取得・呼出し・停止／解放・型／再export／動的解決・JS／宣言／両mapを行別に記録し、共有先のownerと残す理由を明示する。旧試験が参照するH側、候補配布物P、開発Dを区別。外部利用、未解決の動的辺、共有writer／解放責務が不明なら、Unknownのまま対応する行を保留する。
3. **必要証拠がなければ起動0。** 採用記録・適用範囲・通常経路／責務が同じ審査基準に揃わない間はG01未充足。候補patchが未確定で、AP02撤去の到達閉包も未証明。G02の旧保証処遇と実行許可、G03の段階別pin、G04の終了確認・予約はそれぞれ別gate。AP05で取得予定の配布物の証拠を先取りせず、未生成のtarball digestをG01の前提にもしない。
