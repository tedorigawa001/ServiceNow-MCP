# AP05 G02：ED06／ACK-36 未変更候補の実bind・登録結合欠失の観測契約

Version: release-ap05-g02-ed06-ack36-unchanged-candidate-bind-observation-draft-0.1 / Date: 2026-11-20。

Status: **設計のみ。ED06の処遇は未選択・未承認、回復は未確認、G02未充足、SL01は起動0。候補revision・digestは未確定。欠失を作る手段・観測手段は未選定・未承認、数値・保全方式・保全先も未承認。** 静的照合基準 `59c8081` は現行文書・source・旧試験の参照で、製品候補ではない。

[ED06回復先行案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_RECOVERY_ACCEPTANCE_DESIGN.md)と[G02横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)の未確定項目を絞る。[個別処遇案・承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)のED06／N2-R11を更新・承認せず、通常K02〜04と旧合成専用辺の区別を維持する。通常経路・旧試験／fixture・期待値・故障位置、正式発行口・C実行入口／body起動閉鎖、全体受付無効、通常経路未切替、Unknown・調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・故障注入・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 未変更の候補で比較する条件

- **同じ展開物、別run。** 正対照と欠失対照は、同一tarball由来の未変更の隔離展開物、通常entry、固定された本番依存・Node実体、同じ合成親／release入力・観測policy、元期限／予算条件に結ぶ。それぞれfresh session／owner／attemptを使い、Permitをrun間で使い回さない。判定は各run内部の同参照。repo `dist`、src／tsx、別成果物、開発loaderへfallbackしない。外付けの検査器は配布payloadと分け、同一bytesだけでなく実解決先と実際に通った通常実装を確認する。
- **差分は後段の登録結合のみ。** 通常の親→releaseが進み、そのsourceの `matched` とprivate Permit・固定release snapshot／portが生成され、同session／snapshot／lease・同ownerの当該readyが有効で、先行停止がないところまで両runで揃える。欠失側はowner側の後段 `sourceBinding` が一度も確定しない点だけが異なる。source内Permit／portの未生成、初期source／`claimStatusBinding` の欠失、既登録値の後消し、ready消失、bindでの先行throwを混ぜない。`source_claim` の値だけでは、欠失の成立や、どこで失われたかは確定しない。
- **静的確認で分かる範囲。** [通常source](../src/review/bounded-source.ts)の `#completeRelease` はsource内のPermit／snapshot／port作成後に `bindReviewReleaseSource` を呼び、[session](../src/servicenow/bounded-read.ts)は `releasePortFor` と登録ownerの `bindSource` を通す。[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)では同snapshot／lease・ready・port照合を経て登録を確定する。通常公開入力と合成fetchに、登録確定だけを抑えて通常継続させる入口は、今回照合した範囲では確認できない。登録関数の失敗・throwを返す経路は通常 `resolveRelease` 側で止まり、後段欠失対照とは別。候補に適格な既存境界があるとも、方法が原理的にないとも認定しない。

## 2 観測点と判定（各行は設計上の照合点で、実行slotではない）

| 観測点 | P+：通常の実bind | 欠失対照：登録結合だけなし | 分けて記録するもの |
|---|---|---|---|
| 親／releaseの到達と前提 | 通常2引数source、同sessionで合成親／releaseを処理。`matched`、同ownerの有効なreadyと通常会計 | 同じ前提を満たし、故障対象のところまで到達。親／releaseの既消費を正規位置に保持 | 入場・入力／実解決先、同run相関、親／releaseのフェーズ別取得・C/G/P、先行理由なし。単なる `matched`・件数の一致では次の証拠にならない |
| source内生成／owner登録の境界 | 同sourceのPermit／port・固定snapshotと、登録先の同owner・ready・snapshot／leaseの結合が `bindSource` で確定。同Permitを通常継続へ渡す | 同sourceのPermit／portは正規で、対応する登録だけが確定していない。登録が一度も成功していないことと、正規の継続に渡す同Permitであることを区別して確認 | source内成立、owner内確定、元readyと最初のguardまでの有効性は別欄。bind復帰、呼出し回数、close後の空slotから確定／欠失を推定しない |
| **最初の通常metadata guard** | 同Permitで `listMetadata` → `#requirePermit` → `reviewReleaseSourceStatus` → `inspectSource` の通常照合を通り、指定した最初のmetadata取得へ進む | 同じguardまで到達し、source側のPermit／portとsession／snapshot／lease照合は正常なのに、登録なしを `inspectSource` が最初に拒否。`listMetadata` 呼出しは到達、metadata取得は未到達 | source内Permitの不一致やport未取得による先行拒否と区別。現行の内部一次理由はbindingの `evidence_binding_mismatch`、外向きは `internal_review_error`、通常adapterなら `metadata` 段。候補で写像を別照合し、理由文字列だけを一次判定にしない |
| 取得／dispatchと停止 | 既存の合成依存でmetadata取得と通常会計を観測。正対照はmetadata到達が判定点で、追加の本文／worker実行を要件にしない | metadata／payload／verify取得、worker dispatch、同Permitによる後続利用に進まない。親／releaseの消費は残し、fail後の失効と通常停止を保持 | 取得未到達、dispatch未到達、既知費用と一次理由を分け、無観測を0にしない。閉鎖条件や予算は変えない |
| 独立した終了 | 既存の通常close・予約返却と所定の終了を確認 | 拒否とは別に通常close・失効／解放・残存責務と所定の終了を確認 | 同slot／attemptのpost-pinと終了四軸。固定拒否、`finally`、runner exitだけでは終了／解放を認定しない |

**観測で最初の拒否を作らない。** `source.reviewReleaseStatus` は `reviewReleaseSourceStatus`／`inspectSource` を呼び、拒否時にowner停止へ波及し得る。欠失側で先行呼出ししない。`reviewRunStatus` もbudgetを観測して失効を伝播し得るため、名前やreadonlyな返値だけで無介在と扱わない。最初のguard前に追加するなら、元のready・期限・一次理由・順序を変えないことが別途必要。guard後の診断は結果の補助に限り、`revoke` 自体がreadyと登録をclearするので、事後の空欄から「最初から未登録」を推定しない。内部参照・Permit／port／leaseの実体は公開せず、同run内の照合結果・到達順だけを記録する。

## 3 手段の適格条件と代用不可

| 手段・対照の種別 | この審査で認める範囲 |
|---|---|
| 既存の通常出力・合成依存の取得台帳 | 実bind側の通常前進や、実際に観測した取得／未到達を裏付け得る。これだけでは欠失を作れず、登録の未確定・最初の拒否枝・因果は証明しない。診断の取得順と観測による待ち時間の影響も要審査 |
| 候補を変えない既存の境界での欠失対照 | 将来候補が挙がる場合だけ、変更なしの配布物／実解決先、通常guardの原実装、対象runへの限定、登録確定以外の動作不変、最初のguardへの到達、独立終端・復元／隔離を事前に説明する。観測器の適格性と欠失を作る手段の適格性は別。実施・採用は未承認 |
| H・D・PΔ、実行経路を差し替える方法 | [元ACK-36](../tests/review/private-composition-ack.test.ts)のprototype no-opはHで保持し、旧syntheticの**Promise拒否**を証明する範囲に限る。同bytesでもprototype全体の該当methodを置換すればsessionの先行check／port照合まで飛ばすため、登録確定だけが欠けたPとはしない。書換えた出力、loader差替え、新friend／公開supplier、実行する変異artifactはPに使わない。DやPΔの構造検出は独立した補足で、Pの欠失対照ではない |

偽造／copy／foreign Permit・別session、`unknown`／`mismatched`、通常bindでの同期・先行拒否、先行cancel／timeout、診断を先に呼んで起こした停止、guardを通過してからのfetch故障は別ケース。[現行結合試験](../tests/review/source-release-binding.test.ts)と[compiled fixture境界](../tests/review/fixtures/compiled-fixture-boundary.mjs)は通常のbindや偽Permit拒否などの静的根拠だが、同Permitの登録だけが欠ける対照ではない。候補の案Pによる禁止own `synthetic_io` の同期 `invalid_input`（SL17）、FX05の正常prepared、Hの旧Promise拒否とその[AP04結果差](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)を、通常guardの結果へ換算しない。

## 4 起動0・記録・再審査への受渡し

1. **入場前の起動0。** 同一未変更候補で単独欠失を作る適格な境界、観測点ごとの証拠と無介在性、固定entry／入力・対象・費目、担当／権限のいずれかが未確定・未承認なら、欠失対照を起動しない。観測のために期限を延ばさず、「正対照だけ成功」「候補に旧入口がない」でED06の不足を閉じない。正対照は[固定manifest](BEST_PRACTICE_RELEASE_AP05_FIXED_SLOT_MUTATION_MANIFEST_DESIGN.md)のSL09を参照するが、欠失対照は既存SL09／SL15／SL17やMTに自動で割り当てず、実行枠・許可は別審査。
2. **系列・各slotの起動0。** [候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)のG01〜04、[G03段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)の当該段pin、前slotの完全終端と[G04の隔離・終了・保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)の通常枠／cleanup予約を満たさない場合は起動0。将来生成するdigestを先取りせず、当該段で必要な証拠だけを確認する。
3. **実施後に区別できなければUnknown。** 最後に確認できた観測点、先行理由、消費済み／未到達／未確認、終了四軸と残存責務を同候補・同系列・同slot／attemptに結ぶ。未確認の欠失や解放を0とせず、次slot・再試行は起動0。承認済み予約の範囲でだけ保持し、遅着は解放の追記に限る。session／source・登録ready ownerが結合と一次停止、配布審査側がpinと実解決、試験担当がH、外側ownerが終了・保全を担う案であり、人・方式・数値は確定しない。

欠失対照が成立しない場合も旧ACK-36・通常経路は維持し、ED06の処遇を自動で非提供へ移さない。個別処遇、AP02実装、候補検証、旧試験切替、結果差の受容、公開は別承認。**現時点はED06未選択・未承認、G02未充足、SL01から起動0。**
