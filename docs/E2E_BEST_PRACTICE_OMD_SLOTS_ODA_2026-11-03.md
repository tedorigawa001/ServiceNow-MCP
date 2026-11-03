# OD-A mixed slot／prefix段階・同row／receiptの合成検証

Date: 2026-11-03 / Base HEAD: `1c79486`。
Status: **合成DATA assemblyの内部型・生成／消費claimまで確認。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[OM-D設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_MIXED_CONTENT_OMD_DESIGN.md)、[新assembly](../tests/support/review/synthetic-omd-slots.ts)、[試験](../tests/review/synthetic-omd-slots.test.ts)参照。実origin証拠・同accepted採用・比較・候補発行の検証ではない。

## 1 実施範囲

- fresh合成constructorの固定DATA契約を、既存OM-A bounded投影・strict producer／state／reasonと接続。1〜100件・選択順・重複・retained連続末尾、reviewed間のbinding／Update Set／releaseを検査する。
- 同constructorが生成したopaque rowとreceiptだけを受ける。初期prefix開始、行slot生成、同row／receiptによるslot消費を一度限りとし、initial→parent→completeのprefixを順に進める。前prefixと生成claimはpre guard前に占有し、次prefixはconsumeのpost guard成立後だけ返す。
- 7種のmixed slotを区別。親省略は同rowの元reviewed DATAを保持し、元worker omittedへ起源を付替えない。未受信本文やfindings数を合成しない。
- foreign／copy／同ID別receipt・slot・prefix、順序違反・二重開始／生成／消費・余分な引数・任意deltaを拒否する。取消／期限・例外・未知stop・握り潰した再入は先行診断を保持して全pendingと元値を破棄する。
- source close／cleanup開始／固定discardで同期失効。late cleanupは別owner-bound sinkへ一度だけ記録でき、失敗後の再生成は不可。診断は固定state／reason・件数のみ。

独立表はkeep／parent omit／元omittedの件数とfinding数、初期response_truncated／finding_budget_exceeded、errors99／100、最大100行のretained列を手計算の期待値へ照合した。元prefix本文はgetterで公開せず、limitations順・重複と警告生成条件の純粋値契約は既存OM-A試験も再実行した。

## 2 RED／初回失敗と修正

1. 新正常経路試験を先に実行し、新moduleが存在しないためsuite読込が失敗した（0 tests）。assembly追加後に1件成功。
2. 拒否・失効等を追加した47件では46件成功・1件失敗。秘密非出力試験が文字列`findings`を一律禁止し、許可しているscalar名`kept_findings`にも一致したことが原因。出力を確認し、本文field名`"findings":`と`"result":`、本文marker・ID・prefix文字列を拒否対象に訂正した。製品の制限や期限は変更していない。
3. その後の境界・独立表・型brand・旧owner不変試験を含む新66件は成功。
4. 最初の梱包試験はnpm packが既存npm cache配下を開く際にEPERMで停止。npmが所有権変更を案内したが実施していない。実行権限のある範囲で`npm_config_offline=true`をその1コマンドだけ指定し、既存cacheから再実行して成功した。npm設定・cache所有権・依存lock・製品の期限は変更していない。

## 3 再実行結果

コマンドは全て`bdo`経由。下記は今回の終了コード0を確認した結果。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-omd-slots.test.ts` | 1 file・66 tests成功 |
| 新試験とOM-A／OM-C・capture／binding・mixed manifest・NR-Aの指定回帰 | 7 files・459 tests成功 |
| `npm test -- --project unit tests/review/synthetic-*.test.ts` | 32 files・2,896 tests成功 |
| `npx tsc --noEmit --target ES2022 --module ESNext --moduleResolution bundler --strict --skipLibCheck tests/support/review/synthetic-omd-slots.ts tests/review/synthetic-omd-slots.test.ts` | 成功。別brand／完了prefix拒否の`@ts-expect-error`も検査 |
| `npx eslint tests/support/review/synthetic-omd-slots.ts tests/review/synthetic-omd-slots.test.ts` | 成功 |
| `npm run build` | 成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs` | 441 files。production-only install・合成worker解析／集約・MCP fake dispatch・fixture boundary成功。既存のsrc／tests非同梱検査も成功 |

全repositoryのテスト・実worker origin・実session・PDI E2Eは今回実行していない。梱包smokeのworker／MCPは既存のローカル合成fixtureであり、実ServiceNowへの接続ではない。

## 4 保証しないこと・次工程

row／receiptと元reviewed値は新合成assemblyのDATA由来。既存OM-C capture／NR-C receipt・元runのsource／auth／ReleasePermit／jobを取り込む登録口はなく、そのoriginを証明したとはしない。初期prefixもfixture DATAだけで、後段deltaは未対応。固定traceはconstructor時のOM-A検査から採り、実通信・時刻採取・再解析を行わない。

完了prefixは非実行で、manifest seal・empty-reviewed proof・accepted／plan採用・full内容比較・finish証拠・候補を発行しない。旧OM-C／NR-Cとruntimeソースは変更せず、同accepted移譲はOD-B以降へ残す。総work／memory・同canonical予算／停止の供給・中断粒度もUnknownで、元60秒・210試行・C/G/P／retryは不変。

実接続・実通信・実機操作・token／Permit／候補発行・設定変更・Pushは実施していない。
