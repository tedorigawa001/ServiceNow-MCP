# AU-BR-006 prepare・初回観測・最終観測の合成phase検証

Date: 2026-10-25。対象は[owner設計§12](BEST_PRACTICE_ABORT_SCOPE_OWNER_DESIGN.md#12-合成phase遷移の限定実装)。実認証・実取得のE2Eではない。

## 実装・検証対象

- 固定3phaseのbegin/finishを分離。pending中の二重開始と順序違反を拒否する。
- finish票はowner/use/job/phaseへ結合し、一度限り。clone・別issuer・別job・違うphaseでの完了を拒否する。
- final完了前のconsumeを拒否する。失敗後は正しい操作でも再開できず、session側生成claimも残る。
- 明示的phase失敗は`phase_failed`を保持し、closeで上書きしない。取消・owner/session終了・worker終了後のlate finishを拒否する。
- 既存ownerテストの正常consumeだけを3phase経由へ更新し、従来の結合・生成claim・診断保持試験を維持する。比較器・固定評価セットは変更しない。

## 実行結果

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run tests/review/abort-scope-evidence-phases.test.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence.test.ts` | 3 files / 104 tests成功（phase26・owner22・比較器56） |
| `bdo npm run build` | 成功 |
| `bdo npx eslint src/review/abort-scope-evidence-owner.ts tests/review/abort-scope-evidence-owner.test.ts tests/review/abort-scope-evidence-phases.test.ts` | 問題なし |
| `bdo npx vitest run`（全体、98c9fec時点の再確認） | 138 files / 3887 tests成功 |
| `npm run test:pack`（一時cacheを当該processの環境だけに指定、同上） | 本番依存だけのinstall＋worker smoke成功、369 files |

## 制限・未確認

phase完了は合成の状態通知だけであり、scopeが既知・観測成功という意味ではない。生データを受け取る入口は追加していない。available/unavailable観測の検証、実source/ReleasePermit/payload/hash結合、時計/期限/signal、比較器・worker IPC・上位caller接続は未実装。合成issuerが任意に通知できるので、本番の供給証拠として扱えない。

前回の梱包完全検証の中断は、一時cacheを指定した`npm run test:pack`の成功により[元記録](E2E_BEST_PRACTICE_ABORT_SCOPE_OWNER_SYNTHETIC_2026-10-25.md)で解消済み。新module名は既存npm除外に一致する。公開JSON・明示14/既定3規則は変更していない。

VM/監視/telemetry調査保留・Unknown・全体受付無効を維持。本番cap・完成parts・permitは発行せず、実機操作・トークン発行・設定変更は行っていない。
