# RC-01：release比較入力・非実行draft型・family境界の合成検証

Date: 2026-11-01 / Baseline: `39a3225`。実通信・PDI操作ではなくローカル合成検証。

## 1 対象と除外

[設計draft-0.2](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARATOR_DESIGN.md)のRC-01だけを実装した。

- `release-comparison.ts`：strict構造parser、readonly入力、非実行draft／結果の型。parserのokは構造受理で、release decisionのokではない。
- `release-family.ts`：importなしの5family tuple・whole-string正規化／catalog match。catalog関数のwrapperと設定／結果schemaが同じ定義を参照する。
- draft値の生成・policy期限／issue自己整合・観測優先順／limitations比較はRC-02で未実装。実sourceへの採用、実Permit発行、friend撤去、正式発行口、全体受付は変更しない。
- 既存public release decisionの可変性、非200 catch、認証／取得／予約／worker経路は変更しない。旧試験は残し、旧case対応表の分類・件数は据置き。

設定日時の長さ上限は承認待ち。asserted_at／expires_atは既存ISO検査と文字列を保持し、新maxを設けない。owner日時は設計案どおり40文字。全入力byte／work上界、壁時計逆行と上位結果時刻の整合は未確定で、Unknownを維持する。VM／監視／telemetry調査も保留。

## 2 RED → GREEN

1. 固定入力をfresh copy／freezeし、decision／permitを返さない1件を先に追加。未作成moduleで失敗を確認してから最小parserを追加し成功。
2. getter／Proxy／revoked Proxyの拒否を追加。最初はgetter値が受理される失敗を確認。反射前のisProxyとown data descriptorコピーを追加し、trap／getter実行0で成功。
3. 既知family5件・trim／大小文字・未知値／接頭辞の独立表を追加。未作成family moduleで失敗後、最小値moduleと既存wrapper／schemaへの共有接続で成功。
4. observation tagとobserved_atの組合せ・行上限を追加。complete_200でobserved_at欠落が受理される失敗後、構造整合検査を追加し成功。

追加の固定拒否表はmodel違い、未知key、row余剰列、hash case、deadline境界、ISO／owner日時長、明示undefined、設定family誤字、関数／Promise／Buffer／特殊prototype／symbol／循環／疎配列／余剰array key／非enumerable／assertionなしissueを扱う。固定invalid_inputだけを返し、raw値・例外本文を出力しない。

長い設定小数秒は既存設定schema／新parserの両方で表現保持を確認。not_requestedのbinding不一致条件、反復fresh copy／deep freeze、Date.nowを使わないこと、observed_at≧started_atを追加しないことも確認する。新規unitは2ファイル29件。期待値は固定family表／構造契約から記述し、既存sourceの返値だけをoracleにしない。

## 3 実行結果

| 確認 | 結果 |
|---|---|
| `npm run build` | 成功 |
| 新規2ファイル | 29件成功 |
| 新規＋release-gate／operator-release-fallback／source-release-binding／private-composition-ack | 6ファイル137件成功 |
| 新規unit2ファイル＋compile-only type fixtureのstandalone TypeScript | エラー0。readonly変更、Permit参照、true権限、limitations変更の`@ts-expect-error`が成立 |
| `node tests/review/package-http-classification.mjs` | 成功。425ファイル。新kernel各4artifactを同梱し、開発root／旧fixture専用口の非同梱を維持 |
| RC-01 compiled fixture | 固定入力・fresh frozen copy・Proxy trap0・family値・非Permitを確認 |
| 全体合成テスト・通常並列 | 223ファイル／9,800件中9,784成功・16失敗・pending 0。初回失敗を下記に保持 |
| 初回失敗4ファイルの分離再実行 | 4ファイル133件すべて成功。製品／テストの期限変更なし |
| 全体合成テスト・maxWorkers=3 | 223ファイル／9,800件すべて成功・失敗0・pending 0。約149秒。期限値・製品／試験コードは変更なし |
| whitespace差分 | `git -c core.fsmonitor=false diff --check`成功 |
| 更新6文書のローカル参照 | 83リンクの参照先存在を確認 |

梱包のAST検査でfamily moduleはimportなし、比較入力kernelはzod・node:util・familyのみで、動的import・require・root re-exportがないことを確認した。ReleaseEvidenceのimportはtype-onlyで、生成JSから除かれる。既存compiled source／construction／native-status関連fixtureも同時に通過したが、これをB-03の別assembly compiled保証へ読み替えない。

### 初回全体実行の失敗と切分け

JSON記録：`/tmp/servicenow-rc01-tests-20261101.json`。`trusted-config-file`1件はtrusted temp rootのACL listing unavailableと、そのsetup失敗に続く未設定pathのteardown失敗。`http-classification-legacy`1件・`target-selection`3件は5,000ms timeout。`update-set-adapter`は1件の5,000ms timeoutと、続く10件の`outcome.isError=false`期待の不一致だった。後続10件の具体的codeは初回assertion出力にないため、review_busy等と断定しない。

systematic-debugging手順で既存fixtureを読み、ACL補助が固定1,000msの外部listingを用いること、adapter試験のtimeout後も未完了runが残り得ることを確認した。今回このfixture／adapter／期限は変更しない。4ファイルだけを同じ期限で再実行したJSON `/tmp/servicenow-rc01-isolated-20261101.json`では133/133成功し、初回失敗は再現しなかった。さらに全体をmaxWorkers=3で単独再実行したJSON `/tmp/servicenow-rc01-bounded-tests-20261101.json`では9,800/9,800成功した。同時負荷の影響と整合するが、再実行成功だけで各原因を確定済み・通常並列の再発を解消済みとはしない。並列数だけを変え、timeout値・ACL要件・製品実装は緩和していない。JSONはローカルの一時成果物で、恒久保存はこの集計・失敗理由による。

## 4 残課題と禁止境界

次はRC-02：policyの日時／issue整合、観測の優先順、limitationsの固定順、非実行draft値のfresh deep freezeを独立oracleで実装する。RC-01 parser成功だけでpolicy整合やrelease matchedを認定しない。RC-03の実source／開発sourceの固定採用点、private guard、非200移行、実Permit結合は別工程。

設定日時長の承認、全体byte／work上界、上位clock整合も未完了。本番cap投入・全体受付・正式発行口・fallback等を有効化しない。実接続・実通信・実機操作・トークン／Permit発行・設定変更・Pushは本検証に含めない。

## 5 コミット対象限定の再検証

RC-01の17ファイルだけをindexへ登録し、index全体を`/tmp/servicenow-rc01-commit-20261101/`へ書き出して再検証した。依存は既存node_modulesへの参照を使用し、生成distはこのコピーでbuildした。無関係な未追跡`.vscode/`・`CLAUDE.md`はコピーにも含まれないことを確認した。

- `npm run build`：成功。
- 新規unit2ファイル・compile-only type fixtureのstandalone TypeScript：エラー0。
- `node tests/review/package-http-classification.mjs`：425ファイル、全compiled fixture／梱包境界の確認成功。
- `npm test -- --maxWorkers=3 --reporter=json --outputFile=/tmp/servicenow-rc01-commit-tests-20261101.json`：223ファイル、9,800件成功、失敗0、pending 0、約72.5秒。全体テストは他のビルド／試験と重ねず単独実行し、期限値は変更しなかった。

§3の通常並列・初回16件失敗は消さず保持する。この限定再検証の成功を、通常並列の再発解消やRC-02／03・実Permit結合の完了とは扱わない。再検証後の追加は本節の記録のみで、実装・試験条件は変更していない。
