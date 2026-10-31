# SA-01：合成issuer・受理claim・非実行draft・close前消費の検証

Date: 2026-10-31。対象：[接続差分設計§10](BEST_PRACTICE_ABORT_SCOPE_STATUS_SOURCE_ACCEPTANCE_DELTA_DESIGN.md)。実source class／実session／native操作／通信は対象外。

## 1 実装範囲

固定case名のみを受ける開発専用fixtureのprivate constructorが、合成frame・terminal issuer・source用release-use claim・非実行draft・唯一のconsumerを生成する。15個の合成identityを照合し、外部の診断・token・callback・実sessionを受け取らない。runtime moduleは変更せず、fixtureの実採用入口を作らない。

claimはlookup／clockより前に消費開始し、外国tokenを拒否しても復元しない。body／statusは同claimを共有。受理は生存中のpre／post guardを経てclose前に確定し、返却時にはterminal／draftを破棄する。履歴は非実行・7権限falseで、fallback・permit・body ackを発行しない。

## 2 RED→GREENの記録

テストは固定fixtureの外部結果を使い、実装の分類helperやscenario列挙を期待値に流用しない。次の挙動を順に追加し、未対応時の失敗と対応後の成功を確認した。

| 追加した挙動 | RED | GREEN |
|---|---:|---:|
| 最初のclose前受理 | 1失敗 | 1成功 |
| 二重消費拒否 | 1失敗・1成功 | 2成功 |
| 外国token→正しいtokenでの再試行拒否 | 1失敗・2成功 | 3成功 |
| 13種類の参照混入 | 13失敗・3成功 | 16成功 |
| pre／post／draft中の取消・close | 6失敗・16成功 | 22成功 |
| body／statusのclaim競合 | 2失敗・22成功 | 24成功 |
| 403／404・no_body・非候補 | 8失敗・24成功 | 32成功 |
| guard失敗・外部診断・前提欠落／close | 16失敗・32成功 | 48成功 |
| method／generation混入・retry枯渇拒否 | 3失敗・48成功 | 51成功 |

上記REDは開発手順上の意図した未対応テストであり、既存製品の失敗件数ではない。入力拒否・秘密非出力・I/Oなし・freezeの回帰条件を追加し、最終専用59テストが成功した。

## 3 合成条件と観測

- 4つの正例（release403／404 × body／no_body）ではconsume1・accept1、acceptイベントがcloseより先。返却時のlive terminal／draftはなし。
- body→status／status→bodyは成功分岐最大1。二重消費後も最初の成功履歴を保持。
- 15参照の混入、外国token・token copy・診断／JSONを拒否。外国issuerの診断不変。
- guard内の取消／close／期限／例外／再入、逆行clock、ready消失でdraft破棄。回復後も再消費不可。
- hard／local HTTP、cleanup未確認、read開始、retry枯渇を候補外として保持。no_body≠EOF。
- getter／proxy・余剰設定を拒否。fetch／timer呼出し0。返却はfreezeされ、frame／token／consumerなし、C/G/P=0、権限7項目false。

## 4 最終検証

- `npm run build`：成功。
- 新source／専用testのESLint：成功。
- `npm test`：206ファイル・9,325テスト成功。専用59テストを含み、既存期限・上限は変更していない。
- `node tests/review/package-http-classification.mjs`：compiled SA-01 fixtureと既存status各段階が成功。offline・ignore-scriptsのpack dry-runで新module／fixture非同梱と配布runtimeからの非参照を確認（409ファイル）。依存取得・実通信は行わない。
- 差分の空白検査と関連MDの参照先検査を実施。
- 依存再取得を伴うpackage-workerは[前工程の環境制約](E2E_BEST_PRACTICE_STATUS_CONSTRUCTOR_BINDING_2026-10-31.md)を継承し、再実行していない。依存インストール後のworker smokeの成功を主張しない。

## 5 レビュー修正（2026-10-31）

- ready消失がpre-guardでは`invalid_state`、post-guardでは`evidence_binding_mismatch`となり、同じ前提消失の理由が段階で異なっていた。post-guardの前提検査を参照照合から分け、両guardとも`invalid_state`とした。`evidence_binding_mismatch`は参照の不一致に限る。
- pre-guard側の`pre_ready_lost`を固定caseへ追加し、post側の期待値を`invalid_state`へ変更。専用テストは60件。
- 変異確認：post-guardの前提検査を外すとready消失後に受理され1件失敗（確認後に復元）。
- 全体`npm test`：206ファイル・9,326テスト成功。`npm run build`、新source／専用testのESLint、`node tests/review/package-http-classification.mjs`（409ファイル）成功。
- 上記§4の件数（9,325テスト・専用59テスト）は修正前の記録として残す。

## 6 残課題と停止状態

合成frameは実認証snapshot・固定URL・実予算・`BoundedUpdateSetSource`の証明ではない。cleanupは合成記録、body分岐は非実行markerでありnative cleanupや200 body解析の再検証ではない。SA-02の実class／private継続へのfake接続、SA-03の承認後C方式判定は未実装。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持する。fallback／retry有効化・permit発行・実接続・実通信・実機操作・設定変更・Pushは行っていない。
