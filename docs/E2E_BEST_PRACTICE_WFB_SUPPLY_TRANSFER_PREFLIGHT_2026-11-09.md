# WF-B：下位移譲preflightの合成検証

Date: 2026-11-09 / 基準HEAD: `35c1d2a` / Status: 第1段階の合成依存のみ。

親：[下位移譲設計draft-0.3](BEST_PRACTICE_WFB_SUPPLY_TRANSFER_DESIGN.md)。実source／期待値pin・S発行・core／実接続・通信・設定変更・Pushは行っていない。正式発行口閉鎖・C実行入口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。

## 対象と停止線

- 同compositionのprivate継続だけから同CanonicalSupplyAssemblyの発行物をcaptureするSupplyIssuanceAnchor。
- 別brandのNonExecutingSupplyTransfer（state=unusedのみ）と同owner／source／anchor／receiverに結合した空pending／holder／failure shell。下位claimを消費するmethodはない。
- 消費前拒否・失敗後の再準備拒否・先行診断保持・正規closeとの区別・固定finishでの準備参照clear。
- 旧B／C-start／供給準備factoryのfacade／結果／旧export集合を維持。compositionへ新診断factory1つ、薄い入口1つだけ追加。

正常準備では原ownerのregistry／table／viewを保持する。claimsIssued=1に対してclaimsConsumed=sourceDetaches=holderPublications=0、各shellのpayloadは空。anchorが本文へのstrong referenceを保持し得ることをretainedAnchorとして診断する。claim・shellのissued aliasも保持診断へ含め、参照clearとborrow退役の順序を確認する。物理解放・GC・全heap／work・実OOM時の診断必着は証明しない。

## 合成対照

新規54件：正常1、生成故障6、単独混入40、元供給失敗1、正規close2、二重準備1、prefix oracle1、hook非実行1、終端／秘密非出力1。

単独混入はanchor9項目、claim7項目、pending／holder／failure各8項目。他の参照を整合した固定内部scriptを用い、候補から期待値を作るだけの自己照合を避ける。有効基点はnormal。任意のobject／function／Proxy／facade／summaryは入力採用せず、Proxy hook実行0。

独立prefix oracleはanchor→claim→pending→holder→failure→preの有限順序を別記述し、各故障点の生成済み件数を数える。全prefixで下位claim消費・source detach・holder公開・open／read／hash／resource cleanupは0。存在しないfailure shellへ責務移譲済みとは報告しない。既存の供給準備claim／開始claimは返却しない。

compiled ESMでは旧75ケースsource grid・B変異8・供給変異6を維持。新しいidentity変異24と退役変異7を全検出した。identityはanchor9、claim7、shell共通8。anchorのtable／view同一性はcurrent／issuedの二条件を組で除去し、他は単条件除去。退役はcurrent／issuedのanchor・claim・shell保持漏れ6、元borrowの先行退役1。試験コードと同じ検査式を期待値としてimportせず、固定故障selectorの受理／拒否と終端保持を外側から確認する。

## RED／初回失敗

1. 最初の1件は未作成の薄い入口moduleをimportできず失敗。その後最小の合成preflightを追加して成功。
2. 初回strict型検査はunique-symbol brandのtrueがbooleanへ拡張され、claim代入と後続shellのclaim型に2件のエラー。Object.freezeへNonExecutingSupplyTransferの文脈型を与え、同じ型検査を再実行して成功。型castによる正常経路の回避はしていない（不正値castは固定故障scriptだけ）。
3. issued aliasの保持・退役順序を検証する診断を追加する前、正常／終端の2件が期待field不足で失敗。その後保持診断とanchor退役時のborrow保持booleanを追加し、54件すべて成功。

既知の失敗を削除・期限延長で隠していない。既存Bのcap／D_stop／D_end／guard上限は変更していない。

## 最終検証

| 確認 | 結果 |
|---|---|
| 関連Vitest | 22ファイル・1,462件成功（新規54件を含む） |
| 変更したTS fixture／testのstrict noEmit | エラー0 |
| 変更したTS／MJSのESLint | 指摘0 |
| npm run build | 成功 |
| compiled-declared-actual.mjs | sourceGrid75、旧変異8＋6、新identity24＋退役7、薄い互換入口5、C実行なし |
| package-http-classification.mjs | offline dry-run441ファイル、全compiled対照・seeded梱包漏洩負対照成功 |

関連試験の実行コマンド：

```sh
bdo npx vitest run tests/review/canonical-supply-transfer.test.ts tests/review/canonical-supply-view.test.ts tests/review/snapshot-read-composition.test.ts tests/review/read-hash-declared-actual.test.ts tests/review/read-hash-kernel-extraction.test.ts tests/review/snapshot-read-start.test.ts tests/review/read-hash-capacity.test.ts tests/review/read-hash-fake.test.ts tests/review/read-ops-fake.test.ts tests/review/source-map-supply.test.ts tests/review/source-map-values.test.ts tests/review/carrier-coverage.test.ts tests/review/seed-bootstrap.test.ts tests/review/bridge-work.test.ts tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts tests/review/raw-json-boundary.test.ts tests/review/raw-json-syntax.test.ts tests/review/store-recorder-persistence.test.ts tests/review/store-recorder-binding.test.ts tests/review/fixed-evidence-store.test.ts
bdo npm run build
bdo node tests/review/fixtures/compiled-declared-actual.mjs
bdo node tests/review/package-http-classification.mjs
```

全repository回帰の再実行ではなく、この22ファイルの関連回帰である。梱包確認は実source内容hash照合ではなく、配布物へのfixture／factory混入拒否と既存のcompiled負対照である。

## 残課題

第2段階のtaking・pendingへの同参照記録・元通常slot detach・post検査、第3段階の非実行holder公開・移譲後discard claim・未確認保持・finish保留は未実装。今後取りかかる際は元ownerのclose／fail／finishがactive移譲の責務を消さない専用境界を先に接続する。今回の成功を移譲済み・cleanup確認済み・C実行可能の証拠にはしない。

## コミット対象だけでの再検証（2026-11-09）

今回の11ファイルだけを明示してstageし、index全体を一時ディレクトリへ展開した。既存node_modulesだけを参照し、作業treeの未stage内容を検証へ持ち込まず、上記と同じ関連22ファイル・1,462件、build、変更TSのstrict noEmit、変更TS／MJSのESLint、compiled-declared-actual、offline梱包確認を再実行してすべて成功した。compiled対照は旧8＋6、新24＋7、梱包441ファイル。再検証後の変更は本段落の記録追記だけで、検証済みコードとstage内容の一致を再照合した。全体回帰・実通信・C実行は追加しておらず、Pushも行わない。
