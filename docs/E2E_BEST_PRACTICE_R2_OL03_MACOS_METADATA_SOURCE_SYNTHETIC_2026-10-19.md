# BP-5 R-2 OL-03：macOS MetadataOps実source層の合成検証

Date: 2026-10-19 / Scope: staged実sourceの型変換・FFI差替え境界。実OS/PDI E2Eではない。

## 1. 対象・停止境界

[設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)§14のmacOS arm64 sourceを追加した。
実Fileを保持するSystemApi経路はコンパイルしたが、実行していない。新規14テストはFDのないFakeFile/FakeApiと純粋なlibc構造体fixtureだけを使う。
従来のRust回帰にあるOS fixture確認と、新sourceの実OS適合を混同しない。
telemetry調査は保留。実sourceのstat/ACL/xattr/pread呼出し・API実接続・実artifact/PDI操作・トークン発行・設定変更・本番policy投入・permit発行・Pushは行っていない。

## 2. 実装と所有権

- [darwin.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/darwin.rs)：所有source、private RawApi、Darwin Stat/FS投影、errno有限分類、単発pread。
- [ffi.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/darwin/ffi.rs)：libcの正しいtarget用構造体、公開filesec宣言、options=0、単発API。専用unsafe moduleへ局所化した。
- [tests.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/darwin/tests.rs)：FDを作らない合成backend。全file操作が同じ所有tokenへ向かい、source drop時だけFakeFileを1回解放することを確認する。

private staged constructorがFileを移譲するだけで、pathを開いたりFDを複製したりしない。実FD番号を入力する公開口もない。
ACLは非CloneのFilesecがpointerを所有し、collector guard経由のfreeでDrop→filesec_freeを1回実行する構造。
pointer所有化helperはprivate unsafeで、nullまたはuniqueなfilesec_init結果を前提にする。nullの合成試験は実alloc/freeを呼ばない。
Fileのowner/mode/bindingの信頼はconstructorで証明されず、secure opener/record/leaseへの運用接続は残る。

## 3. SDK/libc照合

ローカルmacOS26.5 SDKのsys/stat.h（fstat/fstatx_np）、sys/fcntl.h（filesec公開宣言、FILESEC_ACL=5）、sys/xattr.h（flistxattrの4引数/options）を読み取った。
固定依存libc0.2.189のDarwin stat/statfs・dev_t=i32/mode_t=u16・mount flagsを照合した。
これらは宣言の読取とコンパイルの証拠で、実OSでのsymbol呼出し・返却値/ACL意味・errnoの動作確認ではない。
APIの背景資料と可視性制約は[設計§2](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)を参照。

## 4. 新規14テスト

| 群 | 確認 |
|---|---|
| 全接続 | 空/provenanceで5phase→A/B結果、同じFakeFile、5回のACL生成/Drop、Fileの所有解放、固定Debug |
| Stat変換 | signed device=-1→u64::MAX、負の時刻秒保持、GID/special bits保持、負size/不正ns/不明type拒否、非regular種別を偽装しない |
| FS | 16bytes内NUL必須、空/未終端名拒否、非local/非apfs/ownership無視/noexec停止 |
| raw失敗 | 最初のphaseの9raw操作×EINTR/EACCES/ENOTSUP/EBADF/EIO。retry・後続payloadなし、作成済ACLだけ解放 |
| ACL | null所有化は失敗/実freeなし、init失敗、ACLStat型不正、query -1/2/i32最大はMetadataUnavailable |
| xattr | 負/過大長はcopy前停止、ERANGEはChanged、負/過大返却は拒否、未知markerを理由/Debugへ出さない |
| pread | 1回だけ、EINTR/EAGAIN/その他を有限分類、offset/終端overflow/空/64KiB超を呼出し前に拒否、負count拒否 |
| 予算・取消 | init成功直後/失敗query/namesで遅延・cancel、解放後に停止理由ラッチ。開始前cancel/metadata枯渇はraw呼出し0回 |
| 停止継続 | DER/absenceを成功へ変換しない。通常入口・native API/permitへの接続なし |

上記はtest関数14件の内部matrixであり、独立した実OSケース数・root配備適合件数とは報告しない。
既存collector20件は全phase/各操作の期限/cancel・解放・共有枠を引き続き検証する。

## 5. 検証結果

| コマンド/検査 | 結果 |
|---|---|
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml metadata::darwin` | 14 passed、348 filtered out |
| `cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml` | 362 passed（5 suites） |
| `cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml` | 成功 |
| `cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings` | 指摘なし |
| cargo fmt check / exec_probe.rs rustfmt check | 成功 |
| 変更MD local link/code fence/行末空白、git diff check | 成功 |

shellコマンドはbdoを前置。初回13件は成功し、早期cancel/metadata上限の1件を追加して14件とした。
SystemApiのFFI呼出しをfixtureとして実行したり、実署名/実FDを調べるprobeを作成したりはしていない。
依存/Cargo.lock・TypeScript/MCP登録は変更していないため、TS/MCP/PDIテストは再実行しない。

## 6. 残る未確認事項

実OS/SDKのABI・filesec property不存在/空ACL/可視性、通常UIDに不可視なxattr、filesec内部memory上限、FS/mount profile、最大artifact性能は未確認。
宣言/合成成功をもって運用profileを承認しない。sourceが投影しないstat fieldsやmount情報全体、許可xattr値の変化、ABAも保証しない。
共有予算は協調checkpointであり、復帰しない同期syscallの10秒hard timeoutは保証しない。
祖先/path/record/leaseと所有Fileの安全な移譲・native API/CD結合・DER/absence・permitは未接続。通常gate92と未設定registryの停止を維持する。
