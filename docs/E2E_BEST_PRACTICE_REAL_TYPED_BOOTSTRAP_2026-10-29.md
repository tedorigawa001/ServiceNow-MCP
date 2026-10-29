# RT-B02：同canonical予算・停止とbootstrapのfake I/O検証

Date: 2026-10-29 / Scope: constructor固定の孤立fake context・会計owner・lease・scheduler・release resolver。

設計：[接続差分draft-0.3 §11](BEST_PRACTICE_ABORT_SCOPE_REAL_TYPED_BINDING_DELTA_DESIGN.md#11-rt-b02同canonical予算停止とbootstrap継続fake-io限定)。
実装：[bootstrap contract](../src/servicenow/review-bootstrap-contract.ts)、[lifecycle](../src/servicenow/review-evidence-lifecycle.ts)。
試験：[新規37件](../tests/review/real-typed-bootstrap.test.ts)、[既存B01](../tests/review/real-typed-constructor-contract.test.ts)、[梱包境界](../tests/review/fixtures/compiled-fixture-boundary.mjs)。

## 1. 実施範囲と境界

既存登録関数の新規context作成時にだけ、fake_io=true・同lease・固定accounting／dispatch／resolver／scheduler依存をpinする。認証→親→release→preparedの順序と既存source verifierへの接続を検証した。freshなfake会計ownerのC/G/Pを既存lifecycleと同じreadonly leaseで観測し、更新callbackの前後差分を検査する。別counterの合算や停止ownerの置換はしない。

**実BoundedReadSessionのconstructorは依存を渡さず、既存legacy経路は変更していない**。実sessionの再登録・後付け採用口・継続取得getterは追加していない。新moduleはlifecycleのruntime依存としてnpmへ同梱されるが、既存sessionへbootstrap依存を挿す経路はない。孤立contextのfake source／permitを実sourceの#permit起源や実C方式の設定検証と認定しない。

fake応答は一つのstatus／Uint8Array完了イベント。private copyをG課金callback前に作り、同copyで一度JSON decodeする。実Response／Streamsのread・cancel・closed・releaseLock／body receipt／同attempt ackは未接続。cleanupは常にnot_observedであり、Promise settlementを確認済みresourceへ昇格しない。

## 2. RED→GREENと途中の失敗

- 認証→parent→releaseのtracerから実装した。既存B01と合わせて初回36件、その後37件が成功した時点を経て拡張した（最終件数とは区別）。
- pending fake I/Oのattempt期限試験は最初5秒でテストtimeoutになった。finallyの取消・終了待ちを入れて観測すると、未決着の第一attemptから第二dispatchが起きるREDを再現。settled済みの合成失敗だけretry対象とし、未決着timeoutは停止して一件のCを保持するよう修正した。期限は緩めていない。
- release resolverが別sourceを返す試験はprepared成功となってRED。constructor sourceと返却sourceの参照一致を必須にして、source claim前に拒否した。
- lifecycle検査の後の追加lease sampleだけが残時間を延長する試験も成功してしまうREDを再現。追加sampleを既存observeBudgetへ統一し、同じ観測履歴で停止するよう修正した。
- この統一後の初回buildで、observeBudgetの不正時nullを新hook型が許容しないTS2322が発生。返却元を調査し、nullable型と理由を失わない停止処理を合わせた。修正前に開始した初回全体runもstdioのbeforeAll内tscで失敗（181 files／5,540 tests成功、1 suite失敗・1 test skip）。これを成功扱いせず、修正後に全体を再実行した。

## 3. 独立イベント観測と結果

| 観点 | 確認 |
|---|---|
| exchange経路 | authentication POST→parent GET→release GET、C=3、ready世代1、P=0、R=4、preparedのみ |
| per-user／cached | OAuth I/Oなし、parent→release、C=2、同lease／ready世代1 |
| Gのoracle | fake dispatchが返した応答byte長のイベント合計とcanonical Gが一致。製品counterから期待値を作らない |
| retry | settled 503は同用途最大2試行。失敗C/Gは残る。pending timeoutは第二dispatchなし |
| 予約 | 全dispatchでC+1+R≤Q。Q=4ではC=0、Q=5ではC=1で理由付き停止。R解放一度、C/G返金なし |
| S／G超過 | 5 byteを4 byte capへ投入し、G=5を保持して拒否。payload／source未開始 |
| 会計混入 | C二重加算／G余分加算／P変更をinternal_review_errorで停止。別counterに切り替えない |
| private bytes | G課金callbackが元byte bufferを変更しても、課金対象と解析するprivate copyが対応 |
| 認証／親／release | 不正token・401／403・不正JSON／UTF-8・target不一致・release未承認で停止。metadata開始0 |
| release binding | constructor sourceと別sourceを拒否。fake asserted releaseのlimitations伝播を確認（実設定の承認ではない） |
| 期限・取消 | 元leaseのattempt 10秒・通常50秒・hard60秒の等号で拒否。取消は同期失効がabort通知より先。遅い応答でGや診断を修復しない |
| 再利用 | 同時二重開始は停止。成功後二度目は拒否のみ。失敗・close後に再準備しない |
| 秘密・authority | global fetch呼出し0。結果／診断へtoken・親本文・permit／sourceを返さず、正式発行disabled |
| 梱包境界 | 実sessionにbootstrap／runTypedBootstrap等の公開口なし、既存legacy GET前後もtransport未claim |

四つのRは将来final用途に必要な予約の局所モデルであり、final再読・cleanup完遂の証拠ではない。fake schedulerのtimerとabort listenerは各awaitのfinallyで外し、成功／停止時pending timer=0を確認した。

## 4. 最終検証

| 確認 | 結果 |
|---|---|
| RT-B02新規試験 | 37 tests成功 |
| RT-B02＋既存RT-B01 | 2 files／72 tests成功 |
| 全体 `vitest run --maxWorkers=3`（型修正後） | 182 files／5,541 tests成功、30.54秒、skipなし |
| `npm run build`（型修正後） | 成功 |
| 変更実装・新規試験・梱包fixtureのESLint | 成功 |
| offline package-worker smoke | production-only install・解析・集約・private境界成功、381 files |
| 関連MD相対参照先 | 5 files／89 links存在確認成功（見出しanchorの自動検証ではない） |
| `git diff --check` | 成功 |

全体回帰には既存のローカル合成待受・fake I/O・worker試験を含む。外部ServiceNow／実OAuthへの通信ではない。`.vscode/`と`CLAUDE.md`の無関係な作業中ファイルは変更していない。途中の失敗を§2へ保持し、未実施・未接続を成功に含めない。

### コミット対象のみの再検証

2026-10-29、HEAD（cb73a51）に今回の10ファイルだけを重ねた一時snapshotで再実行した。無関係な`.vscode/`と`CLAUDE.md`は含めていない。build・変更実装／新規試験／梱包fixtureのESLint・全体182 files／5,541 tests（37.56秒、skipなし）・offline package-worker smoke（381 files）が成功した。関連5文書の相対参照89件と行末空白検査も成功。検証後はこの結果の文書追記だけで、検証した実装・試験・依存設定は変更していない。

## 5. 未接続・未証明

- 実BoundedReadSessionのcanonical更新点をtyped laneへ移行するprivate caller、実固定URL／認証header snapshot、既存固定sourceのbootstrapへの接続。
- 実C方式のconfig期限／binding／競合・実source #permitの生成起源。本試験のresolverはconstructor固定の信頼済みfake policy portである。
- RT-B03のnative cleanup・同bytes candidate／ack、chunk分割／空read・cleanup不成立時のretry禁止・受理後byte解放証拠。
- 選択window／payload receipt／worker job・正式seal／findingへのbinding、全体work／heap上界・物理秘密消去・OS終了保証。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。本番cap投入・実通信・実機操作・トークン発行・設定変更・Pushは行っていない。合成認証データはdummyで、実資格情報を読み込んでいない。RT-A01〜16の全体合格や実PDI検証完了を主張しない。
