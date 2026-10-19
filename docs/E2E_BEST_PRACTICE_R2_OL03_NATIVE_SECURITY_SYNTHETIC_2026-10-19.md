# BP-5 R-2 OL-03：未有効native backendの合成検証

Date: 2026-10-19 / Scope: native driver＋FakeApi、SDK宣言の読取・ローカルcompileのみ

## 1. 実施/未実施

[native設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_NATIVE_SECURITY_DESIGN.md)のdriverとmacOS arm64限定FFIを追加した。
テストではFakeApiとSyntheticEvidence/Probeだけを使用する。SystemApi/PinnedFileを使った実署名検査や実fileの採用試験は実行していない。
本番policy/registry投入なし。通常v2入口Unavailable・runtime gate92・permit未発行を維持する。
telemetry調査は保留。実署名・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 合成テスト追加17件

| 区分 | 確認 |
|---|---|
| driver正常系 | 固定static/dynamic/info flags、Copy/Create全所有object解放、型付きSnapshot |
| 異常出力 | failure＋nonnullを解放、success＋null拒否 |
| 部分取得 | self取得→static/path取得の途中失敗で全object解放 |
| requirement/info失敗 | エラー時Copy出力、保持requirement/codeを解放 |
| 状態 | validity前/失敗した再検証後はSnapshot拒否 |
| status | unsigned/invalid/requirement mismatch/changed/未知statusを固定理由へ写像 |
| path/型 | Security path不一致、同pathでも別inode、未知CF型を拒否 |
| entitlement形式 | dictionary欠落拒否、raw同時存在拒否、NumberをBooleanへcoerceしない |
| 上限/形式 | 33件、ad-hoc/linker-signedを拒否 |
| template | quote等の注入・未知template/anchor/cert class拒否、固定OID条件 |
| self | 保持requirementでdynamic検証、対応static/path確認、再検証後はself再確認が必要 |
| 資源/時間 | 内部呼出しcheckpoint1〜12でcancel/deadline、遅延出力を含め全object解放 |
| 外側接続 | 合成registry→native driver（FakeApi）→外側型付きpolicy比較、非authority件数のみ |

既存147件＋追加17件＝164件（5 suites）。既存の旧0.1 offline互換・通常入口停止・gate92のテストも全体に含める。
合成release counterは所有権の制御順序を確認するもので、実CF reference countやSecurityの暗号検証を証明しない。
実FFIのString/Number変換はcompile確認のみ。実CFを用いた投影試験は未実施。

## 3. 検証コマンド

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

最終結果：164テスト成功、release build・Clippy・整形・diff検査成功。
本番SDK/OS採用承認、実署名APIのflags受理/資源/通信の検証、TypeScript/MCP全体E2Eは対象外。

## 4. 停止条件・次工程

- 本番policy/registryは未承認。今回のrequirement/flagsはSDKに照合したdraft実装で、採用承認ではない。
- raw/DERとdictionaryの整合、absence producerは未対応で停止する。レビュー中の観測では、ローカルのNode v24.18.0は辞書とrawの両方を返し、
  現行実装では必ず`Unsupported`になった（entitlementのないlauncherは`UnknownObservation`）。実artifactの正常完了には両機能が必要（設計§5）。
- retained deployment FDとNativeの受渡し、更新排他・Security pathとのatomic binding・exec直前再確認は未接続。
- 同期FFIのhard timeout、frameworkのthread/FD挙動、実CFの所有権/型投影は別承認で検証する。
- native関数はprivate部品のみ。本番入口やpermit発行を先に有効化しない。

## 追補：実SDK・実Nodeでの読取専用確認（2026-10-19、レビュー）

scratchpadで小さなC probeをbuildし、ローカルのNode v24.18.0に対して読取専用で呼び出した（プロジェクトへは追加していない）。
- 定数：`kSecCSNoNetworkAccess`=0x20000000、`CheckAllArchitectures`=0x1、`SingleThreaded`=0x1000、`SigningInformation`=0x2、
  ad-hoc=0x2、linker-signed=0x20000、errSecCSReqFailed=-67050、Unsigned=-67062、SignatureFailed=-67061、StaticCodeChanged=-67034。実装と一致。
- `SecCodeCopySigningInformation`（SigningInformationのみ／RequirementInformation併用とも）：Team ID・identifier・flags・EntitlementsDict・raw Entitlementsがすべて存在。
- `otool -hv`：MH_MAGIC_64、ARM64、subtype ALL、EXECUTE。file.rsのthin arm64判定と一致。
1台・1版の観測であり、採用版や他OSでの挙動を保証しない。合成試験の件数・結果は変わらない。
