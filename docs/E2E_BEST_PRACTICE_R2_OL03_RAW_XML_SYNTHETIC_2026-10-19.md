# BP-5 R-2 OL-03：raw XML限定解析・型付き辞書比較の合成検証

Date: 2026-10-19 / Scope: private純粋Rust部品のみ。native呼出しなし。

## 1. 境界

[証拠設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_ENTITLEMENT_EVIDENCE_DESIGN.md)§5.1の限定profileを実装した。
`signature_boundary/raw_xml.rs`とそのtest moduleだけを追加し、既存native backendには接続していない。
本番policy/registryは未設定、通常v2入口はUnavailable、runtime gate92、permit未発行を維持する。
telemetry調査は保留。実Security/CF呼出し・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 実装契約

- 8bytesのXML blob wrapper（magic `0xfade7171`＋BE総長）を検査。64KiB込み上限。headerなし/別magic/DER/長さ違いを拒否。
- UTF-8、optional XML宣言、version 1.0のplist、単一dict、非空keyとbooleanという固定非再帰文法。
- keyで5標準実体と数値参照を一度だけ復号。Unicode/制御文字・復号後128bytes上限・重複をmap構築前に検査。
- 全DOCTYPE（標準plist宣言も含む）、内部subset/ENTITY、未知PI、comment、CDATA、nested型・未知属性を拒否。外部参照機構はない。
- falseはそのまま保持。型付き辞書のkey集合/型/値と完全一致。数値/string等のcoercion、正規化、trimは行わない。
- raw欠落とAbsenceProven観測をAbsenceUnprovenで拒否。DER/Unknownも拒否。API XML内一致の件数だけ返し、物理XML/DER全体の証拠を返さない。
- 借用bytesを解析し、確保は最大32keysのbounded map/setだけ。観測の過大な型/値の確保元を制御したと主張しない。
- 共通10秒予算/cancelを解析中と最終比較でも検査。同期FFIの強制中断機能ではない（本部品はFFIを呼ばない）。
- Debug/errorは固定文字列/enum。XML本文・key/valueを出力しない。

## 3. 追加24テスト

| 試験群 | 確認した境界 |
|---|---|
| 正常系 | key順不同、empty両形式、宣言・属性空白・引用符、boolean開始終了、false保持 |
| 実体/重複 | 5標準実体/十進/hex/非BMP、一度のみ復号、復号後の重複、観測辞書の重複 |
| envelope | 8bytes未満/headerなし/未知magic/DER、BE長さ/逆endian、全位置での切詰め、余分末尾bytes |
| 上限 | wrapper込み65536bytes受理・65537拒否、32/33keys、key128/129 UTF-8 bytes（多byte含む） |
| 型/構造 | missing/extra key、false/Number/String/Data/Container/Unknown差、nested dict/array、値文字列、未知属性/version/namespace |
| XML拒否 | 標準DOCTYPE/外部実体/parameter entity、comment/CDATA/未知PI、無効数値参照/surrogate/NUL/制御文字、BOM・不正UTF-8・binary plist・末尾データ |
| 表記 | trim/case-fold/Unicode正規化をしない、空key/不正観測key拒否 |
| 停止 | rawなし/AbsenceProven/Unknown/DERは昇格しない。開始期限/未来時刻/取消、key/entity/長い空白走査中の期限、解析中cancel、最終比較時期限 |
| 非出力 | markerを含むXMLでも固定理由のみ。DebugはAPI内一致・非authorityを明示 |

既存164件＋追加24件＝188件（5 suites）。旧0.1 offline・nativeのraw/欠落拒否・通常入口停止・gate92も全体の既存回帰に含まれる。
全物理signature/DER/absenceや、実CFData形式・OSのXML parserとの一致は検証していない。

## 4. 検証

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

初回はテスト関数名の数字始まりによる構文エラーでfmt/testが停止。名前だけを修正し、188テスト成功を確認した。
Clippyでは64bytesごとの剰余判定に対する標準method推奨を検出し、`is_multiple_of`へ変更して再実行成功。
最終結果：188テスト成功、release build・Clippy・整形・diff検査成功。依存/Cargo.lock変更なし、TypeScript/MCP全体E2Eは未再実行。

## 5. 未対応と次工程

標準DOCTYPEを持つ通常のplistも初期subsetでは拒否する。許可構文/安全な字句処理は別レビューが必要。
観測したNodeのentitlement XMLは標準DOCTYPEを含むため、現subsetでは実artifactを必ず拒否する（設計§8.1）。
NodeはDER slot 7も持つため、XMLが通ってもDER decoderの審査なしには`api_xml_consistent`を超えない。
CFDataの実wrapper、API内XMLと物理XML/DERの関係、OS/SDK適合は未検証。
物理signature列挙/CodeDirectory結合、DER decoder、absence producer、更新排他、FFI hard timeoutは未実装。
今回の一致をnative正常系へ渡す経路やpermit変換は追加していない。本番有効化は別承認のまま。
