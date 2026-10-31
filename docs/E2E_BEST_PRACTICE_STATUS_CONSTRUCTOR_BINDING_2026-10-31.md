# 同constructor status binding内部契約：合成検証記録

Date: 2026-10-31。対象：[差分設計§10](BEST_PRACTICE_ABORT_SCOPE_STATUS_SESSION_BINDING_DELTA_DESIGN.md)。実通信・実sessionへのstatus transport採用・実機操作は実施していない。

## 1 実装範囲

- 既存lifecycleのtransportConstructor継続内に一度限りのstatus binding生成claimを追加。同handle／snapshot／登録済みlease／初期sourceを検査し、別registry・fixture台帳の共有・新budgetを追加しない。
- revokeと同じ同期sectionで失効。最初のprimary／terminal／refusalを保持し、失敗・取消・期限切れ・close後の再利用を拒否。
- private compositionの既存生成入口がclaimを取得し、fake bootstrap開始前にinspect。返すprivate契約はinspect／diagnosticだけで、発行・dispatch権限なし。

## 2 初回失敗と修正

初回の関連4ファイルのテストはtransform段階で停止し、buildもTS2451で失敗した。追加した局所変数`status`が同scopeの既存変数と重複したことが原因。`statusContext`へ改名し、再実行でbuildと4ファイル86テストの成功を確認した。実行されたテストの失敗ではなく、初回はテスト0件である。

## 3 合成条件

専用fixtureは資格情報・実session登録を持たない。独立したowner／source参照を作り、同一性・拒否と外国owner不変を観測する。固定clock／lease hookで再入・ready遷移・取得例外・期限0を再現する。

- permitなしで生成し、既存ready世代0→1を観測。発行／dispatchはdisabled／unavailable。
- handle／snapshot／lease／source混入、初期sourceのcopy、二重生成と生成中再入を拒否。
- cancelled／deadline_exceeded／closedを同期反映し、後続closeでも最初の理由を保持。
- 検査中の取消、観測例外後の回復、ready遷移、期限切れ後の再生成を拒否。
- 診断にtoken・snapshot・lease・permit・例外本文を出さず、契約に発行口を設けない。

## 4 検証結果

- 関連6ファイル：149テスト成功（専用15テストを含む）。
- 変更したsource2ファイル・test1ファイルのESLint：成功。
- `npm run build`：成功。
- `npm test`：203ファイル・9,218テスト成功。期限・設定は緩和していない。
- `node tests/review/package-http-classification.mjs`：compiled分類3,000組、ST-01／02／03A／B／Cの確認と開発専用module非同梱が成功（409ファイル）。
- `node tests/review/package-worker.mjs`：初回は既定npm cache書込のEPERMで停止。一時cacheをプロセス環境だけで指定した再実行は、pack／内容検査後の`npm ci`でnpm registryの名前解決ENOTFOUNDとなり停止。依存再インストール後のpackaged worker smokeは未到達であり、このテスト全体の成功は主張しない。権限やnpm設定は変更していない。
- 差分の空白検査と文書のlocal参照先検査を実施。ソース・テストの追加以外に依存や公開引数を変更していない。

## 5 残課題・停止状態

status body／cleanup終端の実session採用、C/G/P/R会計へのstatus操作接続、固定sourceの非200受理・fallbackは未実装。HTTP／cleanupの二軸診断はここで合成生成せず、既存事実を保持して接続する後工程とする。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・設定変更・Pushは行っていない。
