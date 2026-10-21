# Import Set宛先テーブル・Transform Map組合せ検証の回帰記録（2026-10-22）

## 原因と影響

`create_import_set_row` と `import_excel_to_import_set` は、宛先 `staging_table` を呼出し側が自由に指定でき、`requireWrite()` だけでその名前のテーブルへ `createRecord` していた。

- `import_excel_to_import_set` は宛先名の文字種だけを検査し、任意テーブル名で `sys_import_set` を作成した後、Excelの各行をそのテーブルへ書き込んでいた。列名は `sys_*` 以外なら任意（`script`、`template` 等）。
- `create_import_set_row` は「指定したImport Setの `table_name` と一致すること」を検査していたが、`table_name` は上記ツールで任意の値にできるため、同一性の証明にならなかった。

結果として、WRITE権限だけで `sp_widget` や `sys_script` 等へ行を作成でき、portal widgetや各種scriptツールが要求する `SCRIPTING_ENABLED`（[portal権限境界の記録](SECURITY_PORTAL_SCRIPTING_GATE_2026-10-22.md)）を迂回できた。実際に保存できるかはServiceNow側のACLに依存し、本記録はACL迂回を主張しない。

## 修正

- 共通helper `requireImportSetStagingTable` を追加し、両ツールで**読取り・書込みより前**に呼ぶ。
- `sys_db_object` を `name=<staging_table>` で引き、`super_class` を辿って `sys_import_set_row` に到達した場合だけ許可する（宛先が `sys_import_set_row` そのものの場合は拒否）。
- 宛先名は英数字とアンダースコアのみ（既存の `STAGING_FIELD_RE`）。encoded queryの区切り（`^`、`=` 等）を含む名前は問合せ前に拒否する。
- 次の場合は安全側で `VALIDATION_ERROR`：テーブル不明、親なし、`super_class` が32桁sys_idでない、階層が10段を超える（循環を含む）。
- `create_import_set_row` は従来どおり `sys_*` フィールド拒否とImport Setの `table_name` 一致も検査する。Excel取込みは解析成功後、`sys_import_set` 作成・添付アップロードの前に検査する。
- 正規のstaging tableへの取込み動作（行のmapping、`sys_import_set` 付与、Transform Map起動、要約）は変更しない。

## 回帰テスト

`tests/tools/integration.test.ts` に8件追加、`tests/tools/security-hardening.test.ts` の既存1件にstaging階層のmockを追加（意図は不変）。

- Import Setの `table_name` が `sp_widget` を指していても、`sp_widget` への行作成を拒否。Import Setの読取りも書込みも0回。
- `sys_import_set_row` 自体、未知テーブル、親なし、不正 `super_class` を拒否。
- `^ORname=...` を含む宛先名を問合せ0回で拒否。
- 自己参照する階層で、問合せ回数が10回以内に止まる。
- 中間テーブルを挟む間接的な子孫を許可。
- Excel取込みで `sys_script` 宛てを、Import Set作成・添付アップロード前に拒否。

感度確認として、helperを無条件に成功させる変異を一時適用すると、新規8件すべてが失敗した。当初は宛先名の注入と循環の2件が後段の別検査で偶然拒否されて通過していたため、「Import Setの読取りに到達しない」ことも検査するよう強化した。変異は復元済み。

## 実行結果

```text
bdo npm run build
bdo npx vitest run tests/tools/integration.test.ts
bdo npx eslint src/tools/integration.ts tests/tools/integration.test.ts
bdo npm test
bdo git diff --check
```

build成功。integration 78テスト成功。ESLint error 0（既存のany警告10件）。全体 **122ファイル・3,209テストすべて成功**。diffチェック成功。

## 追補：Transform Mapの組合せ検証（2026-10-22）

### 確認結果

- `run_transform_map` は `requireWrite()` だけで `sys_import_set_run` を作成し、sys_idの形式もImport SetとTransform Mapの組合せも検査していなかった。`import_excel_to_import_set` の任意Transformも同じ。
- このMCPにはTransform Map・field map・transform scriptを作成/変更するツールがなく（一覧/取得のみ）、既存自動化の起動（`trigger_flow`、`trigger_scheduled_job` 等）をWrite段階とする既存方針とも整合する。従って本経路がScripting段階を迂回して新しいscriptを書き込むことはない。
- ただし、正規のstaging tableへ任意の行を入れたうえで**インスタンス既存の任意のTransform Map**を起動できたため、管理者が構成した宛先（例：LDAPユーザー取込みmapの `sys_user`）へ、各ツールの項目allowlistを経由せずにデータを流し込めた。

### 修正（案A）

- 共通helper `requireTransformMapForStagingTable` を追加。mapのsys_idが32桁16進であること、`sys_transform_map` が有効（`active` が `true`/`'true'`）であること、`source_table` が対象staging tableと完全一致することを要求する。
- `run_transform_map`：両sys_idの形式を最初に検査し、Import Setを取得してその `table_name` に `requireImportSetStagingTable` を適用し、続いて上記helperでmapを照合してから `sys_import_set_run` を作成する。
- `import_excel_to_import_set`：`transform_map_sys_id` 指定時は、staging table検証の直後、Import Set作成・添付アップロード・行挿入より前にmapを照合する。
- 失敗はすべて `VALIDATION_ERROR` で、書込みは0回。誤解を招いていたコードコメント（「Scripted REST経由で起動」）は、実際の動作（run記録の作成）と未検証である旨に改めた。

### 回帰テストと結果

- 追加11件：組合せ成功、非16進/検索条件風のsys_id（読取り・書込み0回）、別source tableのmap（例：`ldap_import`→`sys_user`）、無効なmap（`'false'`/`false`/空/未設定）、staging tableでないImport Set（mapを読む前に拒否）、Excel経路での別source table/無効map（Import Set作成・アップロード・行挿入0回）。既存の成功テスト2件を有効な組合せのmockへ更新した。
- 変異確認：map照合helperを無条件成功にすると8件、`run_transform_map` のstaging table検証を外すと1件が失敗した。いずれも復元済み。
- build成功、integration 89テスト成功、ESLint error 0（既存any警告10件）、全体 **122ファイル・3,220テストすべて成功**。

## 追補2：宛先・scriptに応じたScripting段階（案B、2026-10-22）

### 方針

Transform Mapの実行は、管理者が構成したlogicを宛先テーブルへ適用する。次のいずれかに該当する場合は、組合せ検証に加えて `requireScripting()`（WRITEとSCRIPTINGの両方）を要求する。

- 宛先 `target_table` が保護対象のplatformテーブル：`sys_*`、`sp_*`、`sysauto*`、`sysevent_script*`、`oauth_*`、`discovery_credential*`、`ecc_*`。identity・role・ACL・script・widget・scheduled job・credentialを変更し得るため、map自体にscriptがなくても対象とする。
- 宛先が空、または英数字とアンダースコア以外を含む（安全側に保護対象とみなす）。
- mapの `run_script` が有効。
- そのmapに `sys_transform_script` が1件でも存在する（有効/無効を問わず保守的に扱う）。
- そのmapのfield map（`sys_transform_entry`）に `use_source_script=true` が1件でも存在する。

業務データの宛先（`incident`、`cmdb_ci_*`、`u_*`、`x_*` 等）でscriptのないmapは、従来どおりWrite段階に留める。既存自動化の起動をWrite段階とする方針（`trigger_flow` 等）とは、宛先とscriptで線を引く形で両立させた。

### 実装

- `transformMapRequiresScripting` を追加し、`requireTransformMapForStagingTable` の組合せ照合の後に呼ぶ。該当すれば `requireScripting()`。`run_transform_map` と `import_excel_to_import_set`（Import Set作成前）の両方に適用される。
- script有無の照会（`sys_transform_script`、`sys_transform_entry`）はmap sys_idを検証済み32桁16進で埋め込む。照会が失敗した場合は例外をそのまま伝え、書込みを行わない。
- ツール説明と `docs/TOOLS.md` に条件を明記した。

### 回帰テストと結果

- 追加14件：script・宛先とも問題のないmapがWriteのまま成功／保護宛先6種（`sys_user`、`sys_user_has_role`、`sp_widget`、`sys_script`、`sysauto_script`、`oauth_entity`）・空/不正な宛先・`run_script`・transform script・source script使用field mapの11条件で、SCRIPTING無効なら `SCRIPTING_NOT_ENABLED` かつ書込み0回、有効なら成功／script照会の失敗で書込み0回／Excel経路で保護宛先のmapをImport Set作成・アップロード前に拒否。
- 既存のExcel成功テストのmap mockへ `target_table: 'cmdb_ci_server'` を追加（宛先未設定は安全側で保護扱いになるため）。
- 変異確認：判定を常にfalseにすると13件、script照会を省くと3件が失敗した。いずれも復元済み。
- build成功、integration 103テスト成功、ESLint error 0（既存any警告10件）、全体 **122ファイル・3,234テストすべて成功**。

## 追補3：変換開始の扱い（案C、2026-10-22）

### 確認結果

- 公式資料の [Import Set API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_ImportSetAPI.html)（参照日2026-10-22）は、POSTでstaging tableへ行を挿入すると、そのstaging tableに定義されたTransform Mapが同期的に実行されると説明している。GETはstaging行と変換結果を取得する。
- 一方、既存のImport Setに対して `sys_import_set_run` レコードをTable APIで作成すると変換が始まる、という記載は見つからなかった。同テーブルは通常、変換後の履歴として作られる。
- 実機（PDI）での確認は、本プロジェクトの停止条件（実機操作を行わない）により実施していない。従って「変換が始まらない」とも断定しない。

### 実装（実機確認を要しない部分）

- `run_transform_map` と `import_excel_to_import_set` の任意Transformは、従来どおり `sys_import_set_run` を作成するが、**変換を実行したとは返さない**。結果に `transform_started: "not_verified"` と、ServiceNow側でImport Setの状態・変換履歴を確認するよう促す `note` を付ける。
- 要約を「Triggered ...」「started the Transform Map」から「run record created; transform start not verified」へ変更した。ツール説明と `docs/TOOLS.md` も同様に改め、公式に記載された経路（Import Set API）を本ツールは使っていないことを明記した。
- 既存の成功テスト2件に、`transform_started` が `not_verified` であること、要約が実行済みを主張しないことの検査を追加した。build成功、integration 103テスト成功、ESLint error 0（既存any警告10件）、全体 **122ファイル・3,234テストすべて成功**。

### 未実施（実機確認と設計判断が必要）

- 実際に変換を起動する方式への置換。候補はImport Set API（`/api/now/import/{staging_table}`）による挿入時の同期変換だが、これは**staging tableに定義された全Transform Mapを実行**し、任意のmapを選べない。採用する場合は、案A/Bの検査を「指定したmap」ではなく「そのstaging tableの全map」に対して行うよう設計を改める必要がある。
- server側scriptで変換を起動する方式は、Scripting段階かつ実機での動作確認が前提になる。

## 範囲外

- 保護対象prefixの一覧は本修正時点の判断であり、運用で必要なテーブルの追加・除外は別途レビューする。
- PDI/ServiceNowへの操作・設定変更は行っていない。`sys_db_object` の応答形状（`super_class` がreference objectまたは文字列）はmockで確認したもので、実インスタンスでの確認ではない。
