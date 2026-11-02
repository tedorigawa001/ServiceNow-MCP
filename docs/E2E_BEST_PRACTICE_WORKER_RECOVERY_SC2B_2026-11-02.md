# SC2-B 必要verify・同prefix fake会計の検証

Date: 2026-11-02。基準HEAD: `e47bdf8`。
Status: 合成依存限定の実装・検証。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 1 範囲

[接続契約draft-0.5](BEST_PRACTICE_ABORT_SCOPE_WORKER_RECOVERY_CONTINUATION_DESIGN.md)§11に従い、SC2-AのHeldClosure・準備handleから必要verifyへ進む局所経路を追加した。変更はtests配下の合成issuer／純粋ledger／試験／梱包監査、CHANGELOGと設計書のみで、srcのruntime経路は変更していない。

- 同ownerの準備handleを要求し、verify開始claimを最初のguard前に一度占有する。旧終了証拠はHeldClosureのまま保持し、世代使用は0。
- private継続なしは論理0／GET0・元consistency保持。継続ありは親→metadata、各upstream_unavailableのretry最大1、論理1／物理最大4。
- C/G/Pのprefixを一度snapshotして引き継ぎ、各dispatchだけC+1。retry待ち自体は課金なし。C上限210、Gはresponse4MiB／累積16MiB、Pの元上限8MiBを維持する。verifyによるP加算は0。
- 同pending attemptの一意chunkを一度課金。超過chunkもGへ先に加えて停止する。outcomeはpre-guard前にattemptを取り外して一度だけ消費する。
- 元runのpre/post guard・identity再照合・同期失効を維持する。継続できるbounded失敗はunverifiedと固定理由を保持し、取消・全体期限・受信上限・未知値はhard停止する。
- 失敗後はHeldClosure・handle・attemptを破棄し、先行soft・最初のhard・旧cleanup診断・課金済みscalarを保持する。pending／retry中のdiscard、保持中のnormal closeは拒否する。

## 2 RED／GREENと初回失敗

TDDで3つの接続を順に確認した。

| 段階 | REDの理由 | GREEN |
|---|---|---|
| 同prefixの初回dispatch | beginWorkerVerify未実装 | 1件成功 |
| 親→metadataの同attempt chunk／outcome | workerVerifyChunk未実装 | 2件成功 |
| 最大4試行のretry | failure outcomeの受理未実装で固定拒否 | 3件＋SC2-Aの120件が成功 |

その後に境界・失敗経路を追加した。初回の単独strict型検査で、試験表のmap結果がtupleとして推論されないことと任意のaccounting参照の2件を検出した。tuple型とoptional参照を試験コード内で訂正し、同じ型検査でエラー0を確認した。製品・試験の期限や並列数を緩和する修正はしていない。

## 3 独立oracleと合成結果

[追加試験](../tests/review/synthetic-worker-recovery-verify.test.ts)は86件。必要量計算に実装helperを使わず、有限のdispatch／chunk／retryイベント列と固定guard位置から期待値を計算する。

| 条件 | 確認結果 |
|---|---|
| 成功と最大retry | 親→metadata、論理1・物理2／4、retry0／2。prefixへ実施分だけ加算 |
| private継続なし | 元consistency各3値を保持し、GET0。未実施をstableへ昇格しない |
| C境界と途中消尽 | prefix208／209／210、retry直前210。未dispatch拒否でCは増えない |
| G境界 | response等号／超過、total等号／超過。受信済み超過byteを消さず保持 |
| P境界 | prefix8MiBを受理、verifyによる追加P0 |
| 二重イベント | 開始・dispatch・chunk・outcome・retryの重複を拒否。拒否前後のC/G/P・retry数は同じ |
| 継続失敗 | 9codeの固定写像、unverifiedとprovisionalの保持。元runが生きている場合のみ継続 |
| hard失敗 | cancelled／deadline_exceeded／受信上限／未知理由で同期失効。再準備・再retry不可 |
| pre/post guard | beginから最終outcomeまで18位置の取消。dispatch後・chunk後・retry後だけ実施済み計数を保持 |
| 混入と秘密非出力 | 別binding／plan／attempt、copy／inspect、元7identityの変更、getter／Proxy／不正bodyを拒否。raw SECRETは診断に出ない |
| 後始末 | verify pending／retry中のdiscardとnormal closeは拒否。検証後は固定discard→close可能。再入時も二重Cなし |

関連8ファイル（SC2-A／B、SR-A／B／C①、WJ-A／B／C）の**872件成功**。SC2-Aは直前HEADで追加済みのstatus検査3件を含む120件で、前回記録117件とは対象HEADが異なる。

## 4 全体回帰・型・梱包

実行コマンドはすべてbdo経由。ローカル待受を必要とする既存試験のため、待受可能な実行条件で全体合成試験を行った。PDI／外部サービスへの接続試験は対象外で、設定は変更していない。

- `bdo npm run build`：成功。
- 対象3 TSファイルの単独strict tsc（noUnusedLocals／noUnusedParameters、ES2022／NodeNext）：成功。
- 対象TSと梱包監査のeslint：成功。
- `bdo npx vitest run <関連8ファイル> --maxWorkers=2`：8ファイル872件成功。
- 全体 `vitest run --maxWorkers=3 --reporter=verbose --reporter=json --silent`：初回243ファイル11,051件成功、失敗0・保留0、約32.84秒。
- 診断phase名をworker_verifyに整理後、同じ全体試験を再実行：**243ファイル11,051件成功、失敗0・保留0、約40.45秒**。外側の観測打切り150秒には到達していない。製品60秒・既存test deadlineは変更していない。
- `bdo node tests/review/package-http-classification.mjs`：offline packの441ファイルと既存compiled回帰が成功。今回の関数／module／pathの非同梱、I/O／時計／runtime／worker参照の拒否を負の対照付きで確認した。

最終全体回帰の一時JSON（秘密・コード本文を出力せず集計だけ確認）：`/private/tmp/servicenow-sc2b-full-final-20261102.json`。
SHA-256: `7ef7c4139373b4108aa69f1649648031a4e591183afaf721abe86f94781144f9`。
初回JSON: `/private/tmp/servicenow-sc2b-full-20261102.json`、SHA-256: `eab8c5f8b2f4a2c780ab96d6b2e30e5cf4b01cf5df92eb29d49d8b11fef8d085`。
一時artifactの永続保持は保証しない。

## 5 レビュー修正（2026-11-02）

§3・§4の86件／11,051件と、ESLintを対象ファイルだけに対して実行した結果は、修正前の記録として残す。レビューで、ledgerの次の判定をそれぞれ外す変異でも、SC2-B／SC2-Aの206件が成功することが判明した。

| 判定 | 外した場合の影響 | 追加試験 |
|---|---|---|
| success結果のchange flagのboolean検査 | `changed:'no'`のような文字列が真としてchangedになる（SR-Bでfbbd844に追加したのと同じ型の抜け） | 非booleanのflagでhard停止（internal_review_error）、HeldClosureを失効 |
| chunk identityのobject・非Proxy検査 | Proxyのchunk identityで受信量を課金できる。文字列は`WeakSet.add`の型エラーで止まるが、意図した拒否ではない | 文字列／Proxyのchunk identityを拒否し、受信量を課金しない（2件） |

各変異で失敗するのは対応する追加試験だけで、復元後に`cmp`一致を確認した。chunk identityの変異で失敗するのはProxyの1件で、文字列の1件は上記の型エラーで止まるため変異を区別しない（期待どおりの拒否の確認として残す）。ledger・issuerの実装は変更していない。

修正後の結果：

| 検証 | 結果 |
|---|---|
| SC2-B合成 | 1ファイル／89件成功 |
| ESLint | `npm run lint`（repo全体）exit 0 |
| 全体合成 | maxWorkers=3、243ファイル／11,054件成功、失敗0・pending 0、exit 0。JSON内の開始〜最終試験終了は約51.8秒 |

接続契約はdraft-0.5へ更新し、親設計・soft回復claim設計・本書からの版数リンクを直した。

## 6 未対応・保証しないこと

今回の会計は、同budget identityへ結合した合成prefixのイベントモデルであり、実canonical writer／実final予約台帳を更新しない。chunk identity／サイズは合成イベントで、実readerのbody bytes受領証拠ではない。SR-Bのphase variantへworker factsを偽装せず、既存phase model・旧試験は維持した。

SC2-Aの一般化したinput契約（未完了が処理中の1件だけ・そのT_i=Uという実adapterの逐次順序は未保証）は変更しない。SC2-B成功を実source／payload／worker jobの正式binding保証に数えない。

新世代起動・新ready・新cleanup責務はSC2-C、plan封印はSC2-D、finish／E・候補消費はSR-Dへ残す。B-03 compiled保証、実session／worker／transport接続、実cleanup、追加work／allocation・全体上界はUnknown。正式発行口・全体受付・本番capを有効化していない。実通信・実機操作・トークン発行・設定変更・Pushは行っていない。
