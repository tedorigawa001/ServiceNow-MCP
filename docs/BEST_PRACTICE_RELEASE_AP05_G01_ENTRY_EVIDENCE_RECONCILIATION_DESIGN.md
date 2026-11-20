# AP05 G01：ED01〜07の候補仕様根拠・到達辺照合表

Version: release-ap05-g01-entry-evidence-reconciliation-draft-0.3 / Date: 2026-11-20。
Status: **AP03の採用方針の文書根拠を `53eff59` に固定。候補での到達辺・通常経路の維持は未確認。G01は未充足、SL01は起動0。候補revision・digestは未確定。数値・観測手段・保全方式・保全先は未承認。** `53eff59` は採用根拠の文書コミットであり、製品候補ではない。

draft-0.3では、[確定前レビュー draft-0.1](BEST_PRACTICE_RELEASE_AP05_G01_AP03_ADOPTION_PRECONFIRMATION_REVIEW.md)が指摘した参照版の差を `53eff59` で再照合し、採用記録2文書へのリンクを復帰した。採用内容・適用範囲と、ED各行の旧assertion・正規分類は変更しない。確定前レビューは当時の記録として残す。

draft-0.2のレビュー修正：レビュー修正の基準HEADは`7162f0c`（修正時のHEADは`7162f0c`）。§1のC05／C07採用記録とC02〜04／06採用記録は未追跡ファイルで、HEADではリンクが切れるため、ファイル名のコード表記に改めた（コミット後にリンクへ戻す）。§1表の入口引渡し行を他行と同じくリンクにした。§4に静的確認を追加し、候補入場設計draft-0.3から本書への参照を加えた。各ED行・判定は変更していない。

[AP05候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のAP5-G01を、[入口7件の引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)のED01〜07と[AP02撤去範囲基準](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)の撤去S／維持Kに結ぶ。ED番号は既存IDの参照で、新しい承認・旧case処遇ではない。入口7件の正規分類はすべて未対応のまま。[AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)の保証低下受容・個別処遇、旧試験の削除・skip・期待値変更、friend撤去・設定変更・公開は今回未承認。

`53eff59` の先行AP03の5文書には手を加えない。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・実接続・実通信・設定変更・コミット・Pushは行わない。

## 1 `53eff59` で固定した採用根拠と適用範囲

| 資料 | `16e7148` 時点の履歴 | `53eff59` で確認した根拠・範囲 |
|---|---|---|
| [入口引渡し](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md) | draft-0.2。ED01〜07の元assertion・影響・処遇案 | draft-0.6。対象EDと両採用記録を対応付ける参照元。元7件の対応は維持され、候補patch・実施結果・個別処遇の承認は未記入 |
| [AP02／03親設計](BEST_PRACTICE_RELEASE_AP02_AP03_REMOVAL_COMPATIBILITY_DESIGN.md) | draft-0.3。撤去R01〜08・維持K01〜06と比較案 | draft-0.8。D03／D04・C06の方針のみ反映。外部利用・候補での到達辺・旧保証の扱いは未確認。採用を撤去許可とみなさない |
| [C07比較設計](BEST_PRACTICE_RELEASE_AP03_C07_SOURCE_CONSTRUCTOR_ARGUMENT_DESIGN.md) | draft-0.1。第3引数の比較とC07-V1〜4。比較時点では未選択 | draft-0.2。Bの採用先と将来の照合条件を記載。比較表と採用決定の所在を区別する |
| [C05／C07採用記録 draft-0.4](BEST_PRACTICE_RELEASE_AP03_C05_C07_COMPATIBILITY_DECISION_DESIGN.md) | 採用記録ファイルなし | §5・D04が主根拠。C05-B＝最上位optionsのProxyを反射前に同期拒否し、非Proxyの許可own値を維持、継承値は読まない。C07-B＝宣言2引数、JSの第3引数は明示undefinedを1個だけ許容。他の第3値・4個以上は同期 `invalid_input`。入力方針に限る |
| [C02〜04／06採用記録 draft-0.2](BEST_PRACTICE_RELEASE_AP03_C02_C04_C06_COMPATIBILITY_REVIEW.md) | 採用記録ファイルなし | §5・D03／C06が主根拠。案PはC05-BのProxy確認に続き、非Proxyの禁止own `synthetic_io` を値・列挙性によらずsignal値・snapshot・target・provider／生成より前に同期 `invalid_input`。旧prepared／後段の拒否Promiseは返さない。C06は専用宣言、残るmoduleでの旧named／namespace、廃止が決まった専用moduleのdeep解決を分ける方針。具体名・撤去・実装は別判断 |

参照元3文書のC05／C07採用記録への版ラベルは計4箇所ともdraft-0.4。先行のAP02撤去範囲基準draft-0.2にある「採用記録は未コミット」は同書の読取り基準 `2837181` 時点の記述。同書のS01〜07／K01〜04は引き続き**範囲の設計基準**であり、採用判断自体の根拠は `53eff59` の上記主記録に置く。以下のK番号はAP02範囲基準のKで、親設計側の番号とは区別する。

## 2 ED01〜07：旧証拠・採用方針・切る辺・残す辺

「撤去候補」は候補で切ることを審査する辺であり、現行から消えた意味ではない。「未確認」は棚卸し・候補固有の証拠がまだ必要な範囲で、不在とは判定しない。

| ED／旧case | 旧testの直接assertion | `53eff59` の採用方針との対応 | 撤去候補の経路 | 残す通常経路 | 未確認の到達辺・起動0の条件 |
|---|---|---|---|---|---|
| ED01／SA-25 | [元SA](../tests/review/source-status-binding.test.ts)：通常生成sessionへの推測object keyでclaim=false、第3引数付きsource生成が同期 `invalid_input` を含むthrow、capture未呼出し、requests=0 | C07-Bの旧creation object拒否と、C06のclaim export・専用型の扱いを分離。`takeStatus` 自体の呼出し数は元assertionにない | S02：`bounded-source` の第3引数creation分岐、`claimPrivateCompositionSource` → `sourceConstructionClaim`／static登録、外部take／status／capture経路 | K02／04：通常2引数source、同rootの初期source結合・通常status binding／同core会計、後段の通常Permitを残す | 宣言・JS・転送呼出し・別名／再export・深いimportからの旧claim到達を同候補で確認。JS明示undefinedと旧object拒否の境界、通常経路の正対照が不足。requests=0だけで資源未生成とはしない旧claimの切断範囲と通常source結合の維持根拠が不明なら起動0。 |
| ED02／SA-26 | [元SA](../tests/review/source-status-binding.test.ts)：wrapper静的import後、class own `probeNewStatusAcceptance` なし、`takeStatusAcceptanceProbe()` が同期 `internal_review_error` を含むthrow。最初の取得はこのcaseの直接assertionではない | C06。旧再取得throwと、候補の旧named link失敗・namespace own名不在は別 | S01／06：SAの取得export → `statusProbe`／static登録 → `#runStatusAcceptanceProbe`／専用 `pinStatusProbeFake`、SA wrapperの評価時取得と旧probeへの辺 | K01／04：通常constructor・通常factory・close、lifecycleの通常 `claimStatusBinding` は維持。H側にSA wrapper／旧試験を残す | 残る `bounded-read` の正常load、namedとnamespaceの区別、廃止wrapperのdeep解決、別名／動的辺、JS・宣言・map、休眠登録／runner残留を候補で別々に確認。FX04／PK02の旧対照だけでは、本番側の不在にならないSAの専用辺と通常lifecycleを分離できる根拠がなければ起動0。 |
| ED03／ND-30 | [元ND](../tests/review/native-session-composition.test.ts)：wrapper静的import後、class own `probeNativeStatusComposition` なし、`takeNativeStatusCompositionProbe()` が同期 `internal_review_error` を含むthrow | C06。SAと別のnamed／namespace／deep境界。旧再取得拒否を候補不在と同一視しない | S01／06：NDの取得export → `nativeStatusProbe`／static登録 → `#runNativeStatusProbe`／専用driver、ND旧rootの評価時取得と旧probeへの辺 | K01／04：通常constructor／close・通常lifecycle結合。純粋診断・無bridge・resource所有の責務はB-03で別扱い、Hの旧試験を維持 | SA側の結果ではND側を確定できない。ND由来の別名／型辺、driverと共有診断の分離、`#probeStatusAcceptance` の旧SA／ND双方の呼出し残り、外部利用は未確認。候補の不在・FX03の旧保証・Dの連続試験は別証拠。UN62は別gateND固有の閉包と共有診断の責務を区別できなければ起動0。 |
| ED04／ACK-34 | [元ACK](../tests/review/private-composition-ack.test.ts)：creation内keyのobject／undefined／null各variantでclaim=falseと同期 `invalid_input`、captureは全variant後に未呼出し、同sessionの `chargePayload('x')` 後に1 | C07-B。**creation内のkeyがundefined** と **第3引数そのものが明示undefined** を分離。C06は旧claim公開面の扱い | S02：外部creation objectによるconsumer／captureの採用経路。通常sessionへの会計経路とは分離 | K01／02／04：同sessionの単一会計・通常source／Permit、拒否後の既存session利用と固定close | wrapper／引数転送からの実JS、型だけが消えて実行辺が残る場合、拒否位置と同sessionの後続会計の正対照が未確認。旧assertionのpayload=1を全状態不変へ広げない旧creationと許容undefinedの識別、同session会計維持の根拠が欠ければ起動0。 |
| ED05／ACK-35 | [元ACK](../tests/review/private-composition-ack.test.ts)：テストがclassに成功を返す `claimCompositionSource` を設置し、creation付きsourceが同期 `invalid_input`、capture未呼出し。設置関数の呼出し数は直接assertしていない | C07-Bの旧creation拒否、C06の公開claim／専用型。旧hookを信頼しない保証と候補で旧入口がないことは別 | S02：外部creation branch／claimと、置換可能な公開verifierを採用経路にしない。テストが設置する名前を現行の製品定義とは数えない | K02／04：固定root内の初期source／ownerの実照合、通常Permit結合。公開verifierや新friendで代用しない | static／prototype／別名の再露出、通常root内部の同一性照合、正規private経路が承認された呼出し元からだけ到達することの証拠が不足。旧hook注入試験とPでの再露出対照を分ける外部verifier非採用と通常の実照合を区別できなければ起動0。 |
| ED06／ACK-36 | [元ACK](../tests/review/private-composition-ack.test.ts)：`bindReviewReleaseSource` をno-opに置換したsynthetic runのPromiseが `internal_review_error` で拒否。FX05に同じ故障があるとはみなさない | C02〜04案Pは、禁止own `synthetic_io` は外側で同期拒否。C05-Bの通常options／Proxy境界とC06のsynthetic overload・専用型を別確認。元Promise拒否の回復ではない | S03／05／07（R04／07）：synthetic prepareのoverload・`PreparedSummary`・fake I/O／ack／capture・旧fake継続。共有の `bindReviewReleaseSource` 自体は撤去しない | K02／03／04：matched後の同source／Permit／port／登録owner・readyの実結合、通常の省略時同期summary／同core／予約返却・停止／close | fakeと通常のbind到達辺、生成／rollback／stopの共有参照、fake同梱JS／宣言／map・外部Promise呼出しの影響が未確認。通常の実bindingと成功風hookだけでは通らない証拠、元faultの残差・AP04判断が別途必要旧fake継続と通常bind／停止／解放の境界が不明なら起動0。 |
| ED07／CR04 | [元CR](../tests/review/release-comparison-receipt-session.test.ts)：推測key付きsourceが同期 `invalid_input`、capture／`observeReleaseUtc`／`acceptReleaseObservation` は全て未呼出し | C07-Bの旧creation拒否とC06の専用宣言の扱い。通常の実観測・release判断まで止める仕様ではない | S02／04／07：外部観測receiver／callbackの採用、旧fake専用projection・比較／handoffに向かう辺を共有経路から分離 | K02／03：通常 `#observeRelease`、既存の観測日時・pin済みpolicy・legacy release判断、同owner／Permitと通常stop／close | 通常読取／観測とsynthetic注入の境界、prepare／stop／rollbackの旧時刻参照と共有writer、専用型・動的辺・stale出力は未確認。通常の実観測と旧callback非実行は別証拠。Dのschema拒否で元field／時計位置を代替しない旧観測hookの分離と通常観測／解放の責務が不明なら起動0。 |

source上の照合起点は[session](../src/servicenow/bounded-read.ts)、[source constructor／通常release](../src/review/bounded-source.ts)、[SA wrapper](../src/review/abort-scope-evidence-source-status-probe.ts)、[ND旧root](../src/review/abort-scope-evidence-native-diagnostic.ts)。名前の存在・静的参照は現行の証拠。候補での不在／通常到達や、外部の実利用を証明しない。

## 3 G01に渡す条件と起動0

1. **採用方針の文書根拠は確定。** `53eff59` の5文書と参照ラベルを照合し、§1の2つの主記録をED各行の適用根拠とする。確定したのはC05-B／C07-B、C02〜04案P、C06の方針とその適用範囲に限る。AP02実装・friend撤去・旧保証の処遇・候補検証・公開は承認しない。
2. **切る側と残す側の到達辺を対にする。** 定義・登録／取得・呼出し・停止／解放・型／再export／動的解決・JS／宣言／両mapを行別に記録し、共有先のownerと残す理由を明示する。旧試験が参照するH側、候補配布物P、開発Dを区別。外部利用、未解決の動的辺、共有writer／解放責務が不明なら、Unknownのまま対応する行を保留する。
3. **G01は未充足、SL01は起動0。** ED各行の未確認事項が切る／残す境界や共有責務にかかわる場合、候補patchへの対応と必要な根拠が揃うまで起動しない。候補patchは未確定で、AP02撤去の到達閉包と通常経路の維持は未証明。G02の旧保証処遇と実行許可、G03の段階別pin、G04の終了確認・予約は別gate。ここで先に必要なのは変更範囲と通常ownerを説明できる根拠であり、AP05実行後にしか得られない配布物の出力・digest・実行結果をG01の前提にはしない。それらを確認済みとも扱わない。

## 4 静的確認

draft-0.3では `53eff59` の変更対象が採用記録2文書・参照元3文書だけであること、両主記録の採用節と限定範囲、参照ラベル4箇所がdraft-0.4で揃うことを照合した。ED01〜07の元assertion・撤去候補・維持Kはdraft-0.2と同じ。各行の未確認事項と起動0の対応、復帰したローカル参照、差分が本MDのみであることを静的に確認した。

基準`16e7148`で、§1の各資料のHEAD版（入口引渡しdraft-0.2、AP02／03親設計draft-0.3とR01〜08／K01〜06、C07比較draft-0.1、AP02撤去範囲基準draft-0.2と採用記録が未コミットである旨）と作業中の版（入口引渡しdraft-0.6、C05／C07採用記録draft-0.4、C02〜04／06採用記録draft-0.2）、§2で挙げたsourceの識別子（`claimPrivateCompositionSource`、`sourceConstructionClaim`、`#runStatusAcceptanceProbe`、`pinStatusProbeFake`、`#runNativeStatusProbe`、`#probeStatusAcceptance`、`#observeRelease`、`bindReviewReleaseSource`、`PreparedSummary`、`claimStatusBinding`、take系2関数）の所在、`claimCompositionSource` がsrcになくテストが設置する名前であること、SA-25・SA-26・ND-30・ACK-34〜36・CR04の直接assertionを静的に照合した。以下の数はdraft-0.2時点で、本書に新規IDはなく（ED／S／K／C方針は他文書への参照キー）、表2・ローカル参照18（重複を除き14、未追跡2ファイルはリンクにしない）・明示anchor0、参照先・表列数・末尾改行・差分空白を確認した。製品・試験・設定の差分はなく、実行・build／pack・process操作は行っていない。
