# 同sourceのReleasePermit／不変release snapshot結合：fake I/O検証

日付：2026-10-27。[詳細設計draft-0.4 §15](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md#15-同sourceのreleasepermit不変release-snapshot結合)の限定実装。実session／source classをfake fetch・Response・clockで動かし、PDI・実transportへは接続していない。

## 1. 実装境界

- sourceのmatched発行継続で既存`#permit`と独立copy／freezeしたcanonical release snapshot／readonly portを作り、同sessionのprivate run ownerへprepared-onlyで採用する。
- 固定verifierはsourceのprivate field所有・同session・同permitを確認する。任意objectやpublic decisionの再提出で登録できる口は作らない。portは構造確認と凍結値copyだけで、canonical snapshotやowner／予算leaseを返さない。
- sourceの既存取得処理も`#session`へ統一し、通常プロパティの差替えで別sessionへredirectしない。
- ownerのsource claimは一度限り。同snapshot／lease／ready世代／source／permit／portを結合し、最終checkpointまで確認する。revokeでbindingを破棄し、先行診断を保持する。
- `reviewReleaseStatus`はprepared_onlyのreadonly値と`evidence_issuance=disabled`だけ。formal scope証拠のreceipt／permit／seal／findingやworker jobは発行しない。

## 2. 合成テスト20件

`tests/review/source-release-binding.test.ts`：

| 検証 | 結果 |
|---|---|
| public observed decisionの後書換え | ownerのfamily／raw_buildnameは元のAustraliaを維持。返却statusも凍結 |
| sourceのpublic session shadow | 元のsession・会計・fetchだけを使用 |
| 取消／close | 保持permitのreadonly確認・新GETを拒否。新しいHTTP試行なし、初回理由を保持 |
| 同runの二つ目のsource | 既存bindingを置換せずbinding不整合で停止 |
| forged／clone permit、別permit／source／session、別sourceとその正しいpermitの組、Proxy | 要求先runのみ停止、外国runは既存permitで取得を継続可能 |
| 同sourceの二重採用 | 新しいbindingを作らず拒否。健全な既存binding・release cacheを維持 |
| Zurich／不明family／空／conflict | permitを発行せずsource claimも未消費 |
| C方式fallback | operator_configのasserted根拠と4つのlimitationsを独立copyで保持、同じC/G会計 |
| release読取中の取消 | source claim未消費のまま停止、遅い応答から発行しない |
| cutoff／hard期限 | cutoff後はreadonly確認だけ可能。新GETはphase拒否、元60秒後は保持bindingも拒否 |

追加前の新規19件と既存release-gate／run lifecycleテストを含む対象3ファイル・60件も成功した。最後に別sourceとその正しいpermitの組の混入を追加し、以下の全体再実行で確認した。既存のforeign permit早期拒否（release_not_admitted）は健全なrunを壊さない互換動作のままとし、新しいprepared checkerへの混入停止と区別する。

## 3. TDDの失敗と修正

最初のreadonly status試験はmethod未実装で失敗し、最小接続後に成功した。続いて以下を失敗として確認してから修正した。

1. sourceの通常session propertyを書き換えるとstats／取得先が別sessionになる：取得・会計もprivate参照へ統一。
2. close後の新checkerがinternal_review_errorを返す：元のclosed理由を返すよう修正。
3. 同runへ二つ目のsourceを採用すると例外だけでownerがreadyのまま：mix時の固定binding診断・同期停止を追加。

これらは新しい接続境界の開発中の失敗で、実機上の発見や独立した脆弱性評価ではない。既存の検証記録は改変していない。

## 4. 最終確認

- 新規20件成功。
- 全体合成テスト：`vitest run --maxWorkers=3`、164ファイル・4,795件成功、スキップ0件（44.70秒）。追加前の全体も164ファイル・4,794件成功（49.95秒）。
- `npm run build`：成功。
- src／testsのESLint：エラー0件、既存warning 374件。
- offline cacheでの`tests/review/package-worker.mjs`：377ファイル、production-only install／解析／集約／梱包境界成功。新しいcompiled fixtureで同source結合・snapshot独立性・forged permitによる停止も確認した。
- 関連MD 5文書・相対リンク36件の参照先欠落なし。`git diff --check`の空白エラーなし。

## 5. 費目・残課題

一つのsessionへprepared bindingは最大1、sourceのpermit／canonical release snapshot／readonly portも各1。ownerは独立copyを1件保持し、readonly結果のcopyを外へ返す。matched構造は既存schemaのboundedなflat observed／operator_configと有限limitationsだけ。採用時・readonly確認時のlease観測は各最大2回。追加HTTP／chunk／payload／timer／retry／E/R操作は0で、既存60秒・210試行・受信量・final予約を変更しない。allocationや制御work全体の上界を承認したものではない。

portを読み取れてもlive認定にはならず、失効後に既に得た非秘密の値copyを回収する機能でもない。source証拠の正式receipt／選択payload／worker job／typed cleanup／上位結果は未接続。実Transportを有効化せず、既存ReleasePermitをscope証拠の発行権限へ読み替えない。

正式発行口閉鎖・Unknown・全体受付無効、VM／監視／telemetry調査保留を維持。実transport・実機操作・トークン発行・設定変更・本番cap投入・Pushは行っていない。
