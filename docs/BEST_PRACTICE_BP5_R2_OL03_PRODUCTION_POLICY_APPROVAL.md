# BP-5 R-2 OL-03：本番署名policyの選定・承認票

Version: draft-0.2 / Date: 2026-10-19 / Status: 未承認・値未確定

## 1. 位置付け

[署名設計](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)§8と[型付きpolicy契約](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)の人による判断を具体化する。
今回行ったのは既存設計からの承認項目整理だけで、公式資料の追加調査・実artifact観測・署名・設定変更は行っていない。
本票の作成・レビュー・コミットは本番policyの承認ではない。未確認欄を合成fixtureや開発端末の観測値で補完しない。
telemetry調査は保留。registryは未設定、通常のv2入口はUnavailable、runtime gateは92、permit未発行のまま。

## 2. 最初に人が選ぶ事項

| ID | 決定対象 | 選択肢・条件 | 状態 |
|---|---|---|---|
| PA-01 | Node署名の信頼元 | 公式artifactの署名を保持／別の管理署名を採用。後者は公式署名の置換を含む別工程・別承認が必要 | 未選択 |
| PA-02 | Nodeの公証要求 | Node単体の証拠を要求／公証済み配布物と展開後のexact bytes・署名・entitlementを結合する方式を審査 | 未選択 |
| PA-03 | launcher署名担当 | Developer ID Applicationによる署名を用意できる担当と、鍵/Appleアカウント利用の承認責任を非公開で特定 | 未確認 |
| PA-04 | 採用版・対象OS | 正確なNode patch版、Rust/Cargo/SDK、macOS product version/build、thin arm64適合を固定 | 未確定 |
| PA-05 | ledger移行の運用 | ledger-0.2/registryのschema名・上限・registry ID/policy IDの採番と再利用禁止の運用（C方式自体は採択済み） | 未承認 |
| PA-06 | entitlement値の型方針 | 初期契約でfalse・数値・文字列等の非bool型を期待値として拒否し、boolean trueだけを許す方針の採否 | 未承認 |

PA-05/PA-06は[型付きpolicy契約](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)§8の残る人の判断で、§4の3（registry bytesの作成）より前に決める。
選択だけでは開始を許可しない。どの案も以下の証拠と適合検証が必要。
Node単体の公証可否や公式artifactのentitlementを、本票では確認済みとしない。
既存設計に記録されたNode v24.18.0の1台・1版の観測は参考資料であり、採用版/本番allowlistではない。

## 3. 対象ごとの証拠・承認欄

実値と担当者識別情報は別権限の非公開承認記録へ保管する。公開MDには秘密・個人名・ローカル配備path・証明書全文を転記しない。
署名者情報は資格情報そのものとは別だが、既存設計の公開範囲に合わせ、公開票には実値を置かない。

| 項目 | launcher | Node | 必要な証拠/停止条件 |
|---|---|---|---|
| artifact版・入手/build経路 | 未確定 | 未確定 | source/toolchain/build receipt、Node入手物と独立した信頼元からのrelease検証 |
| 署名後最終SHA-256 | 未取得 | 未取得 | 最終bytes。署名前hashや単なるversion表示で代替しない |
| Team ID/identifier/証明書クラス | 未取得 | 未取得 | 採用artifactの観測と人の承認。display名や同一Team IDだけで許可しない |
| requirement template | 未承認 | 未承認 | 採用SDKの条件/OID/escapeを審査。合成template IDだけでは承認しない |
| 全static flags | 未承認 | 未承認 | 観測した全値と完全一致。合成値65536を本番値へ自動採用しない |
| entitlement | empty方針案、証拠未取得 | exact typed dictionary未確定 | 全key/型/値を審査。false/欠落/unknownを消さない。absence証明条件は別途必要 |
| layout/OS適合 | 未確認 | 未確認 | thin arm64と採用OS/SDKでの検証 |
| 公証・失効/鮮度 | 未確認 | PA-02未選択 | 配布物/展開後bytesの対応、offline検証範囲、期限・撤回責任を記録 |
| 残余リスク | 未承認 | 未承認 | JIT/debug/library validation等の各例外、同一UID侵害、起動前注入、更新競合を区別 |

採用artifactに初期parserが扱えない型/flag/archが必要なら、観測値を丸めず契約改訂を先に審査する。
quarantine除去・未署名fallback・検証省略・自動再署名を代替手段にしない。

## 4. 承認から組込みまでの順序

1. PA-01〜06と証拠取得計画を人が選択・承認する。実artifact調査、取得、署名、送信、配備はそれぞれ必要な権限を別途確認する。
2. 非公開領域で実値と根拠/観測日時/担当/承認期限を固定し、独立したレビューを行う。不一致や証拠欠落は未承認のまま停止。
3. 人が承認したexact policyだけでregistry bytesを作成し、新ID/raw digestを固定する。現物観測からの自動承認やtest registry流用は禁止。
4. 固定registryを含む信頼済みbuildを署名し、最終launcher hashを別receipt/ledgerへ記録する。registryへ自己hashを埋め込まない。
5. 実署名backend、closure、更新排他、exec直前再検証と適合試験がそろうまでは、reader有効化・permit発行を行わない。

承認票には、対象digest/版、承認者の非公開参照、判断理由、残余リスク、承認日・期限・撤回手順を含める。
registryの承認と、実PDI/token利用・アカウント/ACL変更・Pushの許可は別である。

## 5. 現在の停止点・次の入力

**PA-01（Nodeの公式署名を保持するか、管理署名へ切り替えるか）**から決める。
同時にPA-03の署名担当を用意できるか確認する。署名環境を用意できない場合は実運用を保留し、未署名へ切り替えない。
値の確定や人の承認は今回未実施。秘密の貼付けや署名鍵の提示は不要。
