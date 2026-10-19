# BP-5 R-2 OL-02：activation／起動台帳の合成検証

Date: 2026-10-19 / 内部オフラインライブラリ。telemetry調査は保留。実PDI・実token・実配備設定は未使用。

## 1. 実装境界

[Rust実装](../native/r2-outer/src/lib.rs)を未公開library crateとして追加した。
入口`inspect_installed_records()`は配備候補の固定activation pathだけを参照する設計で、argv/envによる別path指定はない。
この入口を実設定に対して呼ぶ試験や、実activation/ledgerの作成・配備・root操作は行っていない。
Node/exec/network/待受/OAuth/MCP/権限修復の実装はない。bin/mainやnpm依存・既存entryへの登録も追加しない。
戻り値はraw getter/Serializeを持たない`InspectedRecords`。Debugは固定文字列、失敗は固定enumのみ。
成功しても署名・依存閉包・group全所属・TTY等は未確認なので、実行permitではない。

Rust/Cargo 1.98.1を今回の開発環境として確認し、TOOLCHAIN.mdに実測版・再実行前の版照合を記録した。
installed名はstableだけで、exact version名のtoolchainは未導入。rustupの暗黙downloadを避けるためrust-toolchain.tomlは残さない。
Cargo.tomlのrust-versionは最低版の検査で、mutableなstableの完全固定ではない。正式固定はOL-01の残条件とする。
直接依存はserde 1.0.228、serde_json 1.0.149、sha2 0.10.9、libc 0.2.189、chrono 0.4.44（stdのみ）。
既存ローカルcacheからofflineで解決・ビルドし、Cargo.lockを追加。インストール/署名/配備設定は変更していない。
これはOL-01の正式なtoolchain/crate審査・vendor化・信頼済み配備が完了したという意味ではない。
serde derive等のproc macro、num-traits/autocfg等のbuild依存も存在し、依存が無実行/監査済みとは主張しない。

## 2. スキーマ・安全な読込

スキーマは[typed Serde契約](../native/r2-outer/src/schema.rs)とbounded JSON treeによる実装。
公開JSON Schemaファイル/CLI契約を生成する工程は今回追加していない。

| 境界 | 検査 |
|---|---|
| JSON | UTF-8、64KiB+1検知、深さ16、全階層の重複key（Unicode escape同名含む）、未知key、末尾データ、不正数値を拒否 |
| 固定値 | schema/policy/entry、darwin/arm64、UID/GID・世代・SHA-256/ソースrevision、path・binary/version/署名metadata・entitlement集合を検査 |
| 所有/権限 | activationはroot/0440/宣言GID、ledgerは実行UID/0600。通常file・single link・特殊permissionなし。祖先owner/mode/ACLも検査 |
| FD/path | macOS arm64 readerはrootからdirectory FDでopenat。O_NOFOLLOW/O_DIRECTORY/O_CLOEXEC/O_NONBLOCK、全祖先/leafの前後identity/ACL確認と再open照合 |
| ACL | FDに対するfstatx_np成功とfilesec_query_property(FILESEC_ACL)成功を必須にし、ACL propertyがない場合だけ許可。deny-only/empty ACL propertyも保守的に拒否 |
| bytes/hash | 実read量上限、ledgerの元bytes SHA-256をactivationと照合。両recordを再読込しbytes・identity・metadata/祖先を比較 |
| binding | UID/実行group、OS product version/build、generation/release/index hashの相互一致。不一致で停止 |
| 時間 | UTCミリ秒Zの日時、未来承認/無効期限を拒否。開始時460秒超・終了時450秒超。10秒以上・時計逆行・wall/monotonic差異1ms超は拒否 |

raw documentの本文/識別値、path、serde/OSのエラー文字列は公開結果へ出さない。
unsafeはDarwin FD/ACL/sysctl/UID/GID adapterへ限定し、それ以外はdeny(unsafe_code)とする。
実行groupへの所属は確認するが、group内の全readerの排他性は未確認。署名metadata/entitlement/index hashの
実binary・closureとの照合はOL-03以降であり、JSONの自己申告を署名検証済みとは扱わない。

## 3. 試験方法と途中の失敗

- TDDの最初の1件は未知recordを受理するstubに対して失敗し、その後strict schemaを接続した。
- 合成filesystem/時計は内部private traitだけ。raw OS境界の代替であり、所有者を変更した実root設定を作る試験ではない。
  有効な合成入力と、owner/mode/特殊bit/hardlink/ACL/祖先/非通常file/欠落/UID/group/hash/期限/clock/再読込差替え等を検証する。
- 各拒否では、検査成功後だけ呼ぶ合成downstream counterが0であることも確認する。
  これはNode実execの観測ではない。そもそも今回のlibraryにはNode起動APIがなく、OL-03のexec接続は未追加。
- 実FDの補助試験は、一時dummy fileとleaf/directory symlinkを作り、openat no-followの拒否と通常fileのmetadata/ACL取得を確認する。
  一時データだけを作成・削除し、既存path/ACL/group/設定を変更しない。
- 実FD試験の初回は21件中20成功・1失敗。通常fileのACL取得をNULL=拒否としており、ACLなしのファイルでもENOENTとなった。
  numeric errnoとlive FDを照合し、Appleの[acl_get_fd_np実装](https://raw.githubusercontent.com/apple-oss-distributions/Libc/main/posix1e/acl_file.c)
  （fstatx_np→filesec_get_property）も確認。NULLを一律許可にせず、取得成功とproperty不存在を直接照会する方式へ変更した。
  中間の診断assertは削除し、失敗時固定enumと検査不能拒否を維持した。
- 初回fmt --checkは整形差分で失敗し、cargo fmtで整形。clippy規則や検査を緩めていない。

## 4. 最終検証

| コマンド | 結果 |
|---|---|
| cargo test --offline --locked（専用manifest指定） | Rust 21テスト成功。実FD補助1件を含む。複数の拒否入力を各テスト内で反復 |
| cargo build --offline --locked --release | 成功（libraryのみ。signed launcherのビルドではない） |
| cargo clippy --offline --locked --all-targets -- -D warnings | 成功 |
| cargo fmt -- --check | 成功（専用manifest指定） |
| npm run build | 成功 |
| npm test -- --maxWorkers=1 | 121ファイル・3,126件成功、79.73秒。Rust試験とは別集計 |

## 5. 留保と次工程

Kernel/FS syscallが停止した場合をlibrary内の観測時刻検査で強制中断できるとはしない。
Darwinの実FD補助試験は通ったが、root activation配置全体、署名/配備/全group所属・他OS・全競合・悪意あるFSは未実証。
元設計の10秒は観測上限として検査し、hardな外部監督やexec直前再検証は後続で扱う。
Nodeの実entitlement比較、全runtime file hash/closure、RLIMIT/FD/TTY/env/exec、外側専用exit code、panic/loaderの秘密非出力は別工程。
libraryにbinを足して直ちにrunを開始してはならない。OL-01の未承認条件・G2/G4を解消したとは扱わない。
Rust試験はnpm testへ暗黙に追加せず、[README](../native/r2-outer/README.md)のofflineコマンドで明示実行する。
telemetry調査・maint依頼は保留。実PDI・実token・実設定・署名/配備・Pushは今回実施していない。

## 6. レビュー後の追記（2026-10-19）

- ローカルのhome directoryに`group:everyone deny delete`のdeny-only ACLがあることを`ls -le`で確認した。
  readerは祖先のdeny-only ACLも拒否するため、home配下のledgerは常に`UntrustedFile`になる。安全側だが配置先の制約としてOL-01 §5とREADMEへ記載した。
- group所属判定の`getgroups`が16個で切り詰められ得ること（観測UIDは15 group所属）、wall/monotonic差1ms許容がNTP slewで
  超え得ることを、OL-03/05の確認事項としてOL-01 §7とREADMEへ記載した。コードと試験は変更していない。
