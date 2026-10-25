# AU-BR-006 合成issuer→純粋比較器接続の検証

Date: 2026-10-25。対象は[owner設計§13](BEST_PRACTICE_ABORT_SCOPE_OWNER_DESIGN.md#13-合成issuerから純粋比較器への接続)。実PDI/実認証のE2Eではない。

## 範囲

- 同owner/jobの3phase票を消費して、合成context/payload/初回/最終観測のhandleを既存factoryで内部生成する。handleは外へ返さない。
- 選択asset/context/payload hashの対応・観測phaseを照合し、不一致/不正でsticky停止する。
- `compareAndConsume`は既存consumeと共有するone-shot claimを使い、readyかつ全証拠がある場合のみ比較器を呼ぶ。比較receiptは従来の状態遷移receiptと別型・別WeakMapで管理する。
- `rejected`は固定reasonをprimaryに保持して停止する。`insufficient`/`changed`も再比較はせず、Unknownと制限を保持したまま一度だけ受理する。
- 取消/終了/worker終了後、二重比較、clone/他owner/生比較結果による偽造receiptを拒否する。消費/失敗/close時に内部証拠参照を削除する。

## 実行結果

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/abort-scope-evidence-comparison-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts` | 4 files / 130 tests成功（比較接続26・phase26・owner22・比較器56） |
| `bdo npm run build` | 成功 |
| 変更2ファイルへの`bdo npx eslint` | 問題なし |

比較器spyで最初の比較1回・二重要求後も計1回を確認した。asset/hash不一致、context不正、初回/最終phase違い、停止理由のunavailable化拒否、宣言時刻の期限境界、table binding拒否、証拠欠落、他jobへの停止伝播、終了後の票拒否を確認した。mutable fixtureの変更で出力が変わらないこと、ネットワーク・実時計・timer・console.logを呼ばないことも合成試験した。

## 制限・未実施

合成issuerは誰でも作成でき、自己申告したfixtureを検査するだけ。実認証・選択metadataの実取得・本文由来hashの証明にはならない。時刻は与えた値の整合検査で、実時計による停止保証ではない。実source/ReleasePermit/worker IPC/上位レビュー出力へは未接続。公開JSON・明示14/既定3規則・純粋比較器・固定評価セットに変更なし。

全体合成テスト・梱包完全検証は今回未再実行。新moduleは既存の`!dist/review/abort-scope-evidence*`除外内。前回の梱包完全検証中断を解消済みとは扱わない。

VM/監視/telemetry調査保留・Unknown・全体受付無効を維持。本番cap・完成parts・permitを発行せず、実機操作・トークン発行・設定変更は行っていない。
