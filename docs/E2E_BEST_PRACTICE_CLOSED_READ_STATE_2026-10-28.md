# AU-BR-006 閉鎖gate：同fake ReadState会計・用途／予約の合成検証

Date: 2026-10-28 / Scope: fake依存限定、正式発行口閉鎖。

設計：[draft-0.3 §15](BEST_PRACTICE_ABORT_SCOPE_SESSION_TRANSPORT_BODY_BINDING_DESIGN.md#15-draft-03同fake-readstateの会計用途予約)。
実装：[閉鎖gate](../src/review/abort-scope-evidence-closed-body-gate.ts)、[ReadState](../src/review/abort-scope-evidence-closed-read-state.ts)。
試験：[会計・用途／予約50件](../tests/review/closed-read-state.test.ts)、[既存gate回帰40件](../tests/review/closed-body-gate.test.ts)。

## 1. 実装した境界

明示した合成`accounting` profileだけをprivate constructorの同sessionへ結合した。C/G/P/E、attempt内S、最大10slotのR、最大8tableのTは同ReadStateが保持する。ownerの診断とretained portは同じ値を読み、別counterへの移植・再起動・TC-04台帳の採用はしない。省略時のidentity-only動作は維持。

会計portは同session／run／transportの一度限りclaim後だけ取得できる。全操作で共通binding／停止／clockを検査し、global失敗・closeで同期失効する。最初のterminal primaryと最初のlocal refusalを分けて固定保持する。正式body要求は従来どおり拒否し、発行数は0。

## 2. テスト駆動・途中失敗

最初のtracerは未対応の`accounting`入力で`invalid_input`となりRED。会計接続後GREEN。続いてretry、table予約、P受領、ordinary枠不足後のfinal継続、singleton用途の再生成拒否、元のphase時計、初回なしfinal拒否、E超過後の採用停止、dispatch後の期限再検査、first local診断、skip理由、累計E超過後のfinal停止を小さいRED→GREENで実装した。

途中のbuildは、新ReadStateの失敗型を広い`string`としていたためgateの固定code列挙型へ合流できず失敗した。型境界を調査し、両側が表せる固定列挙unionへ修正した。上限や停止条件は緩めていない。最終buildは成功。

## 3. 会計・停止の観測

| 観点 | 観測 |
|---|---|
| 単一予算 | portとowner診断が同じstatsを返す。独立event/token oracleがdispatch数C、chunk合計G、payload受領P、table内数E、予約token残数Rを再構成し、各段階で一致 |
| Q/R | Q=4/5/6/7/8/210でC+R<=Q。Q=4の通常dispatchはC=0で拒否。本番Q下限の承認ではない |
| 予約 | R=4、table受付でR+=2、初回分のC前払いなし。親→metadata→table順、自slotだけでfinal試行、未使用枠の一度限り解放 |
| retry | 同purpose最大2試行、Sだけreset、C/Gは維持。singletonの新purposeで再試行上限を回避不可 |
| G/S | 上限等号は成功、1byte超過を加算後に停止。後続chunk／retained portは拒否し追加課金なし |
| P | 同attemptのfake成功・cleanup後だけ一度charge／discard。単体超過もPへ加算しlocal、累計超過はglobal。Gへ再加算なし |
| E | table retryを含み256KiB等号まで、finalの1byte超過をE/Gへ一度加算。後続table finalを閉じ、理由付きskipでRだけ解放 |
| 局所継続 | ordinary不足後のfinal retry枠を維持。table初回不可・証拠枠閉鎖は固定skip理由を保持し、成功した親／metadataの任意skipを拒否 |
| 失敗・混入 | synchronous dispatch throwでもC=1。cleanup未確認・不正結果・foreign handle・二重操作・再入・取消では停止し、外国ownerと消費済み費用は不変 |
| 時間 | constructor起点の50/55秒cutoff、hardは従来gateの同60秒。dispatch中にphase期限へ進んでもhandleを公開しない。会計claim／final移行で時計を延長しない |
| 保留payloadの期限 | 最終確認でsoft cutoff後にPが課金される境界を追加REDで確認。期限前commit検査と保留handleの破棄へ修正しGREEN。期限後P=0、C/G保持、final移行は継続可能 |
| 秘密・閉鎖 | raw Errorを固定code化。handle／診断はfreeze、本文や資格情報の保持／出力なし。body issuerを公開しない |

## 4. 最終検証

| 実行 | 結果 |
|---|---|
| 会計専用vitest | 1 file、50 tests成功 |
| 既存gate＋会計 | 40＋50 tests成功 |
| `npm run build` | 成功 |
| 変更した実装・試験のESLint | 成功 |
| `vitest run --maxWorkers=3` | 170 files、5,102 tests成功、28.12秒（soft cutoff回帰追加後の最終実行） |
| offline `package-worker.mjs` | production-only install・解析・集約成功、377 files |

梱包の既存`!dist/review/abort-scope-evidence*`により新ReadStateも除外される。全体試験には既存のローカル合成通信が含まれるが、外部ServiceNowへの通信ではない。

## 5. 未実装・判断保留

長さ・outcome・cleanupは合成eventであり、実bytesやcleanupを検証した証拠ではない。実HTTP／workerは未開始。同期fake dispatch以外のread／cancel／closed／releaseLock、実body候補・decode／consume、実認証順序、実source／ReleasePermit／選択payload／worker jobには接続していない。進行中attemptのphase切れはこのmodelではglobal stopであり、実streamを取り消してfinalへ継続する処理の検証ではない。

per-attempt 10秒・empty-read・cleanup予約の実監督、allocation／同期parse／全体work上界、物理的な強制中断は未対応。Eのfake cap、Qの低減帯を承認済み本番policyにしていない。正式発行口閉鎖、Unknown・全体受付無効、VM／監視／telemetry保留を維持。実transport・実機操作・トークン発行・設定変更・本番cap投入は行っていない。
