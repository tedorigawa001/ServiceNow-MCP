# AU-CL-007：Client ScriptのDOM依存確認候補

Version: cl007-dom-0.1 / Date: 2026-10-25。

## 1. 根拠と位置付け

台帳のAU-SRC-002、[Australia公式 Design and processing](https://www.servicenow.com/docs/r/australia/api-reference/scripts/client-script-best-practices.html)の **Avoid DOM manipulation** 節をAIが2026-10-25に再読した。公式はDOM操作を可能な限り避け、GlideForm API等を検討すること、標準要素のIDや配置変更による保守リスクを説明している。人による採用承認は未実施。台帳のverified_onや固定評価セットは変更しない。

以下の受信側の区分・限定API・確認項目は本プロジェクトの実装方針であり、公式が個々のコードを違反と判定したことを意味しない。

## 2. 限定した検出範囲

- Client Script (`sys_script_client`) のpayload本文に限る。他の資産はrule_asset_mismatch。イベント種別には依存しない。
- 未束縛の`document`、未束縛`window`の`.document`、同関数内の限定別名を識別。引数・var/let/const・catch・独自クラス等による同名束縛はブラウザのdocumentとみなさない。
- `getElementById`（documentのみ）、`querySelector`、`querySelectorAll`の非optional・非spread・1引数呼出しを確認候補とする。非文字列/空文字のリテラルは未対応。動的引数は実行や文字列化をせず、セレクターの内容から所有元を推測しない。
- `document.body`、`document.documentElement`、document由来の単一検索結果内も文書由来として扱う。`querySelectorAll`の結果はコレクションなので要素由来を推測しない。
- 同関数の`document.createElement()`で得た要素と、その単一検索結果内は「作成した部分木」として別区分。createElement単独は検索候補にしない。DOM挿入・所有権・標準要素の混入がないことは証明しない。
- 既存の字句スコープ・限定別名・限定定数評価を使用。関数間伝播、一般のDOM型推論・CSS解析・DOM実行は行わない。各関数の構文を一度解析するため、呼出し到達性は確認済みとしない。

| 受信側の証拠 | 出力と残す確認 |
|---|---|
| document/body/文書由来の検索結果 | `dom_document_scope_review`。標準UIか自作UIかは未確認 |
| createElement由来の要素内 | `dom_created_subtree_review`。自作部分木の範囲・必要性・互換性を確認 |
| ローカルの独自オブジェクト・同名メソッド | 当該呼出しは候補にしない |
| 不明/混合/関数間別名・メソッド抽出経由等 | `dom_receiver_unresolved`。0件でも問題なしにしない |

`u_custom_*`のようなIDでも文書検索なら自作とは確定しない。逆に標準に見える名前でも標準UIとは確定しない。

## 3. 変更・未対応・防御

document/windowへの再代入、動的なmember書込、対象検索メソッド/createElement/document/body/documentElementへの書込、eval/with、追跡対象の受信側やメソッドの引数への持出しは保守的に未解決とする。遅延発行により、その後に検出した変更も候補の確定に使わない。同名メソッドへの書込が別オブジェクトであっても未解決にする場合がある（安全側の誤拒否）。

挿入/appendChild等へ作成要素を渡した後の所有状態、任意APIの戻り値、jQuery/gel等、コレクション添字、shadow DOM/iframe、他スクリプトによる変更、実際のUIやGlideForm代替の利用可否は未対応。すべてのDOM依存を検出する機能ではない。DOM書込自体の網羅検出も今回の範囲外。

候補は`maintainability / info / low / candidate`。全候補に`dom_dependency_review`、上表の区分1つを付与。標準UIの所有元・UI互換性の未確認制限は常に保持する。削除・置換・GlideFormへの移行を自動提案/実行しない。

## 4. MCP・JSON・上限

AU-CL-007は明示opt-in。最大12規則、既定3規則は不変。要求にCL007がある場合のみ`bp3-0.13`、他の要求は従来版のまま。0.2/0.3の外枠は維持する。本文・selector・ID・任意の受信側名を出力しない。

0.2の1件契約は区分をちょうど1つ要求し、対応制限とintrinsic確認項目が必要。集約では`dom_receiver_unresolved`があると`analysis_complete=false`を強制する。これは解析対象subset内の完了性であり、標準UIの確認済み/規則適合を意味しない。

100件+lookahead、payload/受信量、100候補、AST 100,000 visits/depth256、全体60秒・worker中断・認証固定・リリースゲートは変更しない。外部問い合わせは既存のbounded取得だけで、DOM解析から追加照会はしない。

確認項目profileは`bp-followups-cl007-0.1`。今回の[合成検証記録](E2E_BEST_PRACTICE_DOM_CLIENT_SYNTHETIC_2026-10-25.md)を参照。新規則の変更はCHANGELOGのUnreleasedにも記載する。

実PDIの確認・人の採用承認・独立した人手評価は未実施。VM/監視/telemetry調査は保留、全体受付と本番cap/permit発行は無効のまま。
