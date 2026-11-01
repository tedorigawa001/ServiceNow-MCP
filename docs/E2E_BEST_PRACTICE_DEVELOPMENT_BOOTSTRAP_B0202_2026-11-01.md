# B-02-02：同core会計・final4枠・固定200 transcriptの合成検証

Date: 2026-11-01（JST）。基準：`a154b1d`。[詳細設計§8](BEST_PRACTICE_ABORT_SCOPE_DEVELOPMENT_MIGRATION_B02_DESIGN.md)参照。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。friend撤去・実接続・実通信・実機操作・設定変更・Pushなし。

## 1 対象と保証

[開発bootstrap](../tests/support/review/ef03/bootstrap.ts)と[開発root](../tests/support/review/ef03/assembly.ts)を接続。同じroot生成coreの唯一bootstrap port・stop owner・final4枠・leaseを使用し、別counterや任意writerを受けない。2〜3応答のpin済みbytesをC/G課金→解析→開発sourceのprivate ackへ一度だけ渡す。P=0。finallyの予約解放とbytes破棄、同期revoke・固定root cleanupを確認する。

これはdevelopment-assemblyの保証。共通canonical coreの既存単体保証を再利用するが、実sessionのprivate port結合を新版で実証したとはしない。旧B-ACK／B-SA／B-ND等は無変更で併存させ、production-class-fake-I/O回帰として別に数える。正式release判断は`not_evaluated`、値の受理をmatched／permit／preparedへ昇格しない。非200・operator-config・実認証snapshot・native cleanup・実transportは未移行／未接続。専用compiled開発assemblyはB-03に残す。

## 2 RED／GREENと独立期待

初回tracerはtranscript未対応でinvalid_input／C=G=0となりRED。その後、同core取得・予約・固定順dispatch・source消費・finally解放を接続してGREEN。新規[bootstrap試験](../tests/review/development-bootstrap.test.ts)38件は、期待Cを既知の操作数、期待Gを入力bytes長の和、期待Pを0、Rを4→0として独立に計算し、旧実classの返値から期待値を作っていない。

- per-user／cachedは2試行、exchangeは3試行。合成tokenの検査・ready世代・秘密非出力。
- cap4／5／6でbootstrapが使えるCは0／1／2。dispatch前拒否C=0、同期throw／rejectはC=1、retryなし。
- aggregate／responseの低減上限・等号・release時のaggregate超過。超過chunkもGに保持し、解析／後続consumeを停止。
- 不正UTF-8／JSON構造／foreign親・余剰列、取消前／取消中、元clock10秒／50秒／60秒で試行floor／phase／run期限の理由を区別。
- private claimの再利用・既存claim core拒否、mutable caller bytes・Shared storage・getter／proxy・任意status／dispatch／core入力を拒否。
- 実class2枠とconstruction／run primary／stats不変、network呼出し0、開発予約release試行1、全timer解除・新規run再開を確認。

新規期待のため既存試験・製品期限・テスト期限・上限を変更していない。既存classのsource／friend／会計コードも本工程では変更していない。

## 3 実行記録

- 関連6ファイル191件成功（新bootstrap、development-source、development-root、旧private-composition-ack、source-status-binding、native-session-composition）。
- `npm run build`成功。開発rootと新試験のstandalone strict TypeScript検査成功。変更した開発3ファイルのESLint成功。
- `node tests/review/package-http-classification.mjs`成功、417ファイル。既存compiled fixtureは維持。新しいtranscriptの関数名／scope markerも配布JS／宣言／mapにないことを確認し、既存開発root非混入検査と併用する。開発assemblyのcompiled試験ではない。
- 全体テスト：上記終了後に`npm test -- --reporter=json --outputFile=/tmp/servicenow-b0202-full-20261101.json`を単独実行、exit 0。JSONのsuccess=true、220ファイル・9,742件成功、失敗0・保留0を確認。重複起動や期限緩和は行っていない。
- コミット前再検証：対象10ファイルを明示stageし、indexだけを`/tmp/servicenow-b0202-commit-20261101/`へ取り出して既存node_modulesを参照。build・standalone型検査・offline梱包417ファイル・文書リンク71件が成功。その後に全体テストを単独実行し、`/tmp/servicenow-b0202-commit-test-20261101.json`で220ファイル・9,742件成功、失敗0・保留0・success=true、exit 0を確認した。無関係な未追跡ファイルは検証コピーに含めていない。

新しいpackage依存・ビルド設定・登録口は追加しない。コピーbytesは最大12MiB、timerはroot期限と同時試行のdelivery／cutoff各1個、listenerは同時試行1個の有限構造。正確なlayout・全体work・必要量projectionはUnknownであり、全体受付には使用しない。

## 4 レビュー修正（2026-11-01）

- 本番bootstrap契約（`review-bootstrap-contract.ts`）はchunk後にGがbytes長だけ増えC/Pが不変であることを確認するが、開発bootstrapはdispatch後のC差分だけを確認していた。同じchunk後の差分確認を追加し、不一致は`internal_review_error`とする。
- 試験1件を追加：実coreのbootstrap portを、chunkで1byte多く課金するportへ差し替えると`internal_review_error`で停止し、source受理は0回、dispatch1・予約0・release試行1となる。bootstrap試験は39件成功。変異確認として差分確認を除くと追加試験が失敗（1件）し、他38件は成功した。退避copyから復元し`cmp`で一致を確認した。§2・§3の件数は修正前の記録として残す。
- 修正後の全体テスト：1回目は既存`new-followups-evaluation.test.ts`のCLIを起動するcaseが5,000msでtimeout（1件失敗、本修正と無関係のファイル）。同ファイルの単独実行は9件成功、直後の全体再実行は220ファイル・9,743件成功。期限・期待値は変更していない。
- ND設計とsource受理設計の版数リンク（EF draft-0.12・EF-03 draft-0.9）と、B-02設計へのリンク（draft-0.5）を更新した。
