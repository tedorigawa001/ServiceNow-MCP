# AustraliaのBR保存値・旧入口テンプレートの互換修正

Date: 2026-10-17。オフラインPoC。PDIへのアクセス・書き込みは実施していない。

## 1. 根拠と再現

利用者のPDI調査報告では、`sys_choice`の有効なasyncの保存値は`async_always`、
displayは`before_display`。旧`async`は無効な選択肢だが既存レコードに残っている。
これは利用者提供の実機観測であり、本修正で独立に再照会した結果ではない。

ソースではAU-BR-002の文脈判定と検出器への入力が`async`に限定されていた。
また、入口引数をプラットフォーム由来とする例外が単一IIFEだけだったため、
旧`X(current, previous); function X(current, previous) {...}`の仮引数を一般の束縛と扱っていた。

先に回帰テストを追加し、以下の失敗をそれぞれ再現してから修正した。

- `async_always`のprevious参照・changes呼び出しが`missing_context`になる。
- 旧宣言型入口の`current.update()`で候補が0件になる。

実データのスクリプト本文は使用せず、すべて架空のコードで確認する。

## 2. 保存値の対応

現行`reviewUpdateSetPayload`のみ、payloadから抽出したwhenを次のように正規化する。
元payload・コード・各ハッシュは書き換えない。

| 保存値 | 内部での意味 | AU-BR-002 |
|---|---|---|
| `async_always` | async | previous/changes系の候補を検査 |
| `async` | async（既存データとの互換） | 同上 |
| `before_display` | display | 評価済み、async由来の候補は出さない |
| `before` / `after` | 同名の意味 | 同上 |
| 欠落・空・`display`・その他の値 | 不明 | `missing_context`でスキップ |

AU-BR-007のdisplay規則自体は未実装で、引き続き`unsupported`。
将来実装するときも画面表示名でなく、この保存値の対応を使う。
履歴再現専用の`reviewUpdateSetPayloadLegacy`は元の契約を維持する。

## 3. 旧宣言型BR入口の限定的な例外

資産種別がBusiness Ruleの場合だけ、以下の構文を認識する。

- トップレベルの直接呼び出し`X(current, previous)`。
- 同じトップレベルに、同名のFunctionDeclarationがちょうど1件。
- 仮引数も厳密に`(current, previous)`の2個。async関数・generatorは除外。
- 外側でcurrent/previousが宣言されていない。
- X、current、previousへの識別子代入・更新・変数宣言による曖昧さがない。

書き込みは、代入・分割代入・更新演算子・for-in/ofの代入先を含めて検査する。
保守的な名前ベースの除外なので、入れ子の別スコープの同名書き込みでも入口認識をやめる。
プロパティへの代入は識別子自体の再代入とは区別する。
呼び出しと宣言の順序や関数名には依存せず、他のトップレベル文があってもよい。

一致した関数のcurrent/previousだけを入口束縛として初期化し、既存の字句スコープ・
同一関数内の別名追跡を適用する。入れ子関数で入口を直接参照する字句捕捉は維持するが、
ユーザー別名の関数間伝播は追加しない。

引数違い、入れ子の呼び出し/宣言、関数式への代入、optional call、call/apply、
再代入・重複宣言・外側の束縛による曖昧さは認識しない。
単一IIFEの既存入口規則も維持する。一般の呼出し先解決・到達可能性・引数/戻り値解析は
範囲外であり、ここで実行経路の確認済みとはしない。

## 4. 新規互換ケースと固定評価の分離

[新規互換セット](../tests/review/br-compatibility.test.ts)は35テスト。
`filter_condition/item`、`sys_translated_text action="delete_multiple"`、
`sys_es_latest_script`を含む架空の封筒を使う。既定のwhenは`async_always`。
旧async互換も別に検査する。旧入口の正例4件、除外すべき形27件、クライアント資産との
区別、AU-BR-007未実装の明示を含む。これは互換回帰であり、独立した品質評価v0.3ではない。

スコープ境界テストにも保存値・旧入口の再現9件を追加した。
固定済みv0.2のケース・採点契約・初回結果・前回のscoped結果は変更しない。
互換修正は既存bp3-0.2の範囲内であり、新しい規則や確認項目を追加しない。

## 5. ローカル検証

完了前検証で以下を確認する。PDI再照会や本番品質の承認の代わりにはしない。

| 検証 | 結果 |
|---|---|
| `bdo npm test -- tests/review` | 10ファイル・197件成功 |
| `bdo npm test` | 75ファイル・2,021件成功 |
| `bdo npm run build` | 成功 |
| `bdo proxy npx --no-install eslint src/review tests/review` | 成功 |
| 固定v0.2再評価 | 保存済みscoped結果と完全一致。TP30/FP0/TN18/FN6、契約充足36/54、確認項目充足6/18、品質未承認を維持 |
| 固定ケースと既存JSON結果のgit差分 | なし |
| `bdo git -c core.fsmonitor=false diff --check` | 問題なし |

本文の非返却・candidate/low/info・上限超過の拒否・一般の関数間解析なしを維持する。
未対応テンプレートや未知の保存値は引き続き限界として残る。候補0件は安全性の保証ではない。
