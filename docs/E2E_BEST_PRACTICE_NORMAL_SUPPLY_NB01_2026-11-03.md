# NB-01 同pins正常保持・予算bindingの合成検証

Date: 2026-11-03 / 基準HEAD: `a160b0d`。この記録は実機E2Eではない。
対象: [接続設計§10](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB02_ADOPTION_DESIGN.md)、[共通合成core](../tests/support/review/synthetic-recovery-kernel.ts)、[新46試験](../tests/review/synthetic-normal-owned-supply.test.ts)。

## 1 範囲と保証の限定

- fresh DATA-only root内で同private OB-01 coreを使い、pins生成1回、prepare post後の出生receipt、元供給slotから正常slotへの一度限りmoveを検査する。
- 同token・pins・元行／input／accepted-outcome、8 context refs・active receiptとS/O/U／全deadlineを再確認する。予算shellは同pins.budgetへserial=1で結び、元C/G/Pをコピーする。予算更新・retry・課金を実行するmodelではない。
- moveはhandleやpinsを外部から受けず、private claim／take／pre-work-post／同期commitを固定する。旧root／summary／copyを引数に渡しても採用せず、別rootは不変。
- stop／失効／discardで元供給・正常slot／birth／一時pendingを外す。結合済み予算は保持し、未結合ならaccounting／時刻はnull。4roleの解放責務はUnknownのまま。cleanup確認や本文の物理消去を意味しない。
- accepted／plan採用・kernel生成・移譲先seal・finish／候補・実transport／workerは未接続。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持。

## 2 初回失敗と修正

1. 最初の正常経路1試験を追加し、factory未実装によるRED（`createSyntheticNormalOwnedSupply is not a function`）を確認。同private生成継続と正常rootを追加後、新旧2ファイル76件が成功。
2. move pre／postの取消2試験で、コードとpayload破棄は正しいが上位stageが`prepare`となるREDを確認。下位供給の固定通知が先にFailureOwnerへ書くことが原因。新正常rootが通知前に固定stageを指定する差分を追加し、旧経路は既定prepareを維持。新旧2ファイル33件が成功。normal discardの失敗はcleanupへ分類する。
3. 拡張時の33試験中2件は試験fixtureの問題。100行はaggregate既定`max_records=20`、混合列はselected順とrecord時刻が既存契約に不適合だった。fixtureを上限100・canonical順・元時刻へ揃え、製品側cap／期限は変更せず33件成功。
4. 初回のオフライン梱包は`~/.npm/_cacache/tmp`への書込みがEPERMで停止。npmの診断文はroot所有を示唆するが、本検証で所有者を調査／変更したわけではない。実行権限を得て同じoffline試験を再実行し成功。設定・所有権・アクセス権の変更やネットワーク取得は行っていない。

## 3 最終受入項目

| 項目 | 観測した結果 |
| --- | --- |
| 正常prepare／move | 出生1、消費1、move1、pins生成1、元供給pendingなし、正常所有あり、同origin binding |
| 所有物と時刻 | 元reviewed／親省略の元origin、retained、0.3選択、1／100行、元C/G/P／開始UTC／全deadlineを保持 |
| 不正消費 | 二重prepare／move、準備前move、余分引数、外部root／summary／copyを拒否し再準備不可 |
| 停止 | 各prepare checkpoint、move pre/post、discard pre/postの取消・期限・throw・unknown、swallowed再入を拒否 |
| 優先順位 | 不正引数／出生欠如よりpost停止を優先。最初の診断・通知1回を維持 |
| 破棄 | source close／cleanup開始／discard／hardで本文側参照・birth・bindingを除去。予算bindingは巻き戻さない |
| 証拠不足 | 未結合はnull、4role unresolved=4。cleanup／absenceや本番予算へ昇格しない |
| 秘密非出力 | inspectは固定診断・件数・会計／時刻だけ。行ID／本文／findings／raw例外・内部opaque参照なし |
| 副作用 | 固定guard順序oracleとAPI負の対照。外部pins登録・accepted／seal入口なし。runtime source変更なし |

## 4 確認コマンドと結果

以下はローカル実行。実PDI・実ネットワーク・本番設定は対象外。

- `bdo npx vitest run tests/review/synthetic-normal-owned-supply.test.ts`: **46件成功**。
- `bdo npx vitest run tests/review/synthetic*.test.ts`: **38ファイル3,239件成功**。途中の追加前段階は3,233件成功だった。
- `bdo npm run build`: 成功。srcのみの製品ビルドであり、試験helperの型保証とは分離。
- `bdo npx tsc --noEmit --strict --noUnusedLocals --noUnusedParameters --skipLibCheck --target es2022 --module esnext --moduleResolution bundler tests/review/synthetic-normal-owned-supply.test.ts`: helperを含む厳密型検査に成功。
- `bdo npx eslint tests/support/review/synthetic-recovery-kernel.ts tests/review/synthetic-normal-owned-supply.test.ts`: エラー・警告とも0。
- `bdo proxy env npm_config_offline=true node tests/review/package-worker.mjs`: 成功、**441 files**。production-only install・compiled worker／MCP smoke・fixture境界を確認。testsディレクトリは非同梱であり新rootも配布しない。キャッシュ制約による初回失敗は§2を参照。

全リポジトリの合成テスト全件は今回未実行。合成recovery群と梱包smokeの保証をそれ以上へ拡張しない。実resource・canonical予算lease・全work／heap上界、PayloadClearedReceiptと上位custody連結は未保証。NB-02／03以降へ残す。

## 5 レビュー修正（2026-11-03）

修正前の新規46件は記録として残す。本記録は全リポジトリの合成テストを実行していなかったため、レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査、全体合成273ファイル／13,418件成功・失敗0を確認した。

- 梱包監査：既存FB-01〜03はkernelのleak marker一覧（`package-http-classification.mjs`の`rootMarkers`）へ新factory／scopeを追加していたが、NB-01の`createSyntheticNormalOwnedSupply`と`synthetic_normal_owned_supply`は未登録だった。runtime `dist`へ漏れても名前検査で検出できないため、両markerを追加した。kernelの固定import自体は変更がなく、既存の監査で引き続き検査される。
- 試験：`stop()`の未知理由。判定を外すと`stop('caller_reason')`がcallerの文字列をそのまま`first_failure`へ保持し、inspectに現れた（custodyのhardは`internal_review_error`のまま）。未知理由が`internal`へ固定され、caller文字列を出さないことを検査する1件を追加した。同じ判定文はOB-01側にも存在するが、NB-01側の判定を外した変異で新規1件だけが失敗し、既存46件は通過することを確認した。

take側の内部検査・`normal`の同token照合・prepare後のbirth存在（内部継続で常に成立）、birthの結合検査・`checkOwnedSupply`の再実行・8 refsのobject性・active input／4時刻（同DATAからpinsを生成するため構造上一致）、二重prepare／move（supply側・takeの判定が先に停止）、二度目の`custody.local.hard`（supplyの`recordFailure`が既にhard設定）は等価変異として扱う。helperは変更せず、新規試験は47件。修正後も全体合成273ファイル／13,419件成功・失敗0。

## 6 コミット候補だけの再検証

対象7ファイルだけをindexへ登録し、`git checkout-index`でHEAD＋その変更だけの一時コピーを生成した。依存は既存node_modulesを参照し、distは一時コピー内で新規ビルドした。そこでビルド、合成recovery **38ファイル3,239件**、新試験とhelperの厳密型検査、変更TSのESLint、offline梱包 **441 files** がすべて成功。製品依存のみのinstall・compiled worker／MCP smoke・fixture非同梱も再確認した。元作業ツリーの未登録変更には依存せず、期限緩和・実通信・設定変更・Pushは行っていない。
