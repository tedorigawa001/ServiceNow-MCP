# CM-03 typed dispatch直前の単一予算検証

Date: 2026-10-29 / Scope: 注入Response／Streams・fake dispatcher／clockだけ。

## 1 接続と権限境界

[差分設計draft-0.4 §11](BEST_PRACTICE_ABORT_SCOPE_CANONICAL_SESSION_MIGRATION_DESIGN.md#11-cm-03-注入typed-dispatchと単一予算)に従い、[新規canonical bootstrap budget](../src/servicenow/review-canonical-bootstrap-budget.ts)と[coreのdispatchAt](../src/servicenow/review-canonical-budget.ts)を、[bootstrap](../src/servicenow/review-bootstrap-contract.ts)・[native owner](../src/servicenow/review-native-adapter.ts)へ接続した。

同factoryが生成した一つのcanonical状態からleaseとaccountingを供給し、C/G/Pを別counterへcopyしない。既存session・writer・初期statsの採用口やfixture台帳はない。constructorでpinした同期hookだけがnative preflight後にCをcommitする。

実BoundedReadSessionのlegacy dispatch位置は変更せず、CM-02の新しい修正574744bも保持して全体再実行した。実sessionのnative/typed依存、正式receipt／source／選択payload／worker job、公開mode設定は追加していない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry保留を維持する。

## 2 新規27件の合成試験

[typed-dispatch-accounting.test.ts](../tests/review/typed-dispatch-accounting.test.ts)15件と、[canonical-bootstrap-budget.test.ts](../tests/review/canonical-bootstrap-budget.test.ts)12件を実行した。Cのoracleはdispatcher入口での独立到達数、Gは注入したJSONのUTF-8長の合計であり、製品counterを期待値へcopyしていない。

| ケース | 到達数と費用 |
|---|---|
| window発行後・native取得前の期限到達 | dispatcher0／C=0／G=0 |
| 最終R観測中の時刻進行 | dispatcher0／C=0、cleanup=not_started |
| canonical commitのclockでI/O floor等号へ到達 | dispatcher0／C=0。新しい期限で救済しない |
| ownerをcommit中に取消 | dispatcher0／C=0、既存cancelledを保持、R解放 |
| Q=4で通常用途拒否 | dispatcher0／C=0、最終4枠を二重計上せず解放 |
| native shape不正・commit quota拒否・raw例外・未知commit理由 | dispatcher0／C=0、reader0、not_started。秘密marker非出力 |
| dispatcher同期throw／Promise reject | 各dispatcher1／C=1／G=0、no_response。返金・retryなし |
| dispatcher入口で取消 | dispatcher1／C=1／G=0。入力費用を戻さない |
| 正常parent→release | 入口のCが1→2、凍結GET descriptor、Gは同bytes合計、P=0 |
| C後の観測禁止 | C commit後からdispatcher入口までclockをthrowするfenceで、正常処理が通過 |
| confirmed 503 retry | dispatcher3／C=3、G累積、native proof／ack各3 |
| factory寿命 | reserveの二重実行・解放後再開・未予約更新を拒否。解放はidempotentで費用保持 |
| 上限・authority | G等号の次dispatchはC=0で停止、超過Gを保持。未知・過大limits／accessor／初期値を拒否 |
| readonlyと同一予算 | 同leaseへC/Gを反映。reset／raw writer／session登録／payload writerを返さない |

既存final4枠の状態だけを扱い、final slotの実消費・private sourceへの移譲・一般的な動的R配賦まで検証したものではない。

## 3 REDとGREEN

1. window発行後に時刻が進むと、旧順序ではHTTP未送信のままC=1になるREDを再現した。外側の先行計上をnative経路だけから除去し、preflight後のcommitへ移してC=0のGREENを確認した。
2. attempt floorをCと同じ観測で検査するdispatchAtが未実装のREDを確認し、coreへ固定operationを追加した。元floor等号・直後ともC=0を確認した。
3. fresh bootstrap予算のmodule未実装によるREDの後、同lease／同coreのG・Cとrelease後の失効が一致するGREENを確認した。

canonical errorは既存のbounded理由へ変換する。NativeDispatchCommitErrorはsourceの同期throwとは別のcatch境界で扱い、未dispatchをno_responseへ誤分類しない。C/G/Pのpost確認は実dispatcher後・body bytes採用前に行う。readerを既に取得した場合の後始末は同native ownerへ合流する。

保証対象は固定bootstrap継続と同期canonical accountingの組合せである。加算後にthrowする任意callback等のtrusted依存違反を、費用返金や虚偽のC=0で修復しない。

## 4 実行記録

Node v24.18.0。製品／試験期限は変更していない。全体合成の既存ローカル待受だけを許可し、外部ServiceNow・実OAuthには通信していない。

| 確認 | 結果 |
|---|---|
| 新規CM-03 | 2 files／27 tests PASS |
| 全体合成 maxWorkers=3 | 191 files／5,783 tests PASS、30.19秒（初回32.72秒） |
| build／変更対象ESLint | PASS |
| CM-01／02／03 offline梱包・compiled smoke | PASS、405 files |

[梱包script](../tests/review/package-canonical-budget.mjs)はcore・新factoryの8artifactを確認し、fixture／testsを除外する。[compiled CM-03 fixture](../tests/review/fixtures/compiled-typed-dispatch.mjs)はfetchをthrowに置き換え、shape拒否C=0、同期throw／rejectのC=1、同budgetへのG課金とnative ackを確認した。新factoryがsession／lifecycle／fixture moduleをimportしないことも確認した。

コミット前再確認：HEAD＋今回の13ファイルだけをindexから一時領域へ展開し、既存node_modulesのみを依存として参照した。build・変更対象ESLint・全体191 files／5,783 tests（34.85秒）・CM-01／02／03とNA-02／03のoffline梱包／compiled確認がすべてPASS。梱包は405 filesで、他の作業中ファイル・実通信は含めていない。

## 5 残課題

実sessionのprivate writerへの採用、実sourceのReleasePermit／認証snapshot、final slotの消費・移譲、選択payload／worker jobの正式bindingはCM-04以降に残す。CM-03 factoryは新規予算を生成するだけで、実sessionに第二予算を増設していない。

legacy／既存fake操作bodyの計上位置・HTTP分類・retry方針は変更していない。実通信・実機操作・設定変更・Push、全体work／heap受付、本番cap、最低Node版の確認済み化は行わない。
