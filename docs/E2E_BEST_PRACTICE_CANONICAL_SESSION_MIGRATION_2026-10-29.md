# CM-02 legacy会計の中立移行検証

Date: 2026-10-29 / Scope: 実class＋注入fetch／clock。実通信なし。

## 1 変更と境界

[差分設計draft-0.3 §10](BEST_PRACTICE_ABORT_SCOPE_CANONICAL_SESSION_MIGRATION_DESIGN.md#10-cm-02-legacy単一会計への移行)に従い、[BoundedReadSession](../src/servicenow/bounded-read.ts)のC/G/PをCM-01の同canonical状態へ移した。旧mutable counterは撤去し、statsとreadonly leaseは同じ値を読む。public statsは従来どおりcopyを返し、private leaseは差替え可能なpublic stats／remainingMsを参照しない。

更新closureは#budget内だけに保持し、公開getter・mode／accounting option・session後付け登録を追加していない。run owner登録は従来の3引数のまま、native／typed bootstrap依存を渡さない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。

## 2 移行前後の同一イベント試験

[canonical-session-migration.test.ts](../tests/review/canonical-session-migration.test.ts)：新規19件。移行前HEAD 1179a56を別の一時領域へ展開し、同じ試験ファイルのlegacy oracle 15件を実行した。移行後も同じ固定期待値で成功した。試験名フィルターで対象外とした4件は比較用の意図的な除外で、データ不足・未解消によるskipではない。

| oracle | 移行前後の期待値 |
|---|---|
| Cとfinal | Q=6で通常2回→枠拒否→final4回。fetch開始時のCは1〜6、最終G=12、P=0 |
| G等号 | 最初の2byte応答は成功。次のattemptはG>=capでfetch前に停止、C=1／G=2 |
| S／G超過 | 2byteをcap1へ投入。C=1／G=2を保持し、以後のGETも停止 |
| P | 日本2文字を6byte課金し単体拒否後もactive。次の5byteで総量11を保持し停止 |
| terminal 401／403／404 | error bodyを読まず取消。C=1／G=0、既存の認証／権限／不可視理由 |
| 503 retry | 250msの既存backoff後に最大2試行。error 2byte＋成功2byteでC=2／G=4 |
| fetch同期throw | 既存retryごとにCを1課金、最終C=2／G=0。例外marker非出力 |
| JSON不正 | C=1／G=3、invalid_responseでretryなし |
| OAuth exchange／cache | 交換ならtoken応答とGETを同C/Gへ課金。cacheならGETだけ。診断へtoken非出力 |
| phase | 通常cutoffではC=0、既存final phaseへの切替後にC=1／G=2 |
| busy／取消 | 同時GETはreview_busy、元attempt取消時C=1／G=0。close連打後も同会計と理由を保持 |

追加4件は、分割UTF-8とPのイベント順、旧counter名へのshadow代入不採用、readonly leaseで先に観測したhard期限のabort伝播、内部clock診断の公開写像である。readonly leaseとpublic summaryの独立性は既存run-owner-lifecycle試験も再実行した。

## 3 REDと修正

- 旧counter撤去前は、mutable own propertyが残ることを検出する試験がRED。#budget移行後、旧名への代入はcanonical会計に影響せずGREENとなった。
- 移行初版でprivate clockをpublic remainingMsへ委譲したところ、既存のsummary差替え試験が失敗した。元started／limitsの直接closureへ戻し、private leaseをpublic overrideから分離した。
- canonical readが先にdeadlineを固定すると、既存の「stopCodeが未設定の場合だけ同期する」条件ではabortされないREDを確認した。理由の有無ではなく#stopPropagatedで、一度限りのowner失効→abortを行うよう修正した。
- coreのclock失敗がgeneric catchを通り、ownerのinvalid_observation_timeまでinternal_review_errorへ潰れるREDを確認した。private lease境界で元の内部理由を先にownerへ記録し、session／公開結果だけを既存理由へ写像した。

CanonicalBudgetErrorは更新境界・lease境界で既存BoundedReadErrorへ変換する。HTTP分類・retry条件、phase／busy、認証readyPromiseの発行点、closeのresource解放責務は変更しない。core guardは同じ元時計を追加観測するため、時計callback回数や実時間の完全同時性までは中立性の主張に含めない。

## 4 検証結果

Node v24.18.0。既存試験のローカル待受だけを許可し、外部ServiceNow・実OAuth発行へ通信していない。製品／試験の期限は緩めていない。

| 確認 | 結果 |
|---|---|
| 移行前HEADのlegacy oracle | 15 tests PASS、4件は名前フィルターによる比較対象外 |
| CM-02新規試験 | 19 tests PASS |
| 全体合成 maxWorkers=3 | 189 files／5,754 tests PASS、35.12秒（初回47.50秒） |
| build／変更対象ESLint | PASS |
| CM-01／CM-02 offline梱包・compiled smoke | PASS、401 files |

[梱包script](../tests/review/package-canonical-budget.mjs)はcoreのruntime importなしを維持し、compiled sessionがcoreをimportし旧counter参照を持たないことを確認する。[compiled legacy fixture](../tests/review/fixtures/compiled-canonical-session.mjs)はglobal fetchをthrowへ置換し、注入Responseだけでstats／private leaseと閉鎖gateを確認した。fixture自体は非同梱で、registry／claim台帳は共有していない。

コミット前再確認：HEAD＋今回の9ファイルだけをindexから一時領域へ展開し、既存node_modulesのみを依存として参照した。build・変更対象ESLint・全体189 files／5,754 tests（37.44秒）・CM-01／CM-02とNA-02／NA-03のoffline梱包／compiled確認がすべてPASS。梱包は401 filesで、他の作業中ファイル・実通信は含めていない。

### 4.1 レビュー修正（2026-10-29）

- 指摘：時計逆行を最初に観測したのがreadonly leaseならownerは`invalid_observation_time`を保持したが、`chargePayload`・次の`get`（dispatch）など更新境界が先に観測すると、`#account`が公開理由だけで停止し、ownerのprimaryまで`internal_review_error`へ潰れていた。移行前は更新側が時計を観測せず、owner自身のlease読取で`invalid_observation_time`が残っていたため、診断の後退だった。
- 修正：lease境界と更新境界のcatchを1つのprivate写像`#adopt`へ統合した。coreのprimaryがあれば内部理由をownerへ先に記録（ownerはfirst-wins）し、その後に公開理由でsessionを一度だけ停止する。HTTP分類・retry・停止順は変更しない。
- 回帰試験：payload経由とdispatch経由の2件を追加（CM-02試験21件）。修正前実装へ戻すとこの2件だけが失敗することを確認した。
- 再検証：tsc・変更対象ESLint・build・全体189 files／5,756 tests PASS、CM-01／CM-02 offline梱包・compiled smoke PASS（401 files）、`git diff --check` PASS。§4の19件／5,754 testsは修正前の記録として残す。

## 5 未接続範囲

CM-03のtyped dispatch到達直前C commit・動的予約と、CM-04のprivate composition／source採用は未実装。native終端証拠を実sessionのHTTPへ採用したものではなく、legacy finallyのcancel要求をtyped cleanup証拠へ昇格させていない。

実transport・実機操作・設定変更・Pushは行わない。全体work／heap上界、本番cap、最低Node版、実ACL・選択payload／worker jobの正式bindingも今回の検証で確認済みへ変更しない。
