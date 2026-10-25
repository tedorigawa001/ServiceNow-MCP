# AU-BR-006 合成owner/session claim検証

Date: 2026-10-25。対象は[owner設計](BEST_PRACTICE_ABORT_SCOPE_OWNER_DESIGN.md)§11の基礎subset。実認証/実取得のE2Eではない。

## 1. 実装範囲

- 合成issuer内のWeakMapだけがsession/worker/job/owner/use/receiptを発行・認識する。空の凍結handleをJSON化しても内部identityやassetを返さない。
- sessionに生成claimを保持し、owner生成のworker検査より前に消費する。失敗後/close後も再発行できない。
- ownerとjobのsession/worker参照、useとjob、receiptとownerを結合する。同値scalar・clone・別issuerを代替証拠としない。
- 同asset再予約、二重consume/accept、別job消費はstickyに停止。取消・owner/session終了・worker終了後は未消費票も受理しない。先行理由と一度限りの生成claimはcloseで消さない。
- 発行job/予約は100件以下。外部通信・時計・timerは使用しない。合成worker handleの差を世代差として試験する。

## 2. 実行結果

| 確認 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts` | 2 files / 74 tests成功（新owner18・既存比較器56） |
| `bdo npm run build` | 成功 |
| `bdo npx eslint src/review/abort-scope-evidence-owner.ts tests/review/abort-scope-evidence-owner.test.ts` | 問題なし |
| `bdo npm run lint` | 終了0、0 errors / 374 warnings（全体の既存箇所を含む） |

梱包確認の初回はnpm既定キャッシュ書込みでEPERMとなり、pack検証は未到達だった。メッセージの所有者診断だけでroot所有と断定せず、既存cacheの権限・所有者・設定は変更しなかった。一時cacheを当該検証processの環境だけに指定して再確認した。

- `npm pack --dry-run --json --ignore-scripts`を同環境で実行し、結果JSONを検査：369 files、`dist/review/abort-scope-evidence*`は0件。ownerも既存比較器も非同梱。
- `package-worker.mjs`の再試行は依存インストールを含む全工程の終了結果を取得できず、中断（終了130）。本番依存だけのインストール/worker smokeの成功は今回主張しない。通常cacheの修復や依存設定変更はしていない。

## 3. 保証しない範囲・次工程

合成issuerは自由に作成でき、本番の発行権限を証明しない。合成receiptは比較結果もscope証拠も持たず、公開JSONや上位レビュー結果へ接続していない。現行比較器は従来どおり繰り返し可能。

prepare/初回/最終観測のphase、実時計/期限/signal、source/ReleasePermit/payload/hash binding、worker IPC/handshake、比較器接続、実resource解放・診断の上位格納は未実装。失効は合成ownerの受理拒否であり、メモリのゼロ化や実worker終了確認ではない。全体合成テストは今回未再実行。

既定3/明示14規則・MCP登録・公開契約・固定評価セットに変更なし。新module名も既存の`!dist/review/abort-scope-evidence*`除外対象。本番cap/完成parts/permitを発行せず、Unknown・全体受付無効・VM/監視/telemetry保留を維持。実機操作・トークン発行・設定変更は行っていない。
