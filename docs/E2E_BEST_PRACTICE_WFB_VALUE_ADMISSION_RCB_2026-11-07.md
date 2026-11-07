# WF-B RC-B：2V／structuralの純粋受付と独立上界対照

Date: 2026-11-07 / 基準HEAD: `252dfbd` / 対象: 本作業の未コミット変更。

## 1 実装範囲

[差分設計 §12](BEST_PRACTICE_WFB_RPC_PRIVATE_VALUE_BRIDGE_DESIGN.md#12-rc-b純粋受付モデルと非接続境界)に従い、`tests/review/fixtures/value-admission-core.ts`へ`calculateValueAdmission(V, plan)`を追加した。19項目の元planを厳密にpinし、parse/value work配賦、元value／AST枠、2Vのlive論理node枠、3V+10のstructural枠を順に別単位で検査する。checked加算・乗算と固定理由を使い、等値許可・1不足拒否・overflow停止を維持する。

非実行成功DATAに同planの固定7項目ValueLimitsをprojectionし、value workをparser残量から再計算しない。結果・projection・算術試行数はfreezeし、元planの参照は残さない。失敗に部分projectionやraw例外を含めない。modelは`wfb-value-admission-rcb-1`、structuralは`wfb-value-structural-3v10-1`、valueは既存`wfb-value-core-work-1`。呼出し結果は常に`coreInvocation=not_called`／`bridgeWork=unmodeled`である。

raw入口・値engine・課金点・旧APIは変更しない。同root／planのprivate供給・claim・core前後のguardはRC-Cへ残す。callerのVやpublic summaryを証拠に昇格させない。旧v1・正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持した。証拠発行・本文保存・実接続・実通信・実機操作・設定変更・Push・コミットは行っていない。

## 2 独立検証とモデルの限定

- 論理treeとstructuralの等値・1不足を別々に検査し、既存value／AST上限も維持。正safe整数、19 field順・欠落／余剰・getter／Proxy／prototype・symbol・model欄混入を拒否した。入力hookは実行せず、秘密canary／stackを出力しない。
- BigInt oracleで通常256点とsafe integer境界7点の2V・3V+10を比較。配賦和／2V／3倍／+10のoverflowと先行tree拒否の優先を確認。算術試行・完了は最大4で、統合work課金ではない。
- 正常17入力は10 variant、全row、Metricのobserved／unavailable／not_supportedと600 sampleを含む。bytesをRP-Bへ与え、そのVを独立tree計数と照合した後、別呼出しのdetailed coreで全structural計数を確認した。control=`2V+9`、unavailable=`2V+10`、captured=`2V+10+M`（M=Metric数）。これらは独立試験の合成であり、同ASTを借用する正式な接続試験ではない。
- 全nodeの6種置換はraw成功526入力についてcharged prefixを`3V+10`および`min(3V+10,2V+1810)`と照合した。深さ超過でraw拒否された変異はparse／raw_limitと区別し、core検証へ混ぜない。field欠落／余剰／逆順、array上限の拒否prefixも比較した。
- 正常計数±1の診断変異は厳密oracle不一致、2倍の再walk風診断変異は保守上界超過になることを確認。sourceの課金点を実際に削除・追加したmutation testではなく、その保証を代替しない。
- 採用式は費目根拠が単純な3V+10だけ。別式は比較対象で、実受付への採用やoverflow時fallbackはしない。全有限JSONの形式証明ではなく、現行schema／課金とaliasなし有限ASTに限定したsource費目根拠＋有限独立corpusである。

## 3 REDと初回失敗の切り分け

1. 等値受付を要求する最初の試験がstubの拒否で1件失敗することを確認し、純粋計算器の実装後に成功へ変わった。
2. 拡張22試験の初回は20成功／2失敗。旧補助式がunavailableのstatus peekを落としており、43期待に対し実計数44となった。sourceの課金点を追跡し、controlとunavailableを分けて設計・独立oracleを訂正した。保守式3V+10やengineは変更していない。
3. node置換でscalarをcontainerに変えるとrawの深さ5を超える場合があった。上限は緩めず、そのraw拒否を別計上した。続く件数の仮定（600件超）も実corpusと合わなかったため、raw成功526件と全変異の分配式を固定した。
4. 601 sampleのfixtureはcutoff.sample_count=601で先にschema拒否となり、array capまで届かなかった。cutoffを600、arrayを601として先行schema不正を除き、目的のarray limit拒否を確認した。製品の拒否順序・上限は変更していない。

## 4 最終確認

| 検証 | 結果 |
|---|---|
| `bdo npx vitest run`（value-admission、value-core-detailed、snapshot-value、raw-json-boundary、raw-json-syntax、store-recorder-persistence、store-recorder-binding、fixed-evidence-storeの8ファイル） | **928件成功**。RC-B 24件＋既存904件 |
| `bdo npm run build` | 成功 |
| `bdo npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --strict --skipLibCheck tests/review/value-admission.test.ts tests/review/value-core-detailed.test.ts tests/review/snapshot-value.test.ts` | 成功。build対象外fixtureも型検査 |
| `bdo npx eslint tests/review/fixtures/value-admission-core.ts tests/review/value-admission.test.ts` | 成功 |
| ローカルnpmの`pack --dry-run --ignore-scripts --json`、実行時だけの一時cacheを指定 | 441ファイル。tests／docs／新coreの混入0。script実行・tgz生成なし |

配布境界は既存raw入口から新計算器／値engineへのimportなし、計算器から実engine呼出し・I/Oなしも検査した。梱包確認は`bdo node`からローカルnpmを呼びfile一覧だけを照合し、永続cache設定や権限は変更していない。今回、全体テスト・実通信試験・再採取は行っていない。

## 5 残課題

RC-Cの同root／同planからの固定private供給と呼出しclaim、model照合、pre/post・費目合流は未接続。bridge固定費・19field bootstrap reflection・core全work上界・post／破棄予約・一時container／scratch・運用cap・実heap／CPU／GC／ゼロ化はUnknown／未導出。これらが未完了な間、純粋受付成功からreadyなbridge・正式発行・全体受付を生成しない。model／schema・Metric数／sample上限・再walk・課金点変更時は式と対照を再検証する。
