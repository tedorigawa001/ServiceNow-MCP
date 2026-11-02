# RD-B02 最小scalar共有・通常WJ-C互換性 合成検証

Date: 2026-11-02。Baseline: `3671783`。対象はtests配下の純粋predicateと通常合成ownerへの最小接続。runtimeソース・公開JSON／MCPは変更していない。

## 1 実装と維持する境界

[scalar helper](../tests/support/review/synthetic-finish-scalars.ts)へ、検査済みrule集合・既存JSON.stringify表現の一致・Eの両端inclusive境界だけを抽出した。[通常WJ-C](../tests/support/review/synthetic-worker-time.ts)のcompare／finishTime／manifestから利用する。

copy／field／list・各局所枠・schema・重複rule拒否・target／T_i比較・limitations・operator_config expiryは既存位置に残した。pending receipt、completed、job、candidate、guard、cleanupと失敗理由のownerは抽出していない。`receipts.size > 0`拒否を維持し、allow_pendingや回復用分岐は導入しない。

predicateはparserではない。rule集合は呼出側で重複なしの検査済み有限配列、Eは有限UTC epochと検査済み実効deadline、releaseは既存copy／schema後の表現を前提にする。未検査入力・単独のtrueを証拠やfull schema保証へ昇格させない。releaseはkey順を正規化しない。新たな時刻／文字長capは設けない。

## 2 RED／GREENと途中失敗

最初のrule比較tracerは新moduleがないためimport失敗（試験本体0件）。module追加後1件成功。release表現・E境界も、それぞれ未実装関数による失敗を確認してから追加し、3件成功とした。以後、独立oracleと通常ownerの負の対照を追加した。

梱包試験の初回は、新しく加えたruntime import負の対照が期待する例外を出さず失敗した。TypeScriptのtranspileModuleで未使用importだけが`export {};`へ消えることを最小例で確認。既存対照と同じくimportした値を参照するfixtureに修正し、再実行で拒否を確認した。これは負の対照の記述不備で、許可import集合を広げる対応は行っていない。型検査・lint・製品buildの失敗はなかった。

## 3 独立確認

- 3ruleの全8subset対（64組）を独立したmembership oracleと照合。順序差は許容し、追加・欠落・別IDは拒否。
- predicate単独は旧重複動作を変えず、通常ownerのstrict headerが重複ruleを拒否することを別に確認。
- release文字列表現の同一・key順差・文字ごとの置換・末尾空白を比較。意味の異なるcanonicalizationは追加しない。
- L=1／7／60000、U=S／S+1／S+L、Eの下端・上端と±1msを独立したinclusive区間式で確認。
- 同じscalar値が一致しても通常ownerの未完了receiptはfinish拒否。候補を保持せず、再試行も拒否し、最初の診断を保持。
- 通常WJ-Cの既存82件を抽出前後に別JSONレポートで採取し、fullName集合の一致と両方の全件成功を確認。既存のheader field差替え・target集合・nested UTC／release・operator expiry・guard／cleanup試験は無変更。

## 4 検証結果

- `npm run build`：成功。
- 関連4試験のstrict TypeScript型検査：成功。
- 変更TS／梱包scriptのESLint：成功。
- 関連合成：4ファイル303件成功（scalar21／通常WJ-C82／WJ-B66／RD-B01 134）、失敗0・skip0。
- 全体合成：256ファイル12,205件成功、失敗0・skip0（約35.1秒）。追加の重複rule拒否試験前の初回も12,204件成功。
- `node tests/review/package-http-classification.mjs`：441ファイルで成功。新helperの非同梱、dist JS／型／map内のmarker非露出、I/O／clock／worker／runtime依存の注入対照を確認。既存compiled fixtureも成功。

関連試験はmaxWorkers=1、全体回帰はmaxWorkers=3。全体の150秒外側監督は検証用の停止装置であり、製品／試験の既存deadlineは変更していない。ローカル待受の既存合成試験を含むが、外部ServiceNowへの通信・実機操作は行っていない。

## 5 残課題・非実施

RD-B03の回復集合／context／T_i・U・Eの二入力共有枠比較、RD-B04の同accepted封印・RA-03-B破棄接続は未実装。元結果本文／findingsの真正な内容証拠、full schema／wire、追加work／allocation・本番capはUnknown。正式発行口閉鎖・全体受付無効・VM／監視／telemetry保留を維持した。実Permit発行・実source差替え・実worker／runtime接続・実通信・設定変更・Pushは行っていない。

[詳細設計§12](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)参照。
