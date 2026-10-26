# AU-BR-006 worker・上位結果の統合：最終合成検証

Date: 2026-10-26。対象：[接続契約draft-0.2 §11](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md#11-検証専用workerとfixture上位結果の接続)。

## 1. 範囲

非同梱の検証専用workerを追加し、安全XML／AST計画→初回／最終観測→比較→上位fixture JSONまで接続した。本番`review-worker.ts`・MCP登録・公開0.2／0.3は変更していない。fixture台帳と実session台帳の分離、正式発行口の閉鎖・全体受付無効・Unknownを維持する。VM／監視／telemetryは保留。PDI操作・token発行・設定変更は実施していない。

## 2. 接続と契約

- workerのprepareが既存extractorで実入力XMLを解析し、payload/code hashとbefore/current/setAbortAction(true)のbounded計画を生成。AST／本文は応答に含めず、解析対象を実行しない。
- 既存scope解析へ任意report hookを追加。受信側／限定alias・定数／同名method／false／未知引数を区別し、method差替えや未知文脈をclearへ潰さない。
- 親子双方で既存strict channelを使い、同世代・要求・job・target・hash・phaseを検査。worker内の既存one-shot ownerへpayload／初回／最終を結び、一回だけ比較する。asset-local抽出拒否とrun停止を区別する。
- 固定sourceのstable final後に限り、初回／最終の正規化観測を同tableから一度だけ取り出すfixture deliveryを追加。changed／不完全／失効／再消費を拒否し、C/G/E/Rを再課金しない。正式receiptやsealの代用にはしない。
- 上位`br006-fixture-result-0.1`はstrict・固定列挙・cross-field検査を持つ検証専用契約。provenance=fixture_input、synthetic=true、evidence_issuance=disabled、partial、analysis_complete=falseを固定。本文／hash／nonce／scope値は出さない。scope差候補数は実中止失敗を意味しない。
- 取消／worker・protocol失敗／cleanup未確認では比較値と暫定候補を撤回してnot_completedとする。原primaryとcleanupを保持し、終了未確認を成功へ変更しない。既存asset拒否の診断は保持する。

## 3. 新規32ケース

| 試験 | 件数 | 確認したこと |
|---|---:|---|
| worker core | 20 | 実XML形状の封筒、hash／位置、receiver／alias／const／同名method／false／動的引数、when／collection不足、Global／sys_id／null、同値／差分／alias未証明、版変更／最終不足、XML／JS拒否、相関不正、比較期限の等号拒否 |
| native Worker | 12 | 実IPCと上位JSON、局所拒否、停止後撤回、phase不整合、起動拒否／取消／二重prepare、callback例外の固定化、固定source→一度のdelivery→worker比較、terminate未確認と先行primary保持 |

既存の固定source試験にもchanged時のdelivery拒否を追記した。source→worker試験では独立の注入開始数・UTF-8 byte合計をC/Gと照合し、R=0、追加のHTTP課金なしを確認。架空のPRIVATE文字列を本文／余分な列／例外に含め、上位出力へ混入しないことを確認した。

native試験はreal-host群の既存少数worker実行へ追加し、テスト自体の並列負荷を抑える。製品の期限／既存テストの期限は緩めていない。新規native試験の個別timeoutは15秒で、製品deadlineとは別。

## 4. 実行結果

- `bdo npm run build`：成功。
- 関連3ファイル：60/60成功（新規32＋固定source28）。
- `bdo npm test`：最終156ファイル／4,567件成功。PDI E2Eは含まない。
- `bdo proxy node tests/review/fixtures/compiled-scope-worker.mjs`：固定 `.js` 経路／空env・execArgv／IPC／上位結果／worker終了確認が成功。
- ESLint APIでsrc／tests：0 errors、既存374 warnings。
- offline梱包検証 `tests/review/package-worker.mjs`：377ファイル、production-only install／worker解析・集約／MCP／fixture境界smoke成功。新worker・bootstrap・上位ownerを含む`dist/review/abort-scope-evidence*`は非同梱。
- `bdo git -c core.fsmonitor=false diff --check`：空白エラーなし。

実装中のビルドでは、closure内に引き継げないResultの型narrowingによるTS2339と未使用importのTS6133が発生した。検査済みhandleだけを保持し、未使用importを除くことで解消。その後のビルドと上記最終試験は成功。テストのskip／期限延長で回避していない。

## 5. 「最終」の意味と残課題

本記録の最終検証は**今回の検証専用統合単位**の確認であり、本番AU-BR-006の実装完了・品質承認ではない。入力はfixture由来で、実HTTP／本人性／scope権限や実取得を認定しない。固定sourceとの接続も正規化データの合成試験で、実session／source／ReleasePermit／選択metadata・payload receipt／worker jobの正式な私有bindingは未接続。

OAuth後の同transport移譲、実phase残予算のbinding、正式上位schema・follow-up／coverage、cap承認、全体work／保持上界・強制中断の実運用保証・本番終了policy・実機E2Eが残る。workerは供給された残時間callbackを消費し、実sessionの50/55/60秒bindingそのものを証明しない。terminate確認もNode API範囲で、OS資源の消失を証明しない。

正式発行口・本番レビュー経路・公開規則は有効化せず、実行permit・token発行・設定変更・Pushは対象外とした。
