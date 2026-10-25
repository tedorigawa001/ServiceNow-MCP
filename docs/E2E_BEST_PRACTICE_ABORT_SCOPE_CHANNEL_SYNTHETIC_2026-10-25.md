# AU-BR-006 strict wire・相関・上位診断ownerの合成検証

Date: 2026-10-25。対象は[接続設計§10](BEST_PRACTICE_ABORT_SCOPE_CONNECTION_CONTRACT_DESIGN.md#10-合成channelの実装範囲)。実worker/実認証/実PDIのE2Eではない。

## 実装範囲

- strict envelopeと全5要求/6応答kindのbodyを型付きschema化。target/metadata/site/位置/観測row/比較結果まで追加キー・必須欠落・型強制を拒否する。比較status/理由/phase/固定limitationsの整合も検査する。
- 合成peer参照、run nonce/worker世代、要求番号、job、期待kindとphaseを照合する。同時要求1件、再prepare・重複応答・古い要求への応答・失効後の再開を拒否する。
- 最初のprepareのinstance/Update Set/開始時刻/期限幅と後続jobを結ぶ。prepare target、観測のhash/phase/name、compareのhashも照合する。
- 診断ownerは最初のstage/codeを保持し、cleanup未確認をconfirmedで上書きしない。生例外/本文/nonceを診断へ出さない。asset-localのprepare抽出拒否は固定診断として別途保持する。
- wire/plan/siteの下位上限は合成用定数。本番の追加運用capを承認・投入したものではない。

## 実行結果

| 検証 | 結果 |
|---|---|
| channel・比較接続・phase・owner・純粋比較器の関連5テストファイル | 189 tests成功（channel57、既存関連132） |
| `bdo npm run build` | 成功 |
| 新規source2ファイルとchannelテストへの`bdo npx eslint` | 問題なし |

実行：`bdo npx vitest run tests/review/abort-scope-evidence-channel.test.ts tests/review/abort-scope-evidence-comparison-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts`。

全kindの正常構造、再帰的な全必須object fieldの欠落、root/body/nested追加キー、wire不正/サイズ、UTF-8 payload上限、safe integer/job上限を確認した。peer clone/別peer・相関不一致・idle/pending両方での重複/遅延、順序違反、後続jobのrun結合、site累計上限、typed errorのstage対応、取消/期限失効/worker終了後のprimary保持、cleanup未確認の非上書きを試験した。

network/実時計/timer/console.logを禁止した正常exchangeも成功。config/bodyのgetter由来例外は固定理由に変換し、秘密markerを診断へ出さないことを確認した。body検証中のgetterによる再入取消でもwireを返さず停止する。合成wire要求には解析入力payloadを含むが、利用者向けレビュー結果/ログへの出力ではない。

## 制限・未実施

合成scalar/peerとメモリ内の要求台帳だけの検証で、実session/source/Worker/portへの結合は未確認。実ready通知・XML/AST計画生成・比較器実行・本番completion発行・上位レビューJSONへの格納は接続していない。既存の合成証拠ownerとの一体接続も未実施。

実時計による60秒期限、50/55秒phase、HTTP受信/試行予約、OS解放、allocator保持量/全体work上界は検証していない。diagnosticのcleanupは合成通知であって実解放証拠ではない。JSON.parseは重複キー検出専用parserではない。

`npm pack --dry-run --json --ignore-scripts`を検証process限定の一時cache指定で実行し、369 files中`dist/review/abort-scope-evidence*`が0件であることを確認した。既存設定は変更していない。全体合成テスト/依存インストールを含む梱包完全検証は今回未実行。公開schema・登録・明示14/既定3規則・固定評価セットは変更なし。VM/監視/telemetry保留・Unknown・全体受付無効を維持し、実worker接続・実機操作・トークン発行・設定変更・本番cap/permit発行は行っていない。
