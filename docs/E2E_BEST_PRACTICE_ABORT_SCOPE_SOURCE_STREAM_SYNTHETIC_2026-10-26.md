# BR-006 初回source／stream一体接続・合成検証（2026-10-26）

## 範囲

合成固定source issuer、合成stream、予約台帳を初回観測に限って接続。実PDI E2Eではない。実transport／worker／BoundedReadSession／ReleasePermit／時計への接続、設定変更、Pushは行わない。VM／監視／telemetry調査は保留、Unknown・全体受付無効を維持する。公開規則数・既定規則・0.2/0.3公開JSONは変更しない。

## 実装と所有権

- streamが受信したbodyをEOF・UTF-8・JSONで検査し、cleanup confirmedの後だけopaque receiptを発行する。
- receiptは同harness／table handleへの参照結合、一度限りの消費、未消費最大1件。停止／closeで保持body参照を破棄する。物理ゼロ化は保証しない。
- compositionは合成session/source/issuer/read票とstreamをprivateに所有。固定GET descriptorから受信したbodyだけを正規化し、必要5列の凍結観測を返す。任意frame／raw bodyの投入口を設けない。
- 全byteとHTTP試行はstream／予約台帳が一度だけ課金する。retryの失敗body、超過chunkを返金しない。正規化時の文字列上限検査は再課金ではない。
- stream失敗でcompositionを失効し、先行codeを保持する。404／retry枯渇／下位capの局所unavailable継続はこの段階では未実装で、同日の[最終stream記録](E2E_BEST_PRACTICE_ABORT_SCOPE_FINAL_STREAM_SYNTHETIC_2026-10-26.md)で実装した。0件等の正規化unavailableはUnknownとして返す。
- 受理2xxを正規化用200として渡すだけで、実HTTP statusの証明は発行しない。fixtureの時刻・release/ready設定も実測証拠ではない。

## 検証条件

新規22件：固定GET／必要列projection、独立した受信chunk長合計とC/R/Tの期待値、503→成功retry、JSON不正、別table混入、401/403、cleanup reject/無応答、下位cap超過、取消中のreadと一度だけのcancel、close中のlate応答、二重初回、0件Unknown、区間外時刻、receiptのclone/他harness/別table/再消費/失効/未消費中の再発行、dispatch前取消を確認。

独立byte oracleはテスト側で送ったchunkのbyteLengthだけを合計し、製品の会計関数を呼ばず統計と比較する。単一成功はC=1/R=6/T=1、1回retryはC=2/R=6/T=1を独立期待値とする。既存のstream／予約台帳oracle試験も再実行する。

## 実行結果

- 関連9ファイル：393件成功（新規22件を含む）。実機試験は未実施。全リポジトリ試験の結果は最終stream記録を参照。
- 初回buildはclose helper内で成功unionの絞り込みが保持されずTS2339で失敗。成功handleをconstへ取り出す修正後、最終`npm run build`は成功。期限や受信上限は緩和していない。
- 変更したsource2ファイルと新規testのESLint成功、`git diff --check`成功。
- `npm pack --dry-run --json --ignore-scripts`：369ファイル、`dist/review/abort-scope-evidence*`は0件。process限定の一時npm cacheを使用し、設定ファイルは変更していない。梱包dry-runであり、実インストール／実行の検証ではない。

## 残課題

最終parent→metadata→table再読、局所失敗／E閉鎖skip、最終seal、選択metadata/payload／job結合、cacheのjob別配送、上位診断owner、実session／transport／worker接続。今回の初回用subsetを本番権限・全体完了証拠として利用しない。非同梱prefix `!dist/review/abort-scope-evidence*`を維持する。
