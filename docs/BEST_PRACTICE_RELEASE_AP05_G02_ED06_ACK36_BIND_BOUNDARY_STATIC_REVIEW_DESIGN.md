# AP05 G02：ED06／ACK-36 登録結合欠失の既存境界・観測非介在の静的照合

Version: release-ap05-g02-ed06-ack36-bind-boundary-static-review-draft-0.1 / Date: 2026-11-20。

Status: **現行sourceの静的照合のみ。照合した範囲で登録結合だけを欠かせる適格な既存境界は確認できない。候補配布物での可否はUnknown。ED06は未選択・未承認、回復は未確認、G02は未充足、SL01は起動0。候補revision・digest、欠失を作る手段・観測手段は未確定。数値・保全方式・保全先は未承認。** 基準 `42d803c` は読み取ったsource・旧試験・設計のrevisionであり、製品候補ではない。

[未変更候補の観測契約](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_UNCHANGED_CANDIDATE_BIND_OBSERVATION_DESIGN.md)と[回復先行案](BEST_PRACTICE_RELEASE_AP05_G02_ED06_ACK36_RECOVERY_ACCEPTANCE_DESIGN.md)のED06／N2-R11を対象とする。[G02横断審査表](BEST_PRACTICE_RELEASE_AP05_G02_ED_RECOVERY_CROSS_REVIEW_DESIGN.md)・[個別処遇案と承認票](BEST_PRACTICE_RELEASE_AP05_G02_ED_INDIVIDUAL_DISPOSITION_APPROVAL_DESIGN.md)の結論や票を変更しない。通常経路・旧試験／fixture・期待値・故障位置、通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留、元期限・既定並列度を維持する。今回は本MDのみ。実装・実測・試験実行・build／梱包／展開・故障注入・実接続・実通信・設定変更・公開・コミット・Pushは行わない。

## 1 静的に確認した登録の流れ

1. [clientの通常factory](../src/servicenow/client.ts)はsnapshot／optionsを渡して実 `BoundedReadSession` を作る。[session](../src/servicenow/bounded-read.ts)は自分の `#runLease` と `#runOwner` を内部で確保する。通常GETで認証後に同ownerをreadyにする。このowner登録と、後段の `sourceBinding` の確定は別。欠失対照でも前者とそのreadyは正常である必要がある。
2. [通常source](../src/review/bounded-source.ts)の `#completeRelease` は、通常release判断が `matched` のとき、そのsourceにprivate Permit・固定snapshot・portを作り、`bindReviewReleaseSource` の正常復帰後に同Permitを返す。sessionは `check` → `releasePortFor` → 同ownerの `bindSource` → `#syncRunFailure` の順に進む。portが取れない場合や `bindSource` がfalseを返す場合はthrowする。これは後段metadataでの欠失拒否ではなく、`resolveRelease` 側の先行拒否。
3. [lifecycle](../src/servicenow/review-evidence-lifecycle.ts)の `bindSource` は先行理由・claim、同snapshot／lease・ready・`port.matches()` を検査し、固定releaseのcopyを挟んだ後も照合してから `sourceBinding` と `sourceClaim='claimed'` を確定する。照合した実装内で `sourceBinding` に結合を設定する箇所はここだけで、`revoke` は先行理由を保持してready・登録をclearする。「成功値だけ返し、登録しない」入力分岐はこの通常経路に見当たらない。close後に空であることは、一度も確定しなかった証拠ではない。
4. [通常adapter](../src/review/update-set-adapter.ts)は `matched` を受けて `metadata` 段の `listMetadata(decision.permit)` に進む。`#requirePermit` のactive確認と同Permit照合、sessionのport照合、ownerの `check` の後、`inspectSource` が登録を検査する。この系列で「source側は成立・同ownerは有効・登録だけが未確定」と確認できた場合だけ、最初の通常metadata guardでの欠失拒否と呼ぶ。現行のbinding `evidence_binding_mismatch` と外向き `internal_review_error` は別層であり、snapshot違いなども同じ理由になり得る。

## 2 既存入口の照合結果

| 照合した境界 | 現行sourceで確認できる作用 | ED06の単独欠失としての判断 |
|---|---|---|
| 通常client／adapter／`withBoundedUpdateSetSource` と合成fetch | sessionへ渡す依存は `fetch`／`signal`／`limits`。合成fetchは取得結果、signalは取消、limitsは予算・期限。snapshotの設定providerはconstructorでrelease policyをpinする。`workerFactory` はadapterのworker側に渡りsessionに入らない | 通常の親／releaseやP+は用意できるが、登録確定だけを選ぶ入力は未確認。応答やpolicyで `unknown`／`mismatched` を作る、取消／期限でreadyを失う、metadata fetchを失敗させる、のいずれも欠失とは別 |
| `registerReviewEvidenceSession` と `bindReviewReleaseSource`／`releasePortFor` | `registerReviewEvidenceSession` は生成元にownerを返し、登録済みsessionの再登録は拒否する。既存sessionの `#runOwner` を引き直すlookup／差替えではない。`releasePortFor` は同source／session／Permitの照合用で、登録を選択的に止める口ではない | 別ownerを作る、同sessionを再登録する、偽造／copy／foreign Permitでport照合を落とす、いずれも適格でない。`#runOwner` 内で登録完成だけを抑える既存継続は今回の照合では確認できない |
| options省略の通常準備／旧syntheticのbootstrap／開発fixture | `prepareNewReviewComposition` の省略側はpre-I/Oの初期source結合。旧合成側の `hooks.bind` は登録済み結合の検査で、通常adapterの後段guardではない。[開発fixture登録](../src/review/abort-scope-evidence-fixture-lifecycle.ts)は別台帳。[package定義](../package.json)は旧開発module群を除外する設定 | K04の成功・旧syntheticの停止・Dのfixtureは同候補の通常欠失ではない。現行の除外設定や[compiled境界試験の記述](../tests/review/fixtures/compiled-fixture-boundary.mjs)を、候補tarballと実解決先の確認に読み替えない |
| [旧ACK-36](../tests/review/private-composition-ack.test.ts)と実行経路の差替え | 旧試験はprototype上の `bindReviewReleaseSource` 全体をno-opにして旧runのPromise拒否 `code: internal_review_error` を検査する。呼出し先の先行check／port照合も迂回する置換で、登録確定だけを止めたとは言えない | 元故障はHとして変更せず保持。同じ配布bytesでもprototype／instance methodの置換、loader／実行コードの差替え、実行する変異artifact、新friend／公開getterをP扱いしない。PΔの構造検出やDの実行も代替しない |

結論の範囲は、現行の通常entry・注入面・ownerの登録と失効・旧／開発境界まで。候補の生成JS・展開payload・実解決先は未確認で、将来の適格な手段が存在しないと一般化しない。適格な既存境界を提示できた場合も、同候補pin、通常実装の実解決、後段登録以外の挙動不変・隔離・終端を別に審査する。今回、候補用の観測器や欠失生成方式は選定しない。

## 3 最初の拒否に観測が介入しない条件

| 観測候補 | 静的に分かる作用 | 最初のguardに対する扱い |
|---|---|---|
| `source.reviewReleaseStatus`／`session.reviewReleaseSourceStatus` | `releasePortFor` から実 `inspectSource` へ入り、不一致で`rejectSource`／`revoke`、`#syncRunFailure` による停止を起こし得る | **欠失対照のguard前には呼ばない。** それ自体が最初の拒否になる。実bind側でも別の診断対照にするか、最初のmetadata guardの後に限る。`prepared_only` のコピーやthrowを、先に通す根拠にしない |
| `session.reviewRunStatus`／owner `inspect` | 先行理由とsnapshot／leaseの照合を行い、`observeBudget` がleaseを読み直し `lastBudget` を更新し得る。不正値／期限などを一次理由にし得て、session側の `#syncRunFailure` が停止へ伝播する | 返値がreadonlyでも事前の無介在観測ではない。追加呼出しでclock取得・状態更新・停止が増えないと扱わない。事後の `source_claim` や空slotだけから登録履歴を復元しない |
| `stats()`・合成fetch側の既存記録・外向き結果 | [予算viewの `stats`](../src/servicenow/review-canonical-budget.ts)はC/G/Pのcopyで、leaseの `read` やowner照合と異なる。合成取得の到達／会計や外向きの段・reasonの補助になる | 取得未到達は対象区間の記録完全性と結び付ける。非通知を「0」とせず、`stats`・GET件数／ログ・結果コードでは同参照、未登録、guard内の最初の拒否を証明しない。観測による遅延も無条件で無視しない |

- **guard前に必要なのは、追加判定ではなく同runの証拠。** 同じsourceのPermit／port、同session／snapshot／lease・有効なready、先行失効なし、登録確定が一度も起きていないことを、通常処理へ別の照合を挿入せず区別する。観測が新しいcallback／await／yield、timer・時計や予算の追加読取り、先行停止・書込みを起こさず、候補のguard・期限・診断順を変えない根拠が必要。観測による遅れで期限や勝敗が変わるなら不適格。必要な証拠を取れない場合はUnknown。
- **guardと終端を独立に記録する。** `listMetadata` 自体は到達、同Permit／portの通常照合後に `inspectSource` の登録なしが最初の拒否、続く取得・dispatch・再利用は未到達、を別々に確認する。先行理由、親／releaseの既消費、handler外向きの段／code、通常close・失効／解放、終了四軸は別欄。guard後の診断や `finally` だけで欠失や解放を認定しない。記録は同run参照・到達位置・固定判定までとし、Permit／port／leaseの実体や認証情報は公開しない。

## 4 起動0と再開の判定

1. **現時点は起動0。** 単独欠失を作る適格な既存境界も、guard前の証拠を無介在で得る方法も確認できない。通常正対照（SL09）の計画・Hの旧Promise拒否・SL17の入口同期拒否では埋めず、欠失対照を既存slotやPΔに割り当てない。回復先行案の不足としてED06票に残し、処遇を自動で非提供へ移さない。
2. **再審査の必要条件。** 具体的な既存位置・適用する一差分・通常guardまでの同一性・観測非介在・費目／終了責務を説明できた後に、個別に手段・許可を審査する。[候補入場条件](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_ADMISSION_DESIGN.md)・[G03段階別pin](BEST_PRACTICE_RELEASE_AP05_G03_CANDIDATE_PIN_DESIGN.md)・[G04隔離／終了／保全](BEST_PRACTICE_RELEASE_AP05_G04_EXECUTION_CUSTODY_DESIGN.md)に従い、同候補・固定entry、当該段のpin、先行slot終端、通常枠とcleanup予約、必要な承認が欠ければ起動0。未生成digestは先取りしない。静的照合完了は実施許可や配布物の受入ではない。
3. **実施後に不足が分かった場合も起動0。** 到達や最初の拒否の根拠、post-pin、終了四軸が未確認なら最初の理由、確定prefix、未確認責務を同slot／attemptで保持し、次slot・再試行を起動しない。遅い終了確認は解放の追記だけ。旧試験切替・保証低下・AP02実装・候補検証・公開を分け、**ED06未選択・未承認、G02未充足、SL01起動0**を維持する。
