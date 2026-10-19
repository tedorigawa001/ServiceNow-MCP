# BP-5 R-2 OL-01：言語・初期OS・信頼済みビルド／配備・起動台帳

Version: draft-0.4 / Date: 2026-10-19 / Status: 選定・契約案。record検査・gated exec部品は内部合成検証済み。正式なtoolchain/署名/配備・実行環境の承認は未完了。

後続の[OL-02合成検証](E2E_BEST_PRACTICE_R2_OL02_RECORDS_SYNTHETIC_2026-10-19.md)では、Rust typed schemaとsafe readerだけを追加した。
開発toolchainの実測版記録とoffline buildは、OL-01のtoolchain固定・信頼済みビルド/署名・人の承認が成立したことを意味しない。
[OL-03 exec部品](E2E_BEST_PRACTICE_R2_OL03_EXEC_SYNTHETIC_2026-10-19.md)はOS peerで空env/FD/cwd/limits・終了codeを確認した。
runtime trust gateは閉じたままで、実署名/entitlement/closure/group排他性・exec直前の再検証は未完了。

## 1. 決定案と境界

[外側起動設計](BEST_PRACTICE_BP5_R2_OUTER_LAUNCH_DESIGN.md)のOL-01を具体化する。
今回は次の構成を推奨案として固定し、実装前のレビュー対象にする。選定案を記載しただけでOL-01を完了にはしない。

| 項目 | 初期案 | 未完了の条件 |
|---|---|---|
| 実装言語 | Rust、単一のnative executable。OS境界だけ小さなFFIへ隔離 | 正確なstable toolchain・依存・unsafe範囲の承認 |
| 初期OS/arch | macOS / arm64（Apple Silicon）、Rust target `aarch64-apple-darwin`。Rosetta/x86_64/Universalは対象外 | 検証端末の正確なmacOS product version/buildを1組台帳へ固定。OS更新時は再適合確認 |
| 起動元の保護 | Developer ID署名＋Hardened Runtimeのlauncher。不要な例外entitlementなし。配布前のnotarizationを要求 | 発行者/Team ID・署名担当・証明書・OSの検証手段を確定し、注入試験に合格 |
| 実行時 | 非管理者UID、固定Nodeへexec、Nodeへ空env、追加Node flagなし | Node実体/version/digest/署名・依存閉包・FD/TTY適合の検証 |
| 配備 | 管理担当が別工程でroot所有の不変release directoryとactivation recordを配置 | 配備時だけ必要な管理操作の別承認。実行時sudo/setuidなし |
| 起動台帳 | 実行UID所有0600のstrict JSON、root所有activation recordにその正確なbytesのSHA-256を固定 | bounded読込器・台帳スキーマ・権限/競合検査・承認者の実装/確認 |

telemetry調査・maint依頼は保留。実PDI操作・登録/ACL/アカウント/設定変更・token発行は行わない。
既存MCP/npm/CLIへの登録・実台帳の作成・OS設定・署名用資格情報の準備は対象外。
本書の初版ではRust projectも対象外だったが、後続OL-02で未公開のlibrary crateだけを追加した。
担当者名・証明書ID・具体的なローカルpathやPDI情報を公開MDへ記入しない。

## 2. 根拠と選定理由

ソース基準は`6fbe955`。現行[entry](../src/review/r2-launcher-entry.ts)は空env・固定.js・POSIXを検査し、
[package.json](../package.json)はNode下限22.12とR-2非同梱を定める。
Rust/Cargoの既存projectは今回の一覧照合では見つからず、新言語のビルド・レビュー負担が生じる。
これは性能改善や新しい保護の実証ではない。外側は非Nodeという既存案の中で比較した。

| 言語案 | 強み | 採否と理由 |
|---|---|---|
| Rust | boundedデータ処理をsafe code中心に構成でき、exec/ACL等を明示的な境界に寄せられる | 推奨。Cargo依存とFFI/unsafeの審査が増える。memory safetyはOS/署名/同一UID侵害への保護を意味しない |
| C | OS APIに直接近く、小さい実行ファイルにしやすい | 初期案では見送り。独自JSON/UTF-8/path処理の境界検査とメモリ管理の審査が主負担になる |
| Swift | macOS APIとの統合を選びやすい | 初期案では見送り。runtime/import閉包と起動前依存を別途評価する必要がある。RustのFFI負担が大きければ再検討 |

初期macOSを選ぶのは既存の合成検証・ファイル信頼性確認がmacOS中心だからで、他OSが安全でないという意味ではない。
Rust公式のApple Darwin target対応はビルドの根拠であり、R-2がその全対応OSで動いたという証拠ではない（S1）。
正確なmacOS buildとRust/SDK/Node patch版は実機適合の入力であり、未選定値に`latest`や広い範囲を代入して開始しない。
Node22.12は下限互換試験用。実PDI用Nodeは別途承認した保守対象の正確なpatch版を固定し、下限版の運用採用を自動的に意味しない。

## 3. launcher自身の信頼の起点

[署名・entitlement詳細設計draft-0.6](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)と[型付きpolicy契約](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)で、C方式の純粋policy/ledger参照照合・安全なreaderへの内部接続と、未完了の実署名/registry組込み/本番reader有効化を区別する。実署名検証・運用承認を意味しない。

launcherがmainに入ってからenvを消すだけでは、そのlauncherのloader注入を防げない。
この再帰を「Rustだから安全」で打ち切らず、署名・Hardened Runtime・OSの実行制御と信頼済み配備を外側の前提にする。
AppleはHardened Runtimeと例外entitlementを区別し、DYLD変数の使用には専用entitlementを記載している（S2/S3）。
この仕様を基に保護を要求するが、採用する正確なOS/成果物での注入拒否はOL-03の合格条件として残す。

- launcherはDeveloper IDの所定発行者で署名し、Hardened Runtimeを有効にする案。
  `allow-dyld-environment-variables`、`disable-library-validation`、`get-task-allow`、JIT/unsigned executable memory等の
  例外・debug用entitlementを付けない。不要なentitlementをfalseで列挙するのではなく、許可集合を空とする方針。
- 非system dylib/framework依存を加える場合は閉包と署名条件を再審査する。
  macOS system libraryを含む完全static binaryを仮定しない。NodeのJIT等の署名条件とlauncherの条件も混同しない。
- 配備担当がlauncherの発行者・runtime flag・entitlement・notarization結果を起動前に照合する。
  ad-hoc署名、検証エラー無視、quarantine除去、Gatekeeper/SIP無効化を代替手順にしない。
- 署名は発行者/bytesを結び付けるが、挙動の安全性・監査完了・依存の無脆弱性を証明しない。
  notarizationは別工程でAppleへの送信が伴う。実装/配布承認に加え、送信する成果物と署名アカウント利用も別承認する。
- **exec先のNodeはlauncherと同じ保護を持たない。** 2026-10-19にローカルのNode v24.18.0（Node.js公式のTeam IDで署名、
  Hardened Runtime有効）を`codesign`で確認したところ、`allow-dyld-environment-variables`、`disable-library-validation`、
  `get-task-allow`、`allow-jit`、`allow-unsigned-executable-memory`、`disable-executable-page-protection`が付いていた。
  1台・1版の観測であり、実PDI用に採用するNode版でも同じとは断定しない（OL-01で採用版を再確認する）。
  - DYLD変数による注入はNode側のOS保護では拒否されない。防御はlauncherが空からenvを構築することだけに依存する。
  - library validationが無効のため、Nodeは未署名のdylib/native addonを読み込める。§6.2のclosure indexによる
    未承認native addon/loaderの拒否が実質的な防御になる。
  - `get-task-allow`により、同一UIDの別プロセスがroot権限なしでNodeへdebugger attachし、token等のメモリを読める可能性がある。
    同一UID侵害は既存の前提外だが、その侵害に必要な障壁をこのentitlementが下げることを残余リスクとして明記する。
- 起動は配備済みの固定絶対pathだけ。shellで呼ぶ場合もalias/PATH/任意wrapperに委ねず、shell/OS/端末の適合が前提。
  不適合環境からの任意起動まで安全とはしない。署名環境を用意できなければOL-01を止め、未署名版へfallbackしない。

## 4. ビルドと承認の分離

入手・ビルド・署名・配備・実行を別の工程として扱う。実行開始時に依存やtoolchainを取得しない。

| 工程 | 必須の固定値/操作 | 証拠・停止条件 |
|---|---|---|
| 入手 | ソースfull revision、Rust/Cargo/rust-std、macOS SDK/linker、Node/npmの正確な版と入手元、公開鍵の信頼元 | 値・署名/hashの確認記録を非公開に保持。鍵を同じ未検証downloadだけから信頼しない |
| Rust依存準備 | Cargo.lock、vendor閉包、features、source replacement、build script/proc macroの有無を審査 | vendor化やlock一致を安全性検査済みと読まない。新依存/任意build.rsは再承認 |
| Rustビルド | 隔離した固定macOS builder、固定toolchain/SDK、承認済みCargo設定、network禁止、`--frozen`相当のlocked+offline | Cargo config/RUSTFLAGS/rustc wrapper/linker等も外部継承しない。Cargo制御だけでbuild scriptの外部通信を防いだと主張しない（S4/S5） |
| TypeScript閉包 | 固定ソース/lockfile/npm版で依存を準備し、審査済みのbuildだけ実行 | npm-ciのlock整合は根拠の一つ（S6）。lifecycle scriptは既定禁止、必要な例外は明示審査。R-2はnpm tarball非同梱なので別の内部releaseを作る |
| Node入手 | 正確な公式macOS arm64 artifact、署名済みSHASUMSと承認鍵の照合、展開後Node digest/署名条件を記録 | 公式release署名方式を参照（S7）。Homebrew/nvm/PATHの可変symlinkや自動最新版追従を使わない |
| 試験 | Rust単体/OS境界、既存build/全体合成、梱包非同梱、注入/PTY/Node版適合 | 実PDI/tokenは使わない。未実装OL-02〜05の試験を実施済みとしない |
| 署名・release承認 | 署名前digest、署名後の最終binary digest、発行者/entitlement、source/toolchain/test receipt、notarization結果 | 署名後bytesをruntime台帳に採用。署名/時刻の差があり得るため再ビルドのbyte再現性を未実測のまま主張しない |

依存はstd中心を目指すが、JSON/SHA-256/FFI bindingを独自実装する方針ではない。
具体crateと版はOL-02着手前に小さなallowlistとして承認し、Cargo.lock/vendorに固定する。web/TLS/OAuth/汎用CLI frameworkは不要。
Rustのpanic/FFI失敗を固定外側codeに落とす設計とし、panic message/backtraceを出さない受入試験を後続で行う。
実行時にRust/Cargo/npm/コード署名ツールを起動して不足を補わない。

## 5. 配備モデルと更新・撤回

初期案は**管理担当による配備、通常UIDによる実行**。管理担当の作業をlauncherの権限へ持ち込まない。
root所有のrelease directoryは実行UIDに書き換えさせず、各版を独立配置する。exec対象は通常ファイル、setuid/setgidなし。
runtimeは0555、JS/JSON等は0444、directoryは0555を初期mode案とし、祖先・ACL・所有者も検査する。
activation recordはroot所有0440・専用read group、非公開配備rootはroot所有0550・同groupを初期案とする。
groupは配備書込み権限を持たず、承認した実行UIDだけをreaderにする。一般staff/admin groupを流用しない。
必要なlocal group/所属の準備はOS設定変更に当たるため別承認であり、今回は作成しない。
group/祖先の検査不能、不要なreader、granting ACLがあれば拒否する。root所有0600で実行UIDが読めない構成を「配置済み」としない。
既存の0600 manifestをこの共有runtime directoryへ置かず、専用の非公開0700 directoryへ分離する。
正確なpathは非公開台帳で固定し、`current` symlinkやユーザーのDownloads/作業ツリーを実行対象にしない。
**ledgerはユーザーのhome directory配下に置けない。** macOSのhome directoryには既定で`group:everyone deny delete`の
deny-only ACLが付き（2026-10-19にローカルで確認）、OL-02 readerは祖先のdeny-only ACLも保守的に拒否する。
ledgerは配備担当が用意するroot所有・ACLなし・group/other書込み不可のdirectory配下に置く。`/Users/Shared`等の共有書込み可能な場所も不可。
祖先の特定deny-only ACLを許可する緩和は、ACL内容の厳密な照合を伴う別承認とし、現時点では採らない。

配備前に、別の信頼済み検査者が成果物とNodeの入手・署名・閉包indexを照合する。
配備後にactivation recordと台帳のhashを再照合し、更新中は起動を排他する。
read-only modeだけをOSレベルのimmutable保証と読まず、管理者/OS侵害は前提外とする。

更新は「新releaseを別directoryへ検証配置 → 新ledger案の承認 → 配備担当がactivationを一度切替 → 起動再確認」。
activation record自体はroot所有の通常file、書込み可能なsymlink/aliasは使わない。切替は同じ信頼済みdirectory内でatomicにする設計。
切替の前後identity確認・FDを保持した検査・exec/importまでの競合はOL-02/03で検証する。単なるpath/hash再読込だけで完全競合耐性を主張しない。
稼働中はreleaseを変更/削除しない。rollbackも新しい承認/activation世代を必要とし、古い台帳の自動再採用はしない。
緊急停止は新規起動を止める。配備ファイルの撤回だけで既存host/tokenの停止・失効を証明しない。

## 6. 台帳とactivation recordの契約案

### 6.1 二段階の信頼

実行者のJSONだけを信頼すると、hashも対象pathも同じ利用者が差し替えられる。
そこでlauncherが読む**activation recordのpathは配備規約で固定**し、root所有と祖先/ACLを確認する。
そのrecordが指定するledgerのpath・bytes SHA-256・世代・UID・releaseを照合する。runtime rootやNodeの選定をargv/envから渡さない。
activation recordのhash値をファイル所有者検査の代わりにはしない。

ledgerは実行UID所有0600、通常file、single link、特殊permissionなし、祖先root/実行UID所有・他者書込み不可、
symlink拒否・granting ACL拒否を要求する。既存[trusted config方針](../src/servicenow/trusted-config-file.ts)を設計根拠とするが、
Rust側へ同等の検査を実装/試験する必要があり、既存TypeScript readerをNode開始前に呼ばない。
root activation record用readerは別のowner方針で、既存manifest readerのUID所有条件を緩めない。
activation/ledgerの拡張属性は[closure設計§3.0](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)と同じ固定policy（空または`com.apple.provenance`だけ）を適用する案。OL-02 readerは未対応。
台帳が変わると、配備担当が新bytesのhashを承認しactivationを更新するまで起動を拒否する。

### 6.2 strict JSONの項目

下表は契約の要求。OL-02でtyped Serde schema/readerを内部実装したが、公開JSON Schemaファイル/CLIの生成は追加していない。
公開MDへ実値入りの記入例は置かない。OL-02では日時をUTCミリ秒Z形式、runtime cwdをrootと同じpathに固定した。
読込の初期実装はACL propertyを一律拒否し、deny-only/empty ACLも許可しない保守的な境界とする。
両fileはUTF-8、最大64KiB、深さ16、未知キー/全階層の重複キー/不正数値/末尾データを拒否。
SHA-256は小文字hex64桁、日時はUTCの明示ISO8601、UID/世代は非負の整数、pathはNULなしのcanonical絶対pathとして検査する。

| record | 固定キー案 | 意味/検査 |
|---|---|---|
| activation | `schema_version=bp5-r2-activation-0.1`, `generation`, `execution_uid`, `reader_gid` | schema固定、実行UID/read group一致。世代は配備承認順に増加 |
| activation | `ledger_path`, `ledger_sha256`, `release_id`, `artifact_index_sha256` | 許可した唯一のledger bytes/release/indexに結合。path探索なし |
| activation | `approved_at`, `expires_at`, `approval_ref` | root側の有効期間と非公開承認参照。承認の真偽は人の照合が必要 |
| ledger | `schema_version=bp5-r2-launch-ledger-0.1`, `generation`, `release_id`, `execution_uid` | activationと完全一致 |
| ledger | `platform` | `os=darwin`, `arch=arm64`, 正確な`product_version`/`os_build`。更新/不一致は拒否 |
| ledger | `launcher`, `node` | 各canonical path、最終binary SHA-256、正確なversion、承認した署名requirement/発行者。launcherはruntime flagと空entitlement集合も照合。nodeも実際のentitlement集合を承認値として記録し、完全一致で照合する（追加・欠落とも拒否） |
| ledger | `runtime` | `root`, 固定`entry_relative_path=dist/review/r2-launcher-entry.js`, `cwd`, index path/hash。Nodeが読む閉包だけに固定 |
| ledger | `build_receipt_sha256`, `source_revision`, `lockfile_sha256` | 配備承認で使ったビルド/依存記録への結合。runtimeをソースから再生成しない |
| ledger | `approved_at`, `expires_at`, `approval_ref` | activationとの期間の共通部分が有効。承認refをTTY/ログへ出さない |
| ledger | `policy_id=bp5-r2-outer-macos-arm64-0.1` | env/FD/limits/argument grammar/禁止fallbackは実装の固定policy。JSONで任意optionを許可しない |

closure indexは別のroot所有0444 file。release内の相対path・kind・size・SHA-256・期待modeの一覧とする。
[OL-03 closure詳細設計draft-0.5](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)に、strict schema・index自身の循環回避・FD読取・xattr方針・更新排他と承認待ち事項を整理した。parser/純粋照合/FD読取部品は内部合成検証済みで、信頼済み実配備・承認済みとはしない。
通常file/directory以外、symlink/hardlink、重複path、`..`、未知file、未承認native addon/loaderを拒否する案。
全JS/JSON/node_modules/host/checker/worker/dynamic import先を含め、system frameworkはOS buildの信頼前提へ分離する。
初期入力上限案はindex16MiB・100,000項目・閉包実読取2GiB。実際の閉包が収まるか未測定であり、超過時の自動拡張はしない。
Node配布物にsymlinkがある場合もruntimeで追従せず、配備時の依存審査で通常fileへ正規化できるか確認し、変換後indexを再承認する。

### 6.3 有効期間・競合・OAuth manifestとの分離

開始時にwall clockとmonotonic clockを固定する。外側検査は初期上限10秒案とし、activation/ledgerとも
`expires_at > 開始時刻 + 10秒 + 450秒`を要求し、exec直前にも残り450秒超を確認する。
450秒は現行checkerの事前余裕に合わせる設計値で、外側の10秒を製品385秒/解析60秒/cleanup3秒へ加算しない。
外側検査のdeadline/不適合はNode開始前に固定非0で停止する。時刻の巻戻り/整合不能も停止する。
信頼時計の改ざんやrootによるactivation巻戻しを完全に検出できるとはしない。世代だけでrollback防止を証明しない。

OAuth manifestの内容、instance/client/本人/Update Set/C方式証拠、G2/G4承認はこの台帳に入れない。
manifest pathは既存entryの非秘密argvとしてのみ渡し、checkerの安全読込・TTY承認・digest結合を必須のまま維持する。
外側台帳の承認/署名を、manifest承認やリリースmatched/本人確認の代用にしない。
process一覧のpathや署名/OS metadataも識別情報として、非公開管理と公開出力の最小化を維持する。

## 7. OL-01の完了判定と後続

| 判定 | 必要な証拠 | 現在 |
|---|---|---|
| 選定の承認 | Rust/macOS arm64・root配備モデル・台帳信頼方式を人が採択 | 案のみ |
| toolchain/対象環境 | 正確なRust/Cargo/SDK/macOS/Node版、ビルド・署名・配備・実行の担当者 | 未確定。架空の値で埋めない |
| 署名の信頼元 | Developer ID/Team ID、必要なAppleアカウント契約・権限、証明書/鍵管理、検証・notarization送信承認 | 未確認。未署名fallbackなし |
| Nodeのentitlement | 採用Node版の実entitlement集合の記録と承認。公式署名のまま使うか、`get-task-allow`等を除いて再署名した版を使うかの判断（JITには`allow-jit`が必要。再署名は公式署名の連鎖を変えるため別承認） | 未判断。ローカル1版の観測のみ |
| 依存閉包 | 最小crate allowlist、unsafe/FFI契約、Cargo/vendor/npm/Nodeの入手証拠、全file index生成方式 | 未作成 |
| 配備/台帳 | 非公開のpath/UID/read group/mode/ACL、activation世代、期限/更新/撤回・排他手順と承認者 | 契約案のみ。実file/権限/所属は作成しない |

OL-01の契約承認後も、実装はOL-02のstrict bounded reader/オフライン検査から別承認で進める。
OL-03ではDYLD/NODE_OPTIONS/RUST/Cargo由来の注入marker、汚染PATH、署名/権限/ledger差替え、未知FD、exec失敗を合成検証する。
OL-02 readerの次の2点もOL-03/05で確認する。いずれも失敗は安全側の停止だが、可用性に影響する。
- group所属を`getgroups`で判定している。macOSの従来の`getgroups`は16個までしか返さない場合がある。
  観測した実行UIDは既に15 groupに属しており、専用read group追加で16に達する。16超の所属で試験するか、
  `getgrouplist`等による判定へ変更するかを決める。
- wall clockとmonotonic clockの差の許容が1msである。通常は数msで終わるが、I/O遅延で数秒かかると
  NTPのslew（最大500ppm程度）だけで1msを超え得る。実機での発生頻度を測定し、許容の見直し要否を判断する。
署名/検証不能は後続Node起動0回。通常実行はnetwork/署名ツール/任意子0回で、既存entryの終了codeを変換しない。
外側専用exit番号は親設計draft-0.2の非重複方針を維持し、本書では値を追加しない。
実PTY・OS/Node版・空env表示/時刻/並び順・dump/収集運用の確認はOL-05、G2/G4・本人ACL/C方式の実PDI検証はOL-06のまま。
OL-01案の作成や公式資料の確認を、これらの試験や実行許可の証拠に数えない。

## 8. 公式根拠台帳

確認日：2026-10-19。各資料の仕様と、本プロジェクトが選んだ制限を分ける。
文書は随時更新されるため、将来の実装開始時にはtoolchain/OSの対象版と再照合する。

| ID | 公式URL・該当箇所 | 採用する根拠と限界 |
|---|---|---|
| S1 | [rustc book: Apple Darwin targets](https://doc.rust-lang.org/rustc/platform-support/apple-darwin.html) Target/Requirements | Darwin targetの対応。R-2や配備端末の検証済み範囲ではない |
| S2 | [Apple Hardened Runtime](https://developer.apple.com/documentation/security/hardened-runtime) Overview / Runtime Exceptions | runtime保護と例外を区別。保護有効化・不要例外なしは本設計の要件、実binaryの適合は未確認 |
| S3 | [Allow DYLD environment variables](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.cs.allow-dyld-environment-variables) Discussion | DYLD変数を用いる例外の意味。任意OS環境での全注入拒否・Nodeの署名状態は証明しない |
| S4 | [Cargo build](https://doc.rust-lang.org/cargo/commands/cargo-build.html) Manifest Options: locked/offline/frozen | frozenはlocked+offline。build scriptや侵害toolchainのsandboxを提供する根拠にはしない |
| S5 | [Cargo vendor](https://doc.rust-lang.org/cargo/commands/cargo-vendor.html) Description / source replacement | 依存の局所化。vendor内容の監査やbyte再現性は別確認 |
| S6 | [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) Description / ignore-scripts | lock整合・script制御の参考。採用npmの正確な版と挙動は再照合 |
| S7 | [Node.js release-keys](https://github.com/nodejs/release-keys) Verifying Release Packages | 公式の署名鍵/SHASUMS検証。鍵の信頼元・採用artifact/署名の記録は別途必要 |

Appleの[notarization資料](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)はOL-01初回確認では取得本文が限定的だった。
後続の[署名詳細設計§6/§9](BEST_PRACTICE_BP5_R2_OL03_SIGNATURE_DESIGN.md)では公式workflowのstandalone binaryへの直接staple不可を確認した。
R-2用の配布形式・ticket照合・オフライン起動の可否/条件は未確認のままとし、公証可能/完了とは断定しない。
Hardened Runtimeがnotarizationの前提という記述はS2で確認した。
