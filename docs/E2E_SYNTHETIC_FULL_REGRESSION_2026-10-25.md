# 全体合成テスト再実行：R2待合せ・finally後始末改善後

Date: 2026-10-25（Asia/Tokyo）
Source: `315061941363c1f2380bd937f4c585bf99be82a6`
Status: 今回の全体合成テストは成功。自然失敗の再現率・過去失敗の原因確定・実PDIでの品質を主張するものではない。

## 1. 実行条件

[R2段階到達待ち・後始末改善](E2E_BEST_PRACTICE_R2_STAGE_WAIT_CLEANUP_2026-10-24.md)後の全体回帰。Node v24.18.0、darwin arm64。標準の`npm test`を使用し、結果回収のためJSON reporterと一時出力先だけを指定した。

```text
bdo npm test -- --reporter=json --outputFile=/private/tmp/servicenow-mcp-synthetic-3150619-20261025.json
```

`vitest.config.ts`を変更せず、既定のunit／real-hostプロジェクト構成を維持。real-hostは後段のgroupOrder=1、maxWorkers=3、既定testTimeout=30,000ms。個別テスト・製品の期限、期待値、retry設定は変更していない。製品runnerの385秒／cleanup 3秒、reviewの60秒、監督preflight 5秒も不変。ほかのビルド・検査コマンドをこの再実行と並行して走らせていない。

## 2. 中断した初回実行の扱い

先に実行した`bdo npm test`は会話中断後にセッションが失効し、最終stdoutとexit codeを回収できなかった。再開時に該当リポジトリの継続テストプロセスは確認できなかった。Vitestキャッシュには過去の異なる実行も混在しており、初回の正式結果として採用しない。

そのため、上記の専用JSON付きで全体を改めて実行した。これは記録を確保するための明示的な再実行であり、自動retryや、初回失敗を成功で上書きする扱いではない。中断実行の成否は未確認のまま保持する。

## 3. 正式な再実行結果

実行開始00:05:30、最終テスト終了00:06:35 JST。JSONのstartTimeと各fileのendTimeから求めた区間は64.36秒（Vitestの起動・report書込み・外側プロセス終了の全時間とは区別する）。コマンドexit codeは0、JSONのsuccessはtrue。

| 項目 | 結果 |
|---|---:|
| テストファイル | 129成功／129 |
| テスト | 3,444成功／3,444 |
| 失敗 | 0 |
| pending／todo | 0／0 |
| `r2-*.test.ts` | 19ファイル・625件、全件成功 |
| R2以外 | 110ファイル・2,819件、全件成功 |

R2 loopback内のnon-cooperative exchange／identity／payload取消3件、callback失敗前の到達待ち合流、exchange到達後のassertion失敗時cleanupは成功。loopback全114件、stage-scope全7件、supervisor全44件も成功した。従来失敗したsecret-output検査・normal host cleanupを含め、今回の実行で再失敗は出ていない。

今回の実行範囲では他機能の退行を検出しなかった。ただし合成テスト1回の成功で、間欠失敗の解消・再現確率ゼロ・全入力の安全性は保証しない。過去の失敗履歴・原因未確定の扱いは維持する。

## 4. 範囲外・維持事項

- 標準Vitest設定で除外される`tests/e2e`（実機E2E）、`tests/transport`の別設定実行は対象外。
- Rust/nativeの全試験、梱包検査、全体lint・ビルドの再実行は今回行っていない。直前コミットの関連検証と混同しない。
- 本文・資格情報・生のログを本書へ転載せず、JSONから集計した件数・状態だけを記録した。一時JSONはローカルの検証出力であり、Gitへ追加しない。
- ソース・テスト・実行設定は変更せず、今回の変更は本記録と参照更新のみ。既存の`.vscode/`・`CLAUDE.md`には触れていない。
- VM／監視・telemetry調査は保留。Unknown・全体受付無効を維持。本番cap・完成parts・permitは発行しない。
- 実機操作・実トークン発行・運用設定変更・Pushは行っていない。合成テストが所有する一時fixture・ローカル待受・子プロセスのみを使用した。
