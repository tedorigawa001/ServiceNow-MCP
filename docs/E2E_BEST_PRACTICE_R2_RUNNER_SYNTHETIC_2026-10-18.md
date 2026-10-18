# BP-5 R-2：承認manifest・listener・session・MCP bridge接続の合成検証

Date: 2026-10-18 / Result: 合成試験PASS / 実PDI: 未実施

## 1. 範囲

[runner接続設計§14](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)に沿い、
`runR2ApprovalManifest`をリポジトリ内部の明示呼出しAPIとして実装した。
telemetry調査・maint担当者への依頼は保留。実機接続・実token発行・登録/ロール/ACL/設定変更はしていない。
fixtureは一時ディレクトリの架空manifest、通信は合成fetchだけ。実ブラウザーの操作や実manifestの配置はしていない。

実TCPは127.0.0.1:18765だけ、実workerと合成子プロセスを使用した。子へのargvは非秘密のfixture pathだけで、
token/code/state/verifierをargv/env/ファイルへ渡していない。テスト後にfixtureを削除した。

## 2. 接続した処理

1. 所有者/権限/ACL/symlink/上限/期限/bindingを検査してmanifestを読み、消費直前に再検証する。
2. bind開始から全体385秒を固定。最後の3秒をcleanupに予約し、作業は382秒で停止する。
3. 固定listenerへ同じsnapshotを渡す。ready通知には固定の非秘密start URLしか渡さない。
4. 一度限りの開始ページ→固定callback→交換1回→固定GET本人確認。同じtoken/期待ID/接続先を維持する。
5. 本人確認後だけprivate permitを使い、実MCP SDKの同一プロセスlist→固定toolのcallを1回行う。
6. bounded取得・C方式release gate・実worker・0.2/0.3契約は既存処理を使い、直接executorへ迂回しない。
7. 結果の秘密一致検査、冪等なroot Abortとcleanup。失敗時は固定理由だけを返す。

`R2LoopbackListener`は内部connectionへSDK実行を委譲する最小口を追加。
connectionがbridge/session/permitと秘密一致検査を所有し、runnerへtoken/session/bridgeを公開しない。
bridge生成と取消の競合でも遅いbridgeを閉じる。SDK list成立のboolはcall失敗時も保持する。

終了票は`ok/cleanup/mcpListed/tokenMayHaveBeenIssued/otherAccountTokenPossible`と、
成功時`result`または失敗時`code`だけ。`ok=true`はMCP応答とcleanupの成立であり、内側の
`result.isError/status/limitations`を無視してレビュー成功・完全・安全と判断してはいけない。

## 3. 合成試験

新規runnerケースは`tests/review/r2-runner.cases.ts`の23件。
同じ固定portを使う既存46件と別workerで競合しないよう、`r2-loopback.test.ts`から1つの逐次suiteとして実行する。
子signal試験のhostは`tests/review/fixtures/r2-runner-signal.mjs`で、公開CLIではない。

| 区分 | 確認内容 |
|---|---|
| 計画不正 | 未存在/untrusted manifestはbind/ready/issuer通信前に停止 |
| 正常0.3 | manifest→実HTTP callback→合成交換/本人確認→実SDK list/call→C方式fallback→実workerで1件解析・1候補。ソース本文非返却 |
| 0.2互換 | `bounded_all`の固定条件を同じSDK経路へ渡し、既存0.2契約を検証 |
| 全体期限 | 385,000ms/cleanup3,000msの既定値、fake timerで381,999ms未終了→382,000ms作業停止、timer残数0 |
| 実時間/非協調consumer | 短縮した全体/cleanup予算でready consumerが未解決でも打切り、port/外部購読を解放して直後に再bind可能 |
| 遅れたtimer | 単調時計が作業期限に達した場合、timer実行前でもawait後の検査で停止し、issuerへ進まない |
| 通信中取消 | 非協調な交換/本人確認/payload取得を外部Abortで停止。同じ要求signalがaborted、遅い応答bodyを破棄、後続へ進まない |
| 本人不一致 | 別アカウントの合成tokenで`identity_mismatch`、metadata/listなし。発行の可能性と別人の可能性を固定boolで残す |
| CPU中取消 | 実workerをCPUループにしてroot取消。worker exitを待ち、成功/生結果を返さない |
| 終了不能 | OS境界でterminate未解決を合成し、短縮cleanup期限で`cleanup_incomplete`、結果なし。テスト自身は実workerを最後に終了 |
| 上限不正 | 0/負数/385001/NaN/小数の全体上限をbind前に拒否。内部optionsは既定上限を拡張しない |
| 前取消/ready失敗 | bind前の取消、ready consumerの例外を安全側停止し、signal購読を元に戻す。生例外は返さない |
| port競合 | 他の既存listenerを閉じず、別portへfallbackせず、ready/issuer通信なしで停止 |
| 実OS signal | 専用合成子に実SIGINT/SIGTERMを送り、`interrupted/cleanup=complete`、自然終了code0、stdout/stderr空を確認 |
| 非出力 | 正常/失敗時にURL/state/code/verifier/token/本人ID/client ID/コード本文/生例外の合成マーカーが結果・stdout/stderrにない |
| 秘密反射 | 実Bearerと同じ文字列を有効な資産sys_idとしてメタデータへ反射させても、結果を破棄して`secret_output_detected`を返す |

TDDではuntrusted読込、正常接続、非協調readyの期限、失敗後のlist成立記録、秘密のmetadata反射について
期待が満たされない失敗を確認してから実装した。全ケースが独立ブラインド評価という意味ではない。

## 4. 実行結果

| コマンド | 結果 |
|---|---|
| `bdo npm test -- tests/review/r2-loopback.test.ts` | 69件PASS（既存46+runner23） |
| `bdo npm test -- --maxWorkers=2` | 108ファイル、2,807件PASS |
| `bdo npm run type-check` | PASS |
| `bdo npx eslint src/review/r2-runner.ts src/review/r2-loopback.ts src/review/r2-oauth-session.ts tests/review/r2-loopback.test.ts tests/review/r2-runner.cases.ts tests/review/fixtures/r2-runner-signal.mjs` | エラー/警告0 |
| `bdo npm run test:pack` | build・361ファイル梱包・production-only導入・解析/集約worker・MCP smoke PASS。R-2は非同梱 |
| `bdo git diff --check` | PASS |

385秒境界はfake timer、実時間では短縮上限を使用。385秒間の実待機試験ではない。
実OS signal/worker/portの試験環境はmacOS。実Linux/Windows、実ブラウザー、実PDIの動作証明ではない。
梱包検証はnpm cacheのsandbox制約を避けたローカル試験であり、npm公開ではない。

## 5. 制限と残課題

- 公開CLI/check-plan・実行時の人の承認照合・OSブラウザー起動は未接続。manifest参照は人の承認証明ではない。
  内部APIは専用hostで明示的に使う前提で、公開server/HTTP/stdioへ登録しない。
- SIGINT/SIGTERMをrootへ伝播し、自分のhandlerだけをfinallyで解除する。終了不能時に親/共有アプリを
  process.exit/SIGKILLする処理はない。`cleanup_incomplete`を受けた専用hostの強制終了と
  uncaught例外時の最終exitは後続設計/試験が必要。worker終了未確認を「資源解放済み」としない。
- イベントループ/OS停止時の385秒厳密保証、SIGKILL/クラッシュ時の完全cleanupは主張しない。
- private集合による秘密一致検査はraw・URL符号化・最大2段JSON escapeの既知値を対象とする。
  検査のため秘密参照をcleanupまで保持する。任意の難読化/分割/符号化は網羅せず、短い値/偶然一致は安全側の誤拒否になり得る。
  既存の本文非返却・strict JSON契約・固定診断が主防御であり、完全漏えい防止の証明ではない。
- JS/HTTP実装が保持するコピーやOSメモリの完全消去は保証しない。cleanupはサーバーtoken失効ではない。
- 実認可・実token・最小権限/R-2のACL・Public Client/S256/loopback・自己参照GET・C方式の実機成立は未確認。
  今回の結果をG2/G4完了と扱わず、失効/同意取消やtelemetry調査も自動実行しない。

## 6. bind取消競合の追補検証

同日、bindの完了/取消が競合すると起動Promiseが未決着のまま、runnerのfinallyでlistener未設定を理由に
`cleanup=complete`を早返しできる点を修正した。原因は起動Promiseが作業ブロック内にしか保持されていなかったこと。

`starting`をfinallyまで所有し、起動の決着と、成功したlistenerのclose/状態確認を1つのcleanup期限で待つ。
startの非同期失敗経路は内部cleanupを待ってからrejectするため、そのrejectも待機対象に含める。
上限は従来どおり全体385秒/cleanup最大3秒。期限超過時は`cleanup_incomplete`、結果なし。
遅い起動の後始末は継続するが、返却済み終了票は変更しない。

TDD・systematic-debuggingでNode HTTPのclose完了通知だけを遅延するOS境界の合成試験を追加した。
R2 listener/runner自体はmockせず、実Node serverのbind/取消/close経路を通した。

- 期限内：起動直後の取消でclose完了通知を保留すると、修正前は終了票が早返しされた（期待falseに対しtrue）。
  修正後は未終了のまま待ち、通知解放後だけ`cancelled/cleanup=complete`になる。
- 期限超過：close通知を保留し、短縮cleanup予算40msで`cleanup_incomplete`を返す。
  後から通知を解放しても終了票は変わらず、ready/issuer通信は0回、外部Abort購読なし、固定portを再使用できる。

追補後の確認：

| コマンド | 結果 |
|---|---|
| `bdo npm test -- tests/review/r2-loopback.test.ts` | 71件PASS（既存46+runner25） |
| `bdo npm test -- --maxWorkers=2` | 108ファイル、2,809件PASS |
| `bdo npm run type-check` | PASS |
| `bdo npx eslint src/review/r2-runner.ts tests/review/r2-runner.cases.ts` | エラー/警告0 |
| `bdo npm run test:pack` | build・361ファイル梱包・production-only導入・worker/MCP smoke PASS。R-2非同梱を維持 |
| `bdo git diff --check` | PASS |

実機操作・token発行・設定変更はせず、telemetry調査も保留を維持した。
SIGINT再入力時の強制終了・本人IDの一致による安全側拒否は今回変更していない。§5の留保は継続する。
