# OB-01 OwnedMixedSupplyと準備claimの合成検証

Date: 2026-11-03 / Base HEAD: `06f750c`。作業中に別途確定したOD-A監査・追加試験`4ad4b33`を保持して再実行。
Status: **strict DATA・同pins／行対応・一度限りの準備まで合成確認。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[OD-B設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ODB_TRANSFER_DESIGN.md)、[実装](../tests/support/review/synthetic-recovery-kernel.ts)、[合成試験](../tests/review/synthetic-owned-mixed-supply.test.ts)参照。accepted採用・移譲先seal・実originの試験ではない。

## 1 対象と成立した条件

- 新kindの4区分DATA以外を拒否する。finish.outcomes／input receipt／外部accepted／別schema_version／deltaを登録する口はない。headerと開始prefixの同値・原順序、selected一意昇順とretained末尾、producer別input条件、active未処理inputを検査する。
- OwnedMixedSupplyのconstruction tokenと同一生成元の行台帳を持ち、親処理後の状態と元reviewed有無からpins用DATAを固定導出する。`createSyntheticFinishPins`は準備1回あたり最大1呼出し。本文全体を旧pinsの小さいコピー枠へ渡さない。
- 一般行receiptとinput receiptは異なる役割で保持する。同pins input／outcome・元accepted-outcome参照、元reviewedのT_i／target更新時刻・binding／release／rule・必須limitations、非reviewedの全値をprivateに照合する。
- 親省略は元reviewed pinを維持し、元worker omittedはnullのまま。metadataにはinputを作らず、retrievalのoptional inputはcompleted＋null context、retainedには同not_processed inputを要求する。元reviewedゼロや全retainedでもready／acceptedを捏造しない。
- prepare claimを先に占有し、prepare_pre・各行row_pre／row_post・prepare_postを通す。途中値は公開せず、全成立後だけ別brandの空PreparedOwnedMixedSupplyを返す。foreign／copy／summary／余分な引数・二重準備を拒否し、pins生成をやり直さない。
- 同handleのdiscardPreparedとsource／cleanup／hard／discardによる同期失効だけを持つ。cancelled／deadline・throw／未知stop・握り潰した再入でpendingと本文参照を外し、先行reasonを保持する。cleanup操作は失効だけで、解放confirmedを発行しない。

0.3 subset、最大100行、C=210／G=16MiB／P=8MiBと直上、prefixの重複・局所上限超過、getter／Proxy・caller後書換えを対照にした。旧OD-Aと旧rootへ新しいhandleや操作を追加せず、新handleも旧rowとして使えない。

## 2 初回失敗と修正

1. 新正常経路試験を先に追加し、factory未実装のため1件が`createSyntheticOwnedMixedSupply is not a function`で失敗した。
2. factory追加後、pins生成のstrict値検査で同試験が失敗した。scalar診断でpin_builds=1／pins_created=0を確認し、一時的な項目名だけの観測でexpected_context.record_updated_atが不正と特定した。元aggregate fixtureのtarget.record_updated_atはnullで、既存pinsの日時契約に合わなかったため、合成fixtureへ固定の有効な更新時刻を設定した。既存schema・上限・期限は変更していない。観測用ログと旧helperへの一時変更は撤去した。
3. 初回の対象型検査ではmovingのundefined可能性に関する5 diagnosticsが出た。既存の実行時停止検査を残し、検査後の同じmoving値をcompleteへ固定して型の到達条件を明確にした。検査条件を削除していない。
4. 拒否試験拡充後の71件は70成功・1失敗。別brandを旧generateへ渡す試験で、想定どおりのthrowに`expect(...).toThrow()`が無かったため失敗した。期待値を追加した。旧helperの拒否動作は変更していない。
5. post guardの停止が不正pins投影より優先される試験を追加し、新72件成功。型・静的検査も再実行して成功した。

## 3 今回の再実行結果

全コマンドは`bdo`経由で実行し、以下の終了コード0を確認した。

| 検証 | 結果 |
| --- | --- |
| `npm test -- --project unit tests/review/synthetic-owned-mixed-supply.test.ts` | 1 file・72 tests成功 |
| `npm test -- --project unit tests/review/synthetic-*.test.ts` | 33 files・2,974 tests成功。既存accepted／seal／discard・pins／mixed・OD-A等を含む |
| 対象2ファイルを指定したstrict `tsc --noEmit`（ES2022／ESNext／bundler／skipLibCheck） | 成功。別brandの`@ts-expect-error`も確認 |
| `npx eslint tests/support/review/synthetic-recovery-kernel.ts tests/review/synthetic-owned-mixed-supply.test.ts` | 成功 |
| `npm run build` | 成功 |
| `node tests/review/package-http-classification.mjs` | 441 files。kernel固定import・新marker非同梱・seeded runtime／I/O／時計／worker／漏出負の対照、既存compiled合成試験成功 |
| `npm_config_offline=true node tests/review/package-worker.mjs` | 441 files。既存cacheでproduction-only install・合成worker解析／集約・MCP fake dispatch・fixture境界成功 |

梱包監査ではkernelの新しいvalue依存であるpins生成とOM-Aモデルを固定allowlistへ追加した。任意importを許す変更ではない。factory／エラー／brand／kindのmarkerを既存漏出拒否へ加え、旧OD-Aの監査変更は保持した。

repository全体のテストは今回再実行していない。既存の梱包smokeはローカル合成worker／fake sourceであり、ServiceNow実通信ではない。実session／worker origin・PDI E2Eの保証には数えない。

## 4 未対応と境界

新factoryは既存kernelと同moduleにあるが`createRecoveryKernel`を呼ばず、bind／accepted採用／plan／ready／移譲先seal／比較／候補の操作を返さない。元reviewed pinは合成DATAの内部対応で、実workerのaccepted証拠や実Permitではない。外部のrow／receiptや旧ownerを採用できない。

固定soft／verify delta・正常terminal-only／失敗obligationとの接続はOB-02〜03へ残す。preparedは固定discard以外へ移せず、失効したpreparedをcleanup診断で再発行しない。source／cleanup操作の成功もresource解放確認ではない。JS heapの物理消去は保証しない。

元列・pins copy／RA projection・private対応表・2回の行照合・guard／clearは追加費目。2N+2 guardを全work上界とせず、同canonical予算／実会計・総work／heap・中断粒度はUnknown。元60秒・210試行・C/G/P／retryは変更していない。

実接続・実通信・実機操作・token／Permit／候補発行・設定変更・Pushは実施していない。
