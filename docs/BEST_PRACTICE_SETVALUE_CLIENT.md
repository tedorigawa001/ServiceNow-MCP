# AU-CL-005：Client Scriptの2引数setValue確認候補

Version: cl005-setvalue-0.1 / Date: 2026-10-25。

## 1. 根拠・承認状態

台帳AU-SRC-002の[Australia公式 Design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html)、**Use the setValue() displayValue parameter for reference fields** 節をAIが2026-10-25に再読した。公式は参照列で表示値を渡さない場合の取得往復と、既知の表示値を第3引数に渡す方法を説明する。

これは参照列を前提にした記述であり、任意の2引数呼出しが参照列・追加通信・性能劣化を意味しない。本プロジェクトは以下の限定構文を確認候補として返す。人による規則採用承認・独立品質評価は未実施。台帳のverified_onや固定評価セットは変更しない。

## 2. 受信側・引数の区別

- `sys_script_client`のpayload本文限定。onLoad/onChange/onSubmit等のイベント指定は要求せず、実際の実行経路は証明しない。他資産はrule_asset_mismatch。
- 未束縛の`g_form`と、同じ関数内で追跡できる限定別名・局所コンテナを識別する。字句スコープで引数、var/let/const、catch、独自クラスの同名束縛を区別する。関数をまたぐ別名の伝播はしない。
- 静的member、または既存の限定定数評価で`setValue`と分かる呼出しのみ。2つの明示引数、非optional・非spreadを条件とする。fieldの非文字列/空リテラルや、限定定数評価で不正と分かる値は未対応。
- 明示的な3引数呼出しは候補にしない。第3引数がundefined/空/誤った表示値でも、この規則では検査しない。「表示値が検証済み」「正しい」と認定した結果ではない。
- 値が空文字/nullのクリア操作も、2引数という構文候補に留める。表示値が必要か、通信が起こるかは人が確認する。通常文字列列や動的field名も、参照型と断定しない。
- 既知の独自オブジェクトの同名メソッドは除外。不明の受信側はg_formと推測せず、`setvalue_receiver_unresolved`。不明・混合・関数間別名、関数参照抽出やcall/apply経由、未対応の引数数/shapeは未解決として保持する。

## 3. 変更と制限

受信側/メソッドの引数への持出し、g_formへの再代入、setValue/dynamic memberへの書込、eval/with、未対応の分割代入等は保守的に停止・未解決とする。候補の遅延発行により、後続の改変も反映する。無関係な同名メソッドへの書込や分割代入でも未解決となる場合がある（安全側の誤拒否）。

辞書/継承/参照先・表示値・UI・キャッシュ・実通信は取得/実行しない。field名やsys_idの見た目で参照型を推定しない。既知文字列を渡していることも、正しい表示値の可用性の証拠にはしない。

出力は`performance / info / low / candidate`。全候補にrule_intrinsicな`reference_display_value_review`を付与する（profile: `bp-followups-cl005-0.1`）。型・表示値の可用性・UI互換性の未確認制限は常に残す。表示値取得だけの照会追加、引数の自動挿入/削除/置換は行わない。

## 4. 契約・取得・予算

明示opt-in、最大13規則。既定3規則は不変。CL005要求時だけbp3-0.14、それ以外は以前のrulesetのまま。本文・field名・値・資格情報は出力しない。MCPの0.2/0.3外枠と認証固定・リリースゲートを維持する。

1件のstrict契約は必須follow-upと限定範囲/型/表示値/UI制限を要求する。集約は未解決があるとanalysis_complete=falseを強制。解析完了は限定構文の処理完了であり、参照型・表示値・規則適合性の確認完了ではない。

取得100件+lookahead、受信量/payload上限、候補100件、AST 100,000 visits/depth256、全体60秒とworker中断は変更しない。追加の辞書照会等を行わない。

[合成検証記録](E2E_BEST_PRACTICE_SETVALUE_CLIENT_SYNTHETIC_2026-10-25.md)を参照。CHANGELOGにも追加。実PDI・人手承認は未実施。VM/監視/telemetry調査は保留、Unknown・全体受付無効・本番cap/permit発行の停止は維持する。
