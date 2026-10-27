# 共通run owner・claim・readonly bindingの合成検証

日付：2026-10-27。実session／実transportを使わない開発専用モデルの検証であり、PDI E2Eや正式発行の確認ではない。

## 1. 対象

- `src/review/abort-scope-evidence-run-owner.ts`
- `tests/review/abort-scope-evidence-run-owner.test.ts`
- [設計draft-0.2 §13](BEST_PRACTICE_ABORT_SCOPE_RUN_OWNER_BINDING_DESIGN.md)

factory単位のprivate WeakMapにopaque session／診断slot／run／source／permit／bindingを保持する。既存fixture登録台帳・本番session台帳とは共有しない。実session／ReleasePermitを登録・castする入口はない。既存の`!dist/review/abort-scope-evidence*`梱包除外が適用される。

## 2. 確認内容

合成47ケースで以下を確認した。

- run生成claimを入力検査前に消費。重複要求の診断は別slotへ残し、健全な先行ownerを置換しない。
- auth readyは一世代、releaseは独立copy／freeze。matched時のみ合成permitを生成し、unknown／mismatchedはsource claim前に停止。
- source claimは同run／source／permit／auth snapshot／ready／budgetへ結合し、一度限り。失敗後の修復・再生成・再bindを拒否。
- clone／別realm／別source／別permitを拒否し、外国ownerを変更しない。参照差替え7種、最終clock中の取消・差替え、release入力getterからの取消も確認。
- readonly検査は繰返せるがclaimを再生成せず、正式発行gateは正常bindingでも必ず拒否。
- first primaryをclose・cleanup・取消で上書きせず、HTTP／worker cleanupは別軸。unconfirmedはsticky。
- hard期限の等号・逆行・clock例外で停止。期限後の新しいcleanup確認はunconfirmedとし、先行診断を保持。期限内の既知confirmedの再通知は冪等で、権限を復活させない。
- service-account／per-userを合成modeとして固定。token／origin／コード本文は扱わず、未知reason／Errorは固定codeへ正規化。診断にmessage・stack・内部identityを含めない。

## 3. 開発中の失敗と修正

TDDでmodule未実装、認証完了・cleanup・敵対的identity操作の未実装をそれぞれ失敗として確認してから実装した。34件、再入ケース追加後43件へ拡張した。

新しいcleanup confirmedを期限後にも受け入れる境界テスト2件は当初失敗した。観測専用clock検査を追加して45件成功、既知通知の冪等性と取消後の期限内cleanup観測を加えて47件成功した。

buildでは注入clockの再入後もTypeScriptがprimaryをnullと絞り込むTS2339が発生した。private accessorによるcallback後の再読に変更し、runtime検査を削らず解消した。lintの型用途だけのschema変数1件は明示的なstage unionへ変更した。

## 4. 最終確認

- 個別合成テスト：1ファイル・47件成功。
- 全体合成テスト：`vitest run --maxWorkers=3`、162ファイル・4,748件成功（28.68秒）。ローカル合成通信を含むがPDIへ接続しない。
- `npm run build`：成功。
- src／testsのESLint：エラー0件・既存warning 374件。
- offline cacheを用いた`tests/review/package-worker.mjs`：377ファイルのproduction-only install・解析・集約成功。開発用evidence moduleの非同梱を確認。
- 関連MDの相対リンクと`git diff --check`を確認。commit／Pushは行っていない。

## 5. 未対応・境界

本モデルのbudgetは参照identityだけで、C/G/P/E/R会計・lease・共有controller・timer・worker／reader停止通知は未接続。期限は操作時のclock検査であり、自動中断を証明しない。cleanupはcallerが渡す合成通知で、OS／HTTP／workerの実終了証拠ではない。

release入力は限定した合成前提であり、実設定のbinding／期限、実ReleaseEvidence／ReleasePermitの真正性を検証しない。factory全体のadmission上限・実allocation／work上界も未実装。選択payload・worker job・正式receipt・公開結果への接続は後工程とする。

正式発行口閉鎖・Unknown・全体受付無効を維持。VM／監視／telemetry調査は保留。実session接続・実transport・実機操作・トークン発行・設定変更・本番cap投入・permit発行・Pushは実施していない。
