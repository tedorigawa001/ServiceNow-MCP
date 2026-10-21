# Import Set宛先テーブル検証の回帰記録（2026-10-22）

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

## 範囲外

- `run_transform_map` は既存のTransform Map（宛先は管理者が構成）を起動するだけで、本修正の対象外。Transform Mapの宛先・scriptの権限境界は別途確認が必要。
- PDI/ServiceNowへの操作・設定変更は行っていない。`sys_db_object` の応答形状（`super_class` がreference objectまたは文字列）はmockで確認したもので、実インスタンスでの確認ではない。
