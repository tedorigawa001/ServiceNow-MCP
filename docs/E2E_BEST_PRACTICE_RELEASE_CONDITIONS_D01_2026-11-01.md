# RC3-D01：test-only時刻／policy条件・private binding・一度限りclaim

Date: 2026-11-01 / Baseline: `44ab4de`。開発assemblyの合成検証であり、実接続／実通信ではない。

## 1 限定実装

[RC-03設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)のD01だけを実装した。

- `tests/support/review/ef03/release-conditions.ts`：rootごとのopaque条件handle・run生成枠・private binding・ready後のclaim。runtimeの台帳／owner／claimを利用しない。
- `source.ts`：同realmが生成したsource／元contextをprivate WeakMapで照合する。公開summaryのfieldは増やさない。
- `assembly.ts`：明示opt-inの`release_comparison`をI/O前にcopyし、元root deadlineだけを結合。source生成後にbind、同ready継続直後に一度claimし、停止／finallyで参照を破棄する。

`started_at`／`observed_at`／policyは固定test-only値。monotonic clockからUTCを作らず、`compareRelease`は呼ばない。RC-01 parserによる構造copyを使うが、policy期限／issueの意味比較・結果の生成／公開はD02以降に残す。binding相違またはbinding不一致issueはD03まで未対応profileとしてI/O前にinvalid_inputで拒否する。

条件・owner・claim・draftはroot summaryへ追加しない。旧profileだけでなくD01 opt-in時も、同じ旧source／per-user・cached・exchange transcriptのsummaryがdeep equalであることを確認した。C/G/P、final4予約／一度の返却、既存sourceのrelease消費も不変。

## 2 独立した合成検証とRED／GREEN

新規`tests/review/development-release-conditions.test.ts`の最終31件。期待値は固定状態・既存summary・bytes長と操作数から記述し、実Permitや公開draftを生成元証拠に使わない。

1. 旧summaryと等しいopt-in成功を先に追加し、未知profile fieldとして拒否されるRED後に最小接続を追加。
2. 不明なguard理由の非出力を追加し、任意文字列が残るREDを確認。既存normalizeConstructionReasonで固定語彙へ正規化してGREEN。
3. bindingが等しくても不一致issueが付いたprofileを追加し、受理されるREDを確認。未対応条件としてI/O前の拒否を追加。
4. nativeとの併用拒否後、同じdeliveryを元の旧profileで使えることを追加。先にnativeのpinが走りdeliveryが消費されるRED後、併用検査をpin前へ移動してGREEN。
5. 最終確認でguardの不正なfalsy値（undefined／false／0／空文字）を1試験に追加し、成功扱いになるREDを確認した。成功を明示nullに限定し、その他を固定内部失敗へ正規化してGREEN。初回全体実行の後に追加したため、後述の初回9,900件と最終の試験数を区別する。

成功／失敗後の二重claim、同runの再生成、copy／foreign／Proxy handle、異なるrun／snapshot／lease／source／realm、deadline不一致、ready前claim、guard再入・post-guard取消・途中revoke・guard throwを拒否し、先行固定診断を保持する。失敗条件のhandleは再利用できず、別realmは正常にclaimできる。

不正形・getter／Proxy・余剰field・owner日時不正はclock／core前に拒否する。設定日時は1,000桁の小数秒も構造受理し、新たな上限を導入しない。実classのsession2枠を保持した状態でも実session状態・会計・busy判定が変わらず、fetch呼出しが0であることを確認する。

## 3 検証結果

| 確認 | 結果 |
|---|---|
| 新規D01＋旧development root／source／bootstrap／native | 最終5ファイル158件成功（新規31件）。追加の不正falsy guardを含む |
| build | 成功。runtime source変更なし |
| D01 unit／開発assembly・source・条件moduleのstandalone TypeScript | 最終エラー0。初回TS2454は下記に保持 |
| compiled／オフライン梱包 | 425ファイル、既存compiled fixtureと非同梱検査が成功 |
| 全体合成テスト | maxWorkers=3で単独実行。225ファイル／9,900件中9,860成功・39失敗・pending 1、約244.2秒。D01新規30件は全成功 |
| 初回失敗5ファイルの分離再実行 | maxWorkers=1で5ファイル140件成功、失敗0・pending 0、約80.3秒。期限変更なし |
| 最終全体合成テスト | 最終guard試験追加後、maxWorkers=1で単独実行。225ファイル／9,901件成功、失敗0・pending 0、約301.5秒 |
| 文書参照 | 更新9文書の140リンクと15版数ラベルを確認 |

初回standalone TypeScriptはguardのthrow経路で変数codeが未代入というTS2454を1件報告した。systematic-debugging手順で該当catchを確認し、固定reject呼出しで確実に終了する実装を`return reject(...)`として明示した後、同じ型チェックを再実行して成功した。型検査の抑制・deadline緩和は行っていない。

梱包は開発条件module／生成関数名のdist JS・宣言・mapへの非混入を追加検査する。開発専用moduleを配布する変更はない。既存compiledの成功はD01開発assemblyの専用compiled保証ではなく、B-03の未完了範囲を保持する。

### 初回全体実行の失敗を保持

JSONは`/tmp/servicenow-rc3-d01-tests-20261101.json`。new-followups-evaluationの2件、target-selectionの8件は5,000ms timeout。update-set-adapterは22件失敗（2件のtimeout、その後を含むisError等の期待不一致）、worker-lifecycleは7件失敗（1件のtimeoutと後続期待不一致）だった。stdio-reviewはsuite準備のspawnSync NodeがETIMEDOUTとなり、1件がskipped／pendingとして収集された。意図的にskipを追加したものではない。

後続assertionの具体的なerror codeが出力されていないものをreview_busy等と断定しない。製品src・worker・上記5ファイル・期限値は変更していない。systematic-debugging手順で出力と変更範囲を照合し、5ファイルだけをmaxWorkers=1で再確認したJSON `/tmp/servicenow-rc3-d01-isolated-20261101.json`では140/140成功した。再実行成功だけで初回原因の確定・全体退行なしを主張せず、この初回結果を消さない。プロセス状態一覧の補助取得は環境に拒否され、負荷の実測証拠は得ていない。

最終実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-rc3-d01-serial-tests-20261101.json`。他のビルド／試験と重ねず、期限を変更せずに全9,901件が成功した。初回との差1件は不正falsy guardの追加である。並列時の再発解消や原因確定は主張しない。各JSONはローカル一時成果物で、恒久的な集計・失敗理由は本書に保持する。

## 4 残課題・非主張

次はD02の同ack→固定比較→pre/post guard→非実行結果slot／seal後公開で、D01では未実装。D03のbinding不一致no-request、Rの実source接続、readonly全deadline供給、実Permitの結合は未対応／未承認。

設定日時長上限・全入力byte／work・同期処理の上界はUnknown。実sessionのdeadline供給口を未実装差分とした基準commitの修正も維持する。旧case対応表・固定評価セット・旧試験は変更せず、正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・トークン／実Permit発行・Pushは行わない。

RC-01で記録した通常並列の初回16件失敗を本変更で解消済みとは扱わない。合成試験・別assembly保証と実classの正式binding保証を別に保持する。

## 5 コミット対象限定の再検証

D01の15ファイルだけをindexへ登録し、index全体を`/tmp/servicenow-rc3-d01-commit-20261101/`へ書き出した。既存node_modulesへの参照を使用し、distはこのコピーで新規buildした。無関係な未追跡`.vscode/`・`CLAUDE.md`がコピーに存在しないことも確認した。

- `npm run build`：成功。
- D01 unit／開発assembly・source・条件moduleのstandalone TypeScript：エラー0。
- `node tests/review/package-http-classification.mjs`：425ファイル、既存compiled fixtureと開発条件の非同梱検査が成功。
- 更新9文書：140リンクと15版数ラベルの確認成功。
- `npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-rc3-d01-commit-tests-20261101.json`：225ファイル／9,901件成功、失敗0、pending 0、約427.6秒。全test fileが検証用コピーから収集されたこともJSONで確認した。他のビルド／試験と重ねず、期限値は変更しなかった。

再検証後の追加は本節の記録のみで、実装・試験条件は変更していない。§3の初回39件失敗・1件未実行と分離再実行の記録は保持し、並列時の再発解消や正式bindingの完了を主張しない。
