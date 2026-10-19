# BP-5 R-2 OL-03：純粋bounded物理signature列挙の合成検証

Date: 2026-10-19 / Scope: private純粋Rust parser。実artifact・FD・Security APIとの接続なし。

## 1. 境界と実装

[詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_PHYSICAL_SIGNATURE_DESIGN.md)の狭いsubsetを`signature_boundary/physical_signature.rs`へ追加した。
入力は宣言file長、header/commands bytes、signature bytesの借用sliceのみ。同じ保持FD由来の証明ではない。
fixtureは架空のidentifier/Team・opaque CMS/XML/DER bytesを持ち、実行可能fileや有効な署名を作成しない。
物理slot構造・局所hash一致を、実署名validityやentitlement意味一致と呼ばない。

- thin LE arm64/ALL/MH_EXECUTE・reserved=0、load command完全走査、既知required command集合、LC_CODE_SIGNATURE一意性/EOF一致。
- file512MiB、commands1MiB/4096件、signature5MiB、index64件、CD header64KiB/総長4MiB＋64KiB、code slots131072、special slots7。
- SuperBlob/childのchecked range、index順不同・非整列offset、重複type/alias/overlap/未知slot拒否、未参照zero paddingだけ受理。
- CD 0x20400/0x20500、SHA-256/32bytes、内部range/string/coverage、hash配列末尾と総長の完全一致。
- -2/-5/-7はwrapperを含むSHA-256。child/hashの不整合、非対象special hashの非zeroを拒否。
- CD全体の局所32bytes digestを保持するが、APIの20bytes cdhash照合は未実装。
- XML＋DERのwrapper込み合計64KiB。API rawと合わせる共有上限は後の接続工程で必須。
- 確保はboundedなslot metadata/setのみ。入力本文の複写・file全体確保・外部読取機構はない。
- 元Instantから10秒、cancelをloopと64KiB hash/zero chunk、返却前で確認。同期I/O/FFI強制停止機能ではない。
- Debugは固定非authority表記、errorは有限enum。本文/identifier/Team/hash/pathを出力しない。

`entitlement_gate()`は常に失敗する。DERあり→UnsupportedDer、XMLもなし→AbsenceUnproven、XMLだけでもUnverifiedXml。
既存raw XML比較器・native driverには接続せず、通常v2入口Unavailable、未設定本番registry、runtime gate92、permitなしを維持する。
telemetry調査は保留。実Security/CF呼出し・実署名・実機/PDI操作・token発行・設定変更は行っていない。

## 2. 追加33テスト

| 群 | 確認した境界 |
|---|---|
| 正常/非authority | 両CD version、属性/runtime保持、全CD digest、固定Debug、DER/XMLなし/XMLのみも統合拒否 |
| Mach-O | fat/swapped/他CPU/subtype/type/reserved、header全prefix切詰め、command alignment/長さ/完全消費、LC欠落/重複、未知required拒否 |
| 上限 | file上限超過、signature5MiBちょうど/超過、commands1MiBちょうど/超過・4096/4097件、index65件拒否、CD hashOffset65536/65537・codes131072/131073・specials8拒否 |
| SuperBlob | table/range/magic、不正child長/空CMS、全signature prefix切詰め、index順/非整列、重複/alias/overlap、未知/alternate slot、必須CD/CMS欠落 |
| padding | child前gap・領域末尾のzero受理/非zero拒否、hash/zero chunk途中の期限 |
| CodeDirectory | 未知version/hash/platform/page、scatter/spare/64bit limit/preEncrypt拒否、header/string/hash範囲、制御文字/UTF-8/NUL/重なり、identifier128/129bytes |
| coverage | 4KiB/16KiB page、page数/limit不整合、exec区間超過/overflow、旧256KiB上限を超えるCD受理、CD総長の完全一致 |
| special hash | wrapper込みとbody-onlyの差、absent＋nonzero/present＋zero/未割当、非対象slot非zero拒否、XML＋DER65536/65537bytes |
| 停止/耐不正入力 | 開始cancel/期限/未来Instant、command/index等の途中期限/cancel、checked算術overflow、全signature byteの1箇所反転smoke（fuzzの代用ではない） |

CD単体の最大値は局所比較関数でも試験する。fileとsignatureの総長制約により、各上限が同時に到達可能という主張はしない。
既存188件＋追加33件＝221件（5 suites）。旧0.1 offline・通常入口停止・native保守的拒否・gate92の既存回帰を含む。

## 3. 検証コマンドと経過

```text
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo rustfmt --edition 2024 --check native/r2-outer/tests/fixtures/exec_probe.rs
bdo git -c core.fsmonitor=false diff --check
```

初回fmtはDebug implの閉じ括弧不足で停止し修正。初回compileはfixtureの整数型曖昧を検出しu64指定へ修正。
最初の25件実行ではalias fixtureが非zero未参照データも残し、OverlappingBlobより先にInvalidPaddingで停止した（24成功/1失敗）。
孤立した旧childをzeroにしてalias単独を検証するfixtureへ訂正し、30件成功。その後exact上限・chunk期限を追加した。
最終結果：全体221件成功（5 suites）、release build成功、Clippy指摘なし、cargo fmt・fixture rustfmt・diff検査成功。
関連7文書のlocal link・code fence・行末空白検査も成功。
依存/Cargo.lock変更なし。TypeScript/MCP全体E2E・実OS署名適合は対象外。

## 4. 未対応

保持FDの安全読取/同一file/full-file hash/metadata・世代・更新排他、native handleとのAPI結合、全page/CMS暗号検証は未対応。
DERはenvelope/hash診断だけで意味decoderなし。zero/未割当はabsenceの証明ではなく、XMLも既存型付き比較器へ未接続。
execSegFlags等の承認policy、OS/SDK適合、同期FFI hard timeout、本番有効化は別工程。
この合成成功から本番artifactの受理・実行安全性を主張しない。

## 追補：観測したNodeとの条件照合（2026-10-19、レビュー）

レビュー中に、本parserの受理条件をscratchpadのscriptで再現し、ローカルのNode v24.18.0（1台・1版）へ読取専用で当てた。プロジェクトへは追加していない。
- Mach-O：reserved=0、全command sizeが8の倍数、command末尾=32+sizeofcmds。`LC_REQ_DYLD`付きはCHAINED_FIXUPS/EXPORTS_TRIE/MAINのみ。
- signature：LC_CODE_SIGNATUREは1件・cmdsize16、file末尾で終了、datasize 957,104（5MiB以内）。SuperBlobはslot 0/2/5/7/0x10000、残りはzero。
- CD：version 0x20500、SHA-256/32、platform0、pageSize 2^12、各spare/scatter/codeLimit64/preEncrypt=0、`hashOffset+32*nCodeSlots`=length（937,904）、
  codeLimit=dataoff、nCodeSlots式一致、execSeg（base 0、limit 90,390,528）はcodeLimit内。identifier（offset 96）/team（offset 101）は特殊hash開始（112）より前。
- special slot：-2/-5/-7はwrapper込みSHA-256と一致、-1/-3/-4/-6はzero。

従って観測Nodeは構造検査を全て満たし、entitlement段階でDER slot 7により`UnsupportedDer`で停止する見込みである。
ただしこれはscriptで条件を再現したもので、**本Rust部品を実bytesで実行した結果ではない**。実artifactでの実行は保持FD接続とともに別工程で行う。
