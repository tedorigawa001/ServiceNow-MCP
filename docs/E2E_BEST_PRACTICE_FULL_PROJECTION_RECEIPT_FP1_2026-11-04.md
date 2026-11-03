# FP-1：同claim full受領・固定継続・失効／破棄の合成検証

Date: 2026-11-04。対象：[接続差分設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FULL_PROJECTION_BUNDLE_DESIGN.md)のFP-1だけ。

## 1 実装範囲

`tests/support/review/synthetic-recovery-kernel.ts`のprivate `ReceivedAcceptedProjection`は、元taken object・projectionReceipt・accepted handle・元projectionを保持する。新しいfresh合成入口`createSyntheticFullProjectionReceiptRoot`だけがprivate constructor継続でfull受領を固定し、公開面は引数なし`receiveFullProjection`と既存の準備／cleanup操作だけとする。callerによるmode選択・raw snapshot登録・full getterはない。

header／fullの消費は既存`normalHeaderStarted`を共有する。どちらもclaimを先行消費し元slotを外してから検査し、誤経路・失敗・再入でも再armしない。元take／plan／pins／ready／source／cleanupを検査してprivate受領物を同pendingへ保持し、post guard後に同taken・受領物object自体とreceipt／accepted／planを再検査する。header消費数は0、full受領は最大1となる。既存header-onlyとD2の固定継続は維持する。

受領後は固定abortだけに進む。kernelの受領slotと外側pendingProjectionを同期clearし、payloadPending／isClearedへ両方を含める。本文破棄確認後だけ既存cleanup-only capsuleと固定診断を上位へ移し、最終discardを許す。busy中のlocal参照を破棄済みとせず、claim／消費カウンタは失敗後も残す。inspectは件数・有無・固定理由だけで、projection／ID／本文を返さない。

FP-2のexpectation／BundlePartsDraft、FP-3の完成bundle、成功dest・commit／sealは作らない。prefix／D1比較は新入口では呼ばない。既存C/G/P・全deadlineと予算identityは不変で、追加検査の全体work／heap受付根拠はUnknownのまま。

## 2 検証条件

- 新旧入口のVitest：同takeの一度受領、pre／post時点の未受理・受領状態、post後再確認、固定abortと全clear、重複開始、取消・期限・throw・未知停止値、swallowed再入、source／cleanup失効、foreign summary、秘密非出力、上位custodyと最終discard。
- 実graphのstrict TypeScriptを一時ESM treeへemitする既存compiled fixtureを拡張。テスト用一時copyにだけprivate呼出し・故障を注入する。header→full、full→header、full→full、コピーtakenを拒否し、同claimのkernel消費数0／1を別に確認する。
- post再検査直前の受領物copy・receipt／accepted差替え・payload失効を拒否する。内側receivedProjection／外側pendingProjectionそれぞれのclearを故意に除くと、本文破棄確認・上位custodyへの移譲が止まる負の対照を含む。
- 旧D2のowner／pending／model／budget／epoch検査と4slot clear負の対照を維持する。実class保証やruntime証拠へ昇格しない。
- 梱包監査の除外markerに新入口・型・slot・consumerを追加し、runtime輸入・I/O／clock／worker依存を許さない。compiled fixtureのfetchは拒否stubであり、実通信は行わない。

## 3 実行結果

- `npx vitest run tests/review/synthetic-full-projection-receipt.test.ts tests/review/synthetic-destination-preparation.test.ts`：2 files／20 tests成功。
- `npm run build`：成功。
- 対象4ファイルのESLint：問題なし。
- `node tests/review/fixtures/compiled-destination-preparation.mjs`：旧D2とFP-1の全制御成功。
- compiled初回は、二重消費の故障注入で呼出側receiptsを1と期待して失敗した。実際は二度目の拒否で完了カウンタ加算前に止まるため0。期待値を訂正し、kernelの実消費数を独立して0／1検査するよう補強して再実行成功。製品期限・受付条件・実装の拒否条件は変更していない。
- 全体回帰の初回はローカルlistenの`EPERM`／callback_unavailableに加え、stdioの20秒待ち失敗があり終了コード1。初回はcompiled／梱包確認も並行しており、stdio単体の原因までは確定していない。実装と期限を変えず、ローカル合成待受を許可した条件で`npm test -- --reporter=dot`を単独再実行し終了コード0。初回全失敗を一律にコード退行／環境制約と断定しない。
- `npm run test:pack`初回は既定npmキャッシュ書込みの`EPERM`で梱包前に停止。一時キャッシュ指定の再試行では、package-worker内の`npm ci --prefer-offline`に必要な依存がキャッシュになく、npm registry取得試行がDNSの`ENOTFOUND`で失敗した。外部取得は許可せず、所有権・設定を変えず、既存キャッシュへのアクセスを確保しコマンド限定の`env npm_config_offline=true npm run test:pack`で再実行：終了コード0、441 filesのproduction-only install／analysis／aggregation成功。オフライン指定は子npmにも継承し、依存の外部取得を禁止した。
- `node tests/review/package-http-classification.mjs`：終了コード0、441 filesの配布除外／固定依存監査と既存compiled保証・FP-1負の対照が成功。
- `git diff --check`：問題なし。設計書／検証記録／親2文書のローカルリンク存在も確認した。

コミット前再検証：対象9ファイルだけをstageし、未stage差分・未追跡ファイルがない状態でビルドと全体合成テストを再実行。JSON結果は281 files／13,710 tests成功、失敗・保留0。対象4ファイルのESLint、ローカルリンク25件、compiled保証を含む配布除外監査（441 files）も成功。初回失敗の記録は上記のまま保持する。

## 4 レビュー修正（2026-11-04）

本記録の試験件数は修正前の記録として残す。レビュー時にrepo全体のlint（error 0・warning 374）、build、梱包分類監査（441ファイル、Compiled FP-1を含む）、全体合成281ファイル／13,710件成功・失敗0を確認した。

kernelの13変異を確認し、full受領modeでheader consumerを完了させない判定（`consumeHeader`の`fullProjectionMode`）は外しても既存試験が全て通過した。compiled fixtureのheader→full故障では、判定を外すとheader消費が成功しheader参照を返すが、続くfull受領が共有claimの使用済みで拒否されるため、失敗理由bindingとfull側の消費数0は変わらなかった。header側の完了消費数は0から1へ変わるが、確認していなかった。

compiled fixtureの4故障経路（header→full、full→header、full→full、コピーtaken）でheader側の完了消費数0も確認するよう補強した。上記変異はこの追加確認だけを失敗させた。full受領の`used`判定（二度目はslot空で`!own`が先に拒否）、`checkProjection`のreceipt／accepted／plan／消費数照合とpost時のtaken照合・内部`checkTaken`（内部生成・freeze済み受領物との同一性照合、失効時の受領slot clearで代替）は等価変異として扱う。kernelは変更せず、設計書は実装追記に合わせてdraft-0.2とした。vitest試験数は不変。修正後も全体合成281ファイル／13,710件成功・失敗0。

## 5 維持する停止状態と残課題

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実session／実transport接続・ServiceNowへの実通信・実機操作・設定変更・Pushは行っていない。上記npmの取得試行は成功しておらず、最終梱包検証は外部取得禁止で完了した。

次はFP-2の同snapshot由来expectation・BundlePartsDraftと全構成照合。完成bundle／seal成功・実commitは本検証の保証外であり別工程とする。
