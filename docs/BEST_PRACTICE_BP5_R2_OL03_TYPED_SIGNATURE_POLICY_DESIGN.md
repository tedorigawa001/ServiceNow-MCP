# BP-5 R-2 OL-03：型付き署名policy・registry/ledger移行契約

Version: draft-0.4 / Date: 2026-10-19 / Status: C方式を採択。policy/ledger-0.2 parser・安全なreader接続を内部合成検証済み。個別policy承認・実署名・本番reader有効化は未実施。

## 1. 目的と境界

[署名・entitlement詳細設計](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)§3.1/§4を具体化する。
[OL-01台帳設計](BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md)のroot activation→ledger hashの信頼順序を維持する。
現行ledger-0.1のentitlementは名前配列。旧schema/offline readerは維持し、0.2の専用schema/parser・registry参照bindingを別に追加した。
[0.2合成検証記録](E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_SYNTHETIC_2026-10-19.md)の純粋Contextを、root所有activation検査済みの証拠とはしない。実配備設定は変更しない。
runtime gateは必ず92で停止し、contract検証・型付き比較器の成功から実行permitを発行しない。
telemetry調査は保留。[純粋部品の実装/合成検証](E2E_BEST_PRACTICE_R2_OL03_TYPED_POLICY_SYNTHETIC_2026-10-19.md)と、未実施の実署名/registry組込み/移行を区別する。実機/PDI操作・署名/登録・token発行・設定変更は対象外。
以下はプロジェクト固有の仕様案。Apple APIの公式根拠は親設計§9を参照し、新しいOS動作を実測したとはしない。

## 2. 方式比較と推奨案

| 観点 | A：固定registry＋現行ledger | B：型付き期待値を次版ledgerへ全て記載 | C：固定registry＋参照専用の次版ledger |
|---|---|---|---|
| 正本 | 組込みの承認済みregistry | activationがpinするledger | registryのみ。ledgerはID/digest参照 |
| 既存契約 | 0.1の名前配列/文字列とregistryの二重管理が残る | strictな新schemaへ移行 | 新schemaで旧曖昧項目を削除 |
| policy変更 | launcher再build/署名/承認が必要 | 新ledger承認で可能。ただし対応型/意味の拡張は再build | registry変更は再build/署名/承認。既存policy選択も新ledger承認 |
| 誤設定の影響 | 旧項目の読み替え/不整合処理が複雑 | 広すぎる期待値を承認するリスク。固定の意味制約は別途必要 | 実行UIDのledgerだけで許可集合を追加/緩和できない |
| 保守 | 過渡策には小さいが期待値が重複 | 配備単位で監査しやすいが期待値が分散 | 更新コストは高いが正本と選択の責任を分離 |

**C（併用案）を利用者が採択（2026-10-19）**。初期の少数固定policyとfail-closed方針に合わせた判断で、A/Bを危険と断定しない。個別issuer/template/値の本番承認は未実施。
外部registry JSONを追加する案は信頼ファイル/更新排他の対象を増やすため初期案では採らない。
registryの配布URL・online更新・env/argv/MCPからのpath/ID上書き・未知ID探索を設けない。

## 3. 固定registryの契約

### 3.1 raw bytes・digest・自己参照の回避

schema名案は`bp5-r2-signature-registry-0.1`。承認済みのstrict UTF-8 JSON bytesをbuild時に埋め込む案。
registry digestは**埋込み元の生bytes**のSHA-256。runtimeで再serialize・キー並替え・改行変換して算出しない。
registry自身に自身のdigestは記載せず、別build receiptに記録し、ledger参照と組込みbytesの実digestを照合する。
launcher自身の最終binary hashはregistryに含めない（組込み内容と署名後hashが循環する）。
署名後のlauncher/Node hashはroot承認ledgerに残し、policy bytesのdigestとbinary bytesのdigestを区別する。

組込みregistryも、信頼済みbuild・launcherの署名/配備承認が起点である。自分でhashを計算できるだけで真正性の証拠にしない。
runtimeの外部registry読込や、test registryを通常起動に指定する口を設けない。
本番registry・発行者・Team ID・entitlement集合は未作成。架空の値を有効な本番policyとして登録しない。

### 3.2 schemaと意味制約

| 項目 | 型・意味 |
|---|---|
| `schema_version` | 固定`bp5-r2-signature-registry-0.1` |
| `registry_id` | 固定ID、最大128bytes。内容が変わったregistryは新IDにする |
| `policies` | 2〜32件。launcher/Node用を各1件以上。重複ID/未知roleは拒否 |
| policy `id` | 最大128bytes。異なる内容へIDを再利用しない |
| `role` | `launcher`または`node`。別roleへの流用を拒否 |
| `artifact_class` | 初期は`mach_o_thin_arm64`。正確なarch/subtype照合条件は採用SDKで承認 |
| `requirement_template_id` | 検査器が明示対応した固定templateのID。未承認/未知templateは拒否 |
| `issuer` | 固定anchor種別・証明書クラス・Team ID・signing identifierの型付き値。自由なrequirement文は持たせない |
| `expected_static_flags` | u32。実署名の全静的flagと完全一致。runtime bit必須、ad-hoc/linker-only・未知bit禁止の意味検査も実施 |
| `entitlement_expectation` | §4のtagged union。launcherは`empty`のみ |

issuerは初期案のApple Developer ID Application用の固定anchor/証明書クラスenumだけとする。
Team ID/identifierを検証済みtemplateへ埋め込む文字集合・長さ・escapeを固定し、任意の式を挿入させない。
templateの正確な証明書条件/OID・static flagの許可maskは未承認。schemaに適合するだけでは有効なtemplateとしない。
未知flagをmaskして一致扱いにせず、停止/再承認する。

registryは最大64KiB・JSON深さ8。未知キー・全階層の重複キー・不正UTF-8/BOM/数値・末尾データを拒否。
IDは非空の限定ASCII（英数字と`._-`）で完全一致。case fold・prefix一致・最新版推測はしない。
issuer値にはこのID用文字集合をそのまま流用せず、template用の契約を別に固定する。

## 4. entitlementの型・値の完全一致

### 4.1 期待値

初期契約は次の二つのみ。JSONは型の説明であり、実policyではない。

```json
{"kind":"empty"}
```

```json
{"kind":"dictionary","entries":{"SYNTHETIC_KEY":{"type":"boolean","value":true}}}
```

`dictionary`は1〜32 keys。keyは最大128 UTF-8 bytes、制御文字/NULなし。実policyでは承認したkeyを完全一致で固定する。
valueは固定tag `boolean`＋JSON boolean `true`のみ。false・1・`"true"`・array/object/data等を期待値に書いたらcontract拒否。
空entriesをdictionaryとして受理せず`empty`へ明示分類する。launcherの非空dictionaryはregistry自体を拒否する。
Nodeも`empty`を選べるが、実artifactの観測と人の承認が必要。Nodeの再署名/自動置換を許可する意味ではない。
wildcard・subset・optional key・汎用的な非bool型は初期契約に入れない。

### 4.2 観測値は期待値と別の型

adapterの観測は`dictionary`／`absence_proven`／`unsupported_or_unknown`を区別する。
dictionary内のvalueは、CFBoolean(falseを含む)・CFNumber・string/data/container/unknownを区別できる内部型へ投影する案。
期待値parserがtrueしか認めないからといって、観測したfalse/不明型を消したり「キーなし」に変換したりしない。
CFBoolean trueに対するCFNumber 1やstring `true`は拒否。raw CF object/blobは外部へ返さない。

| 期待値 | 観測値 | 判定 |
|---|---|---|
| `empty` | 型確認済みの空dictionary | 一致候補 |
| `empty` | 対応形式/取得flagsを確認してadapterが生成した`absence_proven` | 一致候補 |
| `empty` | 辞書キー欠落だけ、未対応DER/取得flags不足 | unknownとして拒否。空へ読み替えない |
| 非空dictionary | 同じkey集合、全valueがCFBoolean true | 一致候補 |
| 非空dictionary | key追加/欠落、false化、型変更 | 拒否。subsetやboolean変換なし |
| 任意 | 複数表現の矛盾、情報取得失敗、上限超過、不明形式 | 拒否 |

key順序だけを無視し、文字列のbyte表現と型付きvalueを比較する。Unicode正規化/case fold/trimで一致へ変換しない。
`absence_proven`の実API生成条件は親設計どおり未確定。合成比較の成功を、OSでabsenceを証明できた証拠にしない。
blob64KiB上限をadapter契約として維持する。false keyの除外や、unknown/errorを一致にする例外は設けない。
「一致候補」はpolicy比較結果であり、暗号的validity・OS実体結合・公証確認・実行permitではない。

## 5. 次版ledger-0.2の参照契約案

schema名案は`bp5-r2-launch-ledger-0.2`、outer policy ID案は`bp5-r2-outer-macos-arm64-0.2`。
既存のpath/hash/version・runtime/closure・UID/platform・世代/release・承認期間/receiptへのbindingは維持する。

| 変更 | 0.2案 |
|---|---|
| 追加 `signature_registry` | `{schema_version, registry_id, sha256}`。schemaはregistry-0.1固定、組込みregistryのIDとraw bytes digestへ完全一致 |
| 各binaryへ追加 | `signature_policy_id`。同じregistry内の一つのpolicyに解決し、launcher/nodeのroleと一致 |
| 各binaryから削除 | `signature_requirement`、表示用`publisher`、`hardened_runtime` bool、名前配列`entitlements` |
| 維持 | `path`・署名後最終`sha256`・正確な`version`。registryの意味policyで代替しない |

ledgerにtyped期待値を重ねて書かせない。旧項目が混在する0.2は未知キーとして拒否する。
registry digestは必須。ID同一でもbytesが違えば拒否。未知policy・role違い・暗黙選択なし。
Node versionはartifact receiptと最終hashへ結合し、policy IDだけで任意のpatch版を許可しない。

activation-0.1のledger raw hash bindingで新ledger bytesを固定できるため、この案ではactivation項目を増やさない。
新runtime用readerはledger-0.2のみを受理し、署名検証のために旧ledgerへfallbackしない。
現行OL-02 offline readerは0.1のまま。別経路の0.2 readerを既存の安全なファイル読取へ接続した（§5.1）。本番registry不在のため通常入口は有効化しておらず、permit発行にも接続しない。
registry/ledgerのschema version、outer policy ID、activation generationは別概念で、自動的に同じ数値へ同期しない。

### 5.1 安全なreader接続（内部合成検証）

[reader接続検証記録](E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_READ_SYNTHETIC_2026-10-19.md)を参照。
`inspect_installed_v2_records()`は引数なしの別入口。承認済みbuild registryが未設定なので、現時点ではファイルを読む前に`Unavailable`で停止する。
内部経路のみ合成registryで検証し、外部registryファイルの読込・path指定・env/argv上書きは追加しない。C方式の正本は引き続き組込みbytesである。

1. 共通の10秒予算を開始し、固定build bytesをstrict registry parserへ渡す。不正registryはファイル読取前に停止。
2. 実UID/group/OS文脈を取得し、固定activationを既存のdirectory-FD readerで検査する。root所有・0440・reader GID・単一link・regular・ACLなし、信頼された祖先を要求。
3. activationの期限と実行UID/groupを検査し、指定ledgerを同readerで読む。実行UID所有・0600を要求し、raw hashを解析前に照合。
4. activation由来の世代/release/UID/indexと実OSをContextに結合し、0.2 parser/registry ID・digest/policy roleを照合。旧版fallbackなし。
5. activation/ledgerを再読取しbytes・metadata・祖先identityを比較。各読取前後の期限と壁時計/単調時計の整合を確認し、終了時に両recordの残期限450秒超を検査。

結果は`InspectedV2Records(not_execution_authority)`というopaque型。コード/registry内容・path・issuer等をDebug/errorへ出さず、旧`InspectedRecords`やexec用permitへの変換は設けない。
filesystemのFD traversal・symlink拒否・bounded読取は既存実装を再利用する。registryの同一IDでもraw bytesが違えば停止する。
更新排他・OS署名/entitlement・closureを一体検証した証拠ではなく、検査完了後の差替え防止も未解決。ファイルI/O中の強制中断はなく、10秒は各段階の経過時間検査である。

## 6. 移行・更新・撤回

1. registry方式・期待値・issuer/template・flag mask・新schemaを人が承認する。現行観測から自動承認しない。
2. registry bytesを固定してbuild/署名し、組込みregistry digestと署名後最終launcher hashを別々に記録する。
3. 新releaseを別directoryへ配置する計画を作り、Node artifact/hash・policy ID・registry digestを含む新ledgerを審査する。
4. 更新排他・稼働release保持の方式が承認/検証された後でのみ、新規受付停止と新世代activation切替を行う。
5. 失敗は停止。旧ledger・未署名版・別registry/Nodeへ自動復帰しない。rollbackも別承認の新世代で行う。

これは将来の承認付き工程案であり、今回実施する設定手順ではない。
旧名前配列を`boolean:true`へ変換する移行ツールは初期案では作らない。新artifactの実署名/型付き観測を再確認して期待値を承認する。
旧record/記録はoffline inspection用として残せるが、新runtimeの開始条件へ流用しない。
0.1/0.2を同じデータとしてunion受理したり、未知versionを近い版へ解釈したりしない。
旧readerは新schemaを拒否、新runtime readerは旧schemaを拒否する交差試験を必須とする。

変更registryは新ID/digest、変更policyは新ID。旧IDの内容を書き換えない。
古い署名済みlauncherでも、activeなroot承認recordのhash/versionと一致しなければ停止する設計を維持する。
generationだけでrootによるrollbackを防げるとはしない。OS/root/署名鍵侵害・配備担当の誤承認は別の残余リスク。
registry/activationの撤回だけで、稼働済みNodeのtoken停止/失効まで済んだと報告しない。
Node単体の公証状況は親設計§6の未確認事項を引き継ぐ。entitlement一致を公証の承認に読み替えない。

## 7. 純粋比較器に向けた合成テスト契約

| 区分 | 固定する期待結果 |
|---|---|
| strict schema | 未知/重複キー、BOM/深さ/個数/サイズ、float/overflow flags、未知template/roleを拒否 |
| 期待値 | 空/承認済みbool:trueだけを受理。false/数値/string/container・非空launcher・重複IDを拒否 |
| 型付き比較 | key順序だけの差は一致、欠落/余分/false/CFNumber 1/文字列は拒否。unknown/矛盾を拒否 |
| absence | 空dictionaryとabsence_provenを区別して検証。欠落→absence_provenのadapterは未実装扱い |
| binding | registry ID同一/bytes違い、未知policy ID、role違い、artifact hash/世代/期限不一致を拒否 |
| 移行 | 新旧混在/自動変換/旧版fallbackなし。既存0.1のoffline合成セットは固定して回帰 |
| 秘密/authority | raw blob/issuer一覧/詳細errorを返さず、summaryをpermitや暗号検証成功と扱わない |

合成registry/観測は架空のtest-onlyデータ。本番をtest registryへ切り替えるpublic flagやinject可能な検証成功hookは設けない。
strict parserとentitlement純粋比較を合成実装した。初期descriptor/flag profileと検証の限界は上記記録を参照する。本番registry作成・旧データの書換は行わない。

## 8. 承認待ちと次工程

- C方式は採択済み。個別policyと本番registryの承認、ledger移行のschema・ID運用は未完了。
- issuer/template・static flags・Node entitlement集合。falseや非bool型を初期契約で拒否する方針の採否。
- `absence_proven`の実API生成条件、CF型投影、OS/SDK適合。
- 新runtime/旧offline readerの分離・activation-0.1継続の可否、切替/撤回・更新排他の責任者。
- 信頼済みbuild/署名、公証/失効確認・thread/FD/timeoutの未決事項とregistry更新コスト。

型付きpolicy比較、0.2 ledgerのstrict parser/registry参照binding、安全なreaderへの内部接続は合成検証済み。次は本番registryの承認・信頼済みbuildへの組込みと、実署名/更新排他を別工程で具体化する。reader有効化や本番policy投入は自動で行わない。
実Security adapter・実配備・gate解除は別承認。telemetry調査の再開を前提にせず、実PDI開始許可にも転用しない。
