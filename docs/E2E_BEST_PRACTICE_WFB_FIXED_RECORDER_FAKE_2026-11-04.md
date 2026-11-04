# WF-B 固定採取器：純粋fake段階の検証記録

Date: 2026-11-04 / 実装前HEAD: `f47c99f` / 最新設計基準HEAD: `7f055b4` / 未コミット変更を検証。

## 1 範囲・制限

[詳細契約draft-0.3](BEST_PRACTICE_WFB_FIXED_RECORDER_CONTRACT.md)の有限状態・四軸終端・checkpoint planner・外側予約だけを試験専用moduleに実装。製品src／config／依存関係は変更していない。保存先・保持期間・容量・運用時間値・停止方式等は未承認。正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。

再採取・証拠copy／移動／保管操作・実process監督・実接続・実通信・設定変更・Pushは未実施。以下の保全／終了はfake入力であり物理的証拠ではない。通常buildのdist生成は既存証拠の保全とは別である。

## 2 実装と独立期待値

- `tests/review/fixtures/fixed-recorder.ts`: importなし。7状態、最初の採取停止理由とtest異常の分離、四軸snapshot、6種類各1回のcheckpoint、FIFO identity ack、終了後の拒否。
- `tests/review/fixed-recorder.test.ts`: 固定値の手計算表と四軸の全24組合せをoracleとした。期待値を実装のplannerから生成しない。全6trigger／1000回反復／発生順とcopy／foreign／replay／順序違いを確認する。
- 合成値は開始0、outer 300,000ms、session期限600,000ms、観測余裕1,000ms、reserveは順に1,000／2,000／3,000／4,000／5,000／6,000ms。期待D_stop=279,000、工程境界280,000／282,000／285,000／289,000／294,000／300,000。**運用値の提案・承認ではない。**
- session期限とのmin、safe integer／加算overflow、218秒＋余裕ちょうどの起動拒否、準備時間消費、120秒超で継続、D_stopと確認／publication／finalの等値拒否を確認する。flush枠は終了後採取・各report作成・再読を含む合算予約で、内部配賦は未対応。
- 取消・時計例外／不正値／逆行・clock callback再入で停止し再開しない。raw例外文字列を保持しない。未ack publication、二重verify、失敗後reserve／start、Closed後の操作も拒否する。

## 3 実行結果と途中の問題

すべて`bdo`経由。期限・並列設定は変更していない。

| 検査 | 結果 |
|---|---|
| 新規固定採取器test 初回 | 63件成功 |
| 新規test＋既存worker-parent-observation、再入等追加後 | 84件成功 |
| 同対象、最新設計の停止遷移／保全falseの直接Closed追加後 | 88件成功。その後の最終結果は§4に記載 |
| 新規2ファイルのstrict TypeScript単独検査 | 成功 |
| `npm run build` | 成功 |
| 新規2ファイルのESLint | 初回1件失敗。型だけに使うTRIGGERS値が原因で、型unionへ変更後成功 |
| `npm pack --dry-run --ignore-scripts --json`＋出力検査 | 未完了。既存npm cacheのtmpへのopenがEPERM。後段もfiles未取得で失敗 |

梱包失敗時のnpmはroot-owned cache修正案を表示したが、所有者が原因とは独立確認していない。今回確認したのはopen拒否だけであり、chown／設定変更／承認外の再試行はしなかった。梱包成功・配布物除外の実証とは報告しない。

文書更新時にレビュー修正コミット`7f055b4`を確認した。既存差分は保持し、全文を再読後、Reserved停止の直接Closed・Draining以降の後戻り禁止・保全falseの直接Closedを反映した。初期実装の遷移は最新版契約を満たすと扱わず、その後の試験を分けている。

## 4 最終確認

最終変更後、次を確認した。全体回帰・compiled保証・梱包はこの段階の成功条件へ混ぜない。

- `npx vitest run tests/review/fixed-recorder.test.ts tests/review/worker-parent-observation.test.ts`: **2ファイル／88件成功**（新規71件＋既存17件）、700ms。
- 新規pure-fake testだけの最終単独実行: **71件成功**、97ms。
- 既存17件にはfake fetchとローカルWorkerを使うWF-A回帰を含む。新しい固定採取器はそれらへ接続しておらず、単独71件は注入clockとメモリ内操作だけ。既存回帰を新採取器のprocess終了実証へ流用しない。
- 新規2ファイルのstrict単独TypeScript検査とESLint: 成功。
- `git diff --check`: 成功。文書の相対リンク先存在と、importなしの試験専用module／製品build対象外という構成も確認する。これは梱包完了の代わりではない。

## 5 未実証・残課題

1. 承認・session／run identity／2run枠／比較許可は未接続。`reserve(true)`は実承認を検証しない。実source／認証／ReleasePermitにも接続しない。
2. 非上書きstore、byte／scratch／容量上限、manifest／連番session票、writer／再読検証は未実装。checkpoint ackをdurable保存と呼ばない。header plannerだけで、集約本体／WF-A／module・hook分類は未対応。
3. ProcessOwner／外側watchdog、子孫の終了確認、stop／force／flush各工程への接続は未実装。時間計画の試験はOS終了や実時間上限の保証ではない。
4. 実受信・analysisは未対応。新規試験は本文・path・credentialを扱わない固定snapshotのみ。新採取器と実transport／workerの接続試験や全体回帰は実行していない。別途実行した既存WF-AのローカルWorker回帰と区別する。
5. 新moduleはtests配下で製品tsconfigのbuild対象外。package.jsonのfiles許可対象外という構成と、梱包dry-runの完了は区別する。compiled保証・梱包の最終確認は未完了。

合成成功は自然timeoutの原因確定、H5a／H5bの解決、R04／R07充足、採取の許可、seal成功を意味しない。
