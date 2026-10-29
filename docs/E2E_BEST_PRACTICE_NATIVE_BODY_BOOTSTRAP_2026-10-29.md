# NA-03：native終端証拠・RT-B03同bytes課金／解析／ack検証

Date: 2026-10-29 / Scope: 注入Response／Streams・fake dispatcher／clockのみ。

## 1. 実装と境界

[詳細設計draft-0.4 §15](BEST_PRACTICE_ABORT_SCOPE_NATIVE_ADAPTER_DESIGN.md#15-na-03native終端証拠とrt-b03の同bytes接続)に従い、[native body継続](../src/servicenow/review-native-body.ts)を追加し、[bootstrap](../src/servicenow/review-bootstrap-contract.ts)の明示的なconstructor依存native_body=true／typed_body=trueだけへ接続した。

[NA-02 owner](../src/servicenow/review-native-adapter.ts)のprivate end evidenceを同owner／handle／元attempt windowで一度消費し、confirmed EOFのときだけ既存BootstrapBodyLaneのfinish→consume→async handoff→ackへ進む。証拠copyやNA-01の合成tokenはnative証拠ではない。private ownerをcallerへ公開せず、callerがresourceや終端booleanを提出する口も作っていない。

実BoundedReadSessionはfake依存を供給しない従来constructorを維持し、実sessionのcanonical更新点・実transport・認証／URLの正式bindingへは接続していない。fixture台帳のimport／共有、正式receipt／SourceRunEvidence／選択payload／worker jobの証拠発行もない。Unknown・正式発行口閉鎖・全体受付無効・VM／監視／telemetry保留を維持する。

## 2. 合成試験と独立照合

[native-body-bootstrap.test.ts](../tests/review/native-body-bootstrap.test.ts)：新規28件。

| 境界 | 確認結果 |
|---|---|
| 分割UTF-8／空chunk | 入力byte長と独立SHA-256をoracleに、G合計・解析値・digest一致。consume／ack／証拠消費は各1 |
| copyの時点 | accounting callbackが元bufferを変更しても、RT-B03のprivate copyから解析／hashされる |
| parent→release | 同C/G/P leaseでC=2、P=0、G=注入したbyte合計。prepared_only／issuance disabled |
| OAuth exchange | 注入token bytesを同経路で処理し、C=3、tokenを結果／diagnosticへ返さない |
| 超過chunk | 4byteを上限3へ投入。到着分を一度課金し、同streamを一回cancel／release。候補・解析・ackなし |
| 共有G／C・R | 同leaseのtotal G超過chunkを一度課金して停止。C枯渇時は最終4予約を維持しdispatch0でordinary close／予約解放 |
| 空／非空chunk数 | 空17／非空4097で拒否。受信分を二重課金せず、保持量0で停止 |
| shared／非byte | SharedArrayBuffer／文字列chunkを既存契約どおり拒否し、解析・ackへ進めない |
| end evidence | foreign／copy／replayを拒否。別ownerの証拠claimを消費せず、要求先の失敗後再利用も不可 |
| 消費時の期限／取消 | release済み証拠でも元floor到達／cancelで消費拒否。過去のconfirmed EOF事実は保持 |
| pending readの取消 | 同streamをcancel／release、共通primary=cancelledとcleanup=confirmed/cancelledを分離。解析0 |
| cleanup失敗 | cancel pending／reject、native release失敗はunconfirmedで、証拠消費・candidate・ackなし。late決着で修復しない |
| JSON解析失敗 | native EOF証拠の後でもinvalid_responseで停止し、ack0／保持量0。raw本文を診断に出さない |
| consume→ack間 | microtaskで取消／期限到達させ、consume1／ack0／保持量0。成功値・追加dispatchなし |
| HTTP分類 | 401／403／404は既存固定理由で停止。confirmed EOF／ack済み503だけ、C/Gを維持して同用途retry |
| no_body | confirmed/no_bodyをEOF候補やfallbackへ変換せずinvalid_response |
| late Response／再利用 | 元fetch_pendingを維持したbest-effort cancelのみ、G=0・新readerなし。使用済みResponseの次attempt採用拒否 |

native release失敗の注入はisolated module評価前の標準prototype差替えで行い、runtime setterは設けていない。diagnosticは固定理由・cleanup・操作／証拠消費count・保持量だけで、raw例外／token／本文／reader／proofは出力しない。

## 3. RED／GREEN・試験の訂正

1. 最初の同bytes経路試験はnative body module未実装でREDとなり、固定継続の追加後に独立byte合計／hash／ackのGREENを確認した。
2. bootstrap接続試験は、注入Responseを従来のfake bodyとして扱いinvalid_responseになるREDを確認。constructor-only native laneを追加し、parent→releaseのGREENを確認した。
3. 証拠混入試験で、空ResponseのEOF後にも固定2回readする試験側の誤りによりinvalid_stateを検出。停止箇所を追い、既存のEOF後read拒否は変更せず、試験をEOF観測で停止する形へ訂正した。
4. 既存の3312ae4（pending read中finish拒否）を維持し、NA-02／NA-01／RT-B02／RT-B03と合わせて再実行した。

## 4. 実行記録

実行環境：Node v24.18.0。全体試験の既存loopbackだけを許可した環境で実行し、製品／試験期限を緩和していない。

| 確認 | 結果 |
|---|---|
| 新規NA-03＋NA-02／NA-01／RT-B02／RT-B03 | 5 files／171 tests PASS |
| 全体合成（maxWorkers=3） | 187 files／5,700 tests PASS、34.33秒 |
| build | PASS |
| 変更対象のESLint | PASS |
| offline梱包・compiled NA-02／NA-03 smoke | PASS、397 files。2 moduleの8artifact同梱、fixture／tests非同梱 |

全体合成の初回は新規24件時点で187 files／5,696 tests PASS（33.85秒）。消費時の期限／取消2件追加後は5,698 tests PASS（34.61秒）。共有G／C・Rの2件も追加した28件の最終版を再実行した。いずれも実PDI／外部ServiceNow通信や実トークン発行は行っていない。

梱包試験：[package-native-adapter.mjs](../tests/review/package-native-adapter.mjs)、[compiled native body fixture](../tests/review/fixtures/compiled-native-body.mjs)。npmはoffline／ignore-scriptsのdry-run。compiled smokeはfetchをthrowへ置き換え、注入native chunkだけから独立hash・G・解析・ackを照合する。

コミット前再確認：HEAD＋今回の11ファイルだけをindexから一時領域へ展開し、既存node_modulesのみを依存として参照した。他の作業中ファイルを含めず、build・変更対象ESLint・全体187 files／5,700 tests（36.94秒）・NA-01／NA-02／NA-03のoffline梱包／compiled確認がすべてPASS。梱包は397 files、実session／実通信は未使用。

### 4.1 レビュー修正（2026-10-29）

- bootstrapは`before.remaining_ms`からioFloorを決める一方、NA-02 acquireは自前の再観測値でwindow形状（reserve≤min(250, span/4)）を検査していた。phase cutoff約1秒手前で両観測の間に時間が進むと、正しいdescriptorがinvalid_inputとなり、HTTP未送信のままCを1消費してbootstrapがfailedになった（残10,600ms・dispatch計上時+5msで再現）。
- bootstrapはattempt発行時の残時間を`window_origin_ms`として渡し、NA-02は形状をそのoriginで検査する。後の観測値は期限判定（floor以下でattempt_deadline_exceeded）だけに使う。originが現在の観測より後、またはdeadline超過ならinvalid_input。origin未指定のNA-02単体呼出しは従来どおり。
- 回帰試験をNA-03に1件・NA-02に1件追加。修正前の実装ではこの2件だけが失敗することを確認した。修正後は関連5 files／173 tests、全体187 files／5,702 tests、tsc・ESLint・offline梱包（397 files）・compiled smoke・git diff --checkがPASS。上表の171 tests・5,700 testsは修正前の記録として残す。

## 5. 残課題と主張しない範囲

- native laneはfake依存だけで、実session／ReleasePermit、選択window／payload receipt、worker jobの正式bindingは未接続。
- 共通停止の同期失効とcleanupは試験したが、C/G/Pの実session更新点移行や実transportの正式採用を証明していない。
- native dispatch reject／未決着・read／cleanup／ack失敗はretryしない。no_bodyの一般HTTP分類拡張やfallbackは未対応。
- Node最低版22.12.0、cross-realm、全Fetch仕様本文、同期parse／hashの強制中断、native内部buffer／全heap上界は未確認。
- 正式発行口・全体受付を開く根拠や、人の承認・実PDI E2Eの代わりにはしない。
