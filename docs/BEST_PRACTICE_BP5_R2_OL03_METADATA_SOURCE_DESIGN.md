# BP-5 R-2 OL-03：保持FDの実metadata source詳細設計

Version: draft-0.3 / Date: 2026-10-19 / Status: collector・単発Ops・macOS実sourceを内部実装。実FDでのOS取得・適合試験・運用接続/承認は未実施。

## 1. 目的・停止境界

[保持FD/parser設計§15](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)のM0〜M4と[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_METADATA_SYNTHETIC_2026-10-19.md)を前提に、同じ所有Fileからstat・ACL・xattr名・filesystemを取得する内部sourceを設計する。
既存328テストは合成観測の整合性の証拠であり、本書のOS取得経路の証拠ではない。

telemetry調査は保留。draft-0.1はMDだけの設計で、後続のcollector/単発Opsを§13、macOS実source内部実装を§14に記録する。実sourceのOS呼出し実行・Security API実接続・実artifact/PDI操作・トークン発行・設定変更・permit発行・Pushは行わない。
§2はdraft-0.1でのSDK/公式資料照合であり、今回対象Fileへのmetadata syscallやprobeを実行した記録ではない。
本番registry未設定、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。

## 2. 根拠・確認範囲

| ID | 根拠と該当箇所 | 確認した範囲・限界 |
|---|---|---|
| MS-01 | [Apple stat(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/stat.2.html) DESCRIPTION / struct stat / time fields | fstatは開いたFDを参照する。時刻・型・owner等の意味を照合。古いarchiveのABI配置をRustへ転記しない |
| MS-02 | [Apple listxattr(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/flistxattr.2.html) DESCRIPTION / RETURN VALUES / ERRORS | FD列挙、NUL区切り、任意順序、長さ照会、ERANGE。**参照可能な属性名だけ**が返るという制約。全属性の不存在証明ではない |
| MS-03 | [Apple statfs(2)](https://developer.apple.com/library/archive/documentation/System/Conceptual/ManPages_iPhoneOS/man2/statfs.2.html) DESCRIPTION / FLAGS | FDのFS情報を取得する経路。archiveの表示には古い構造・flags表があるためSDKと区別する |
| MS-04 | macOS26.5 SDK `usr/include/sys/stat.h` fstat/fstatx_np、`sys/fcntl.h` filesec_t / FILESEC_ACL / filesec_init/free/query_property | 宣言とFILESEC_ACL=5を確認。公開headerの存在は空ACL表現・全FSでの不存在判定を保証しない |
| MS-05 | 同SDK `sys/xattr.h` flistxattr / XATTR_MAXNAMELEN、`sys/mount.h` fstatfs / MNT_LOCAL / MNT_IGNORE_OWNERSHIP | 名前上限127bytes、FD版の4引数、local/ownership flagsの宣言を確認。採用OSでの挙動は未検証 |
| MS-06 | 同SDK `usr/share/man/man2/listxattr.2` DESCRIPTION | Webと同じ可視性制約を本文で再確認。SDK内のflistxattr.2はこのmanへの参照 |

SDK rootは`/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`。今回の照合用であり、本番toolchain/OSの採用承認ではない。
filesec_query_property/statx_npのApple archive本文は今回Webで取得できず、ACLはSDK宣言と[既存filesystem.rs](../native/r2-outer/src/filesystem.rs)を照合した設計候補に留める。
APIの一般的意味と、以下で選ぶ厳格profile・局所上限は別物である。後者はプロジェクト案で、Apple推奨値とは説明しない。

## 3. 所有権・同一FD・既存契約との接続

- 初期対象はmacOS arm64。privateな所有型が安全なdirectory-FD openerからFileを移譲され、PositionedSourceとmetadata取得の両方を実装する案。
  同じFileを可変借用し、raw FDは各FFI呼出し中だけ借用する。任意FD番号・公開File constructor・owner override・pathによる再openを成功経路に設けない。
- fstat/fstatx_np/flistxattr/fstatfsとpreadはすべてこのFileを使う。別FDで採取した値をObservationへ混ぜない。FD複製・cursor操作・proc経由のpath復元も使わない。
- root/祖先・期待device/N/hash・role・record bindingは別の信頼済みopener/contextの責務。metadata sourceが自分の観測値から期待値を作ることは禁止する。
- 従来の`MetadataSource::metadata(phase)`はObservationを一括で返し、共通checkpointは呼出しの前後だけ。これだけで各内部syscallの期限を守ったとはいえない。
  **接続案はReadScope側collector＋単発MetadataOps境界**とする。collectorが同じsourceへ順に要求し、同じSharedBudgetを前後で確認して最後に既存Observationを組み立てる。
  sourceにbudgetの別コピー・新Instant・独自cancelを持たせず、sourceとbudgetを同時に再借用する循環も作らない。
- MetadataOpsは内部の単発操作だけ。OS結果の型付き投影/固定失敗を返し、phaseを選ぶ権限や比較成功を生成しない。M0〜M4の挿入位置・Flowの順序は変えない。
  既存の合成source契約を黙って本番経路とみなさず、collector共通化の最小refactorと回帰試験を先に行う。

## 4. 1観測の固定手順

| 順番 | 同じ保持FDへの処理 | 必須検査 |
|---|---|---|
| 0 | 共通checkpoint・phase受付 | 元の10秒、cancel、最初の失敗ラッチ、残metadata枠。失敗済みならOS呼出し0回 |
| 1 | fstat → Stat before | 成功時だけ初期化済みstructを読む。型・size・数値変換を検査 |
| 2 | fstatfs | local/ownership profile。mount path等は出力しない |
| 3 | filesec_init → fstatx_np → filesec_query_property(FILESEC_ACL) | §6の不明/取得失敗を空へ変換しない。fstatx_npのstat投影もbeforeと照合 |
| 4 | flistxattrの長さ照会→名前取得→長さ再照会 | §7。0件でも取得を省略せず、競合を検出したらやり直さない |
| 5 | fstat → Stat after | beforeとの全field一致。phase M1〜M4ではさらにM0と一致 |
| 6 | filesec/bufferのRAII解放・比較後checkpoint | 期限後の成功を破棄。既存normalize/Flowと失敗ラッチを経てのみ次工程へ |

各操作・変換・名前走査の前後にcheckpointを置く。途中に失敗したら後続の観測操作へ進まず、必要な解放だけを行う。
phaseはM0（bytes前）、M1（preflight後）、M2（A後）、M3（parser後）、M4（B後）の既存順序。失敗時の再採取・M0更新・phase省略はしない。
stat/ACL/xattr/FSはatomicな一括snapshotではない。前後stat一致でもABAや属性値の変化を完全に排除しない（§10）。

## 5. fstat・FSの型付き投影

Rust libcの採用target用struct/APIを使い、SDK structの手書き再現や未初期化bufferの先読みをしない。
`st_mode & S_IFMT`を明示decodeしてRegular/Directory/Symlink/Otherへ投影し、型以外のpermission/special bitsを完全保持する。
未対応bitsは拒否し、0555に見せるためのmaskはしない。UID0、regular、単一link、32bytes〜512MiB、期待device/N一致を従来どおり要求する。

dev/ino/UID/GID/nlink/size/mtime/ctimeを既存Statへlosslessに変換する。signed dev_tはDarwinのi32からu64への符号拡張castでMetadataExt::devの表現と整合させる（-1はu64::MAX）。u32幅への縮約やchecked変換による負deviceの一律拒否はしない。期待deviceも同じ表現を使う必要があり、実openerとの照合は未接続。
負size・nanoseconds範囲外・幅超過は拒否。時刻の秒はi64の符号を保持し、mtime/ctimeのnsは0〜999999999。
atimeは読取で変化するため比較対象外。st_flags/birthtime/generation等は現行Stat外であり、検査済みとは主張しない。追加が必要なら契約変更として別審査する。

fstatfsは同じFDへ各phaseで1回行い、MNT_LOCAL必須・MNT_IGNORE_OWNERSHIPなしを初期profile案とする。
MNT_NOEXECも実行対象には拒否する案。取得不能・未対応FSは停止し、device一致だけでlocalとしない。
当初の適合候補はlocal APFSに限定する案で、FS名は固定長配列をbounded検査する。名称一致だけをOSの真正性証明にしない。
現在のFilesystem列挙はLocal/NonLocal/Unknownだけなので、追加mount条件はcollector側で検査してからLocalへ投影する。生のmount flags/FSID全体のphase間比較は現契約外で、全mount不変の証拠にはならない。

## 6. ACL：property不存在の確認候補

既存no_aclと同じ公開API系列を候補にするが、そのbool helperをそのまま呼んでcheckpoint/理由を失わないようにする。

1. filesec_initを1回だけ呼び、nullなら取得失敗。成功直後にRAII guardへ移し、全経路でfilesec_freeを1回だけ行う。
2. 同じFDのfstatx_npへ正しいlibc::statとfilesecを渡す。成功時だけstatを投影し、beforeとexact比較。失敗で未初期化statを参照しない。
3. presentを不正sentinelで初期化してfilesec_query_property(FILESEC_ACL)を呼ぶ。戻り値0かつpresent=0だけAbsent候補、present=1はPresent。
4. 不正present（0/1以外）・失敗・API未対応はUnknown/取得失敗として、全phaseでMetadataUnavailableをラッチする。present=1だけはpolicy不適合としてM0でMetadata、M1〜M4でChanged。空/deny-only ACLでもpropertyがあれば拒否し、ACE数0を不存在の代替にしない。

ACL本文、principal、UUID、ACEを取得/表示しない。FILESEC_ACL_RAW/ALLOCSIZEはSDKでprivate注記があるため使用しない。
filesec内部の確保量とFSごとの「propertyなし／空ACL／未対応」の区別は未確認。呼出し数を有限化してもframework内部memoryのhard capを証明したことにはならない。
公開APIのAbsent意味と可視性が対象OS/FS/実行UIDで確認・承認されるまで、運用経路の不存在証拠には採用しない。ACL失敗をmode検査だけで救済しない。

## 7. xattr名：bounded列挙と競合

FD版flistxattrのoptionsは0固定。path版用のNOFOLLOW等を流用しない。開いたFileの同一性はopenerと所有型で守る。

1. `flistxattr(fd, NULL, 0, 0)`のssize_tを確認。負値は停止、65536超は確保前Limit。
2. n>0ならn bytesをtry_reserveで確保し、同じFDで1回取得。got=nを必須とし、ERANGE・長さ差・超過をChangedとして止める。buffer拡張/retryはしない。
3. n=0でも固定1byte bufferを渡して1回取得し、got=0だけ受理する。size=0を渡して再び長さ照会になってしまう実装を避ける。
4. 最後にNULL/0で長さ再照会を1回行い、元nと完全一致を要求。3回の列挙中に競合が見えれば同じ呼出しでは再試行しない。
5. 成功bytesはNUL終端・空要素なし・重複なし・名前長をbounded検査。照合は生bytes完全一致、case/Unicode/文字列の置換で正規化しない。
   一般名の上限は照合SDKの127bytesを初期案とする。親設計の255は従来の局所上限で、Darwinの公式定数だと扱わない。
6. 空または`com.apple.provenance\0`だけを既存Observationへ渡す。受理集合は最大1名なのでsort/名前mapは不要。
   quarantine/ResourceFork/未知名は拒否し、値を読む/削除する/属性を修復することはない。provenanceの値は取得しない。

長さ再照会とfstatの前後比較でも同長の入替え→復元は排除できない。name listは呼出し主体に可視なものだけ（MS-02/06）。
**空/許可名のみの成功を、見えない属性も含む「未知属性なし」の証明に昇格しない。** 対象OS/FS/通常UIDでの可視性profileは承認待ち。
rootへの昇格、可視性を自己申告するJSON、未確認のprivate optionsは代替にしない。解決できなければ診断専用のまま運用接続を停止する。

## 8. 共有予算・resource案

| 項目 | 方針 |
|---|---|
| 時間/cancel | 既存の外側開始Instantから10秒・同じAtomicBool・sticky failure。phase/syscall/roleごとに時計や失敗状態をresetしない |
| 操作枠 | 1phaseはfstat2＋fstatfs1＋fstatx_np1＋query1＋flistxattr3＝最大8観測操作、filesec init/free込み最大10境界呼出し。5phaseで40/50、両role順次で80/100を計画上限案とする |
| 試行 | metadataはEINTRも再試行せず停止する初期案。既存preadの共有8回枠は減らさず増やさず、metadata専用の隠れretryを作らない |
| 名前memory | 観測ごと最大64KiB、n=0は固定1byte。正規化後raw bufferは破棄し、全5phase分を保持しない。filesec/OS内部確保量・RSSはこの上限外 |
| 課金 | fileの2GiB実bytes/予約/32768要求枠とは別にmetadata操作数と名前返却bytesを記録する案。名前のcopy成功は遅延/拒否分も数える。長さ照会値を実取得bytesと二重課金しない |
| lifecycle | sourceはFDを増やさない。filesec/名前bufferは観測単位RAII。budget/cancel中でも解放を省かず、取得失敗後に観測を継続しない |

draft-0.1時点でSharedBudgetにはmetadata操作数・名前bytesの集計欄がなかった。§13で共通台帳へ追加した。preflight/A/Bの予約をmetadata用として横取りしない。
不適合returnや失敗も試行枠へ計上し、filesec_freeの解放用枠は成功判定の予算と分けて確保する。
現在の2GiBはfile payload実I/O台帳であり、xattr/ACLのkernel内部I/Oまで2GiB以下だとは主張しない。
checkpointはsyscallが復帰してから遅延を拒否する協調停止である。停止しないsyscallに対するhard timeoutは未接続で、10秒以内の終了保証は別課題。

## 9. 固定失敗・秘密非出力

| 状況 | 内部処理案 |
|---|---|
| syscall失敗・filesec null・未知ABI/FS | MetadataUnavailable。ENOTSUP/EACCES/EPERM/EBADF/EIO/EINTR等を属性なしへ変えない |
| ERANGE/長さ競合・前後stat/fstatx差・M0との差 | Changed。再取得で成功値へ上書きしない |
| 初回policy不適合/不明 | Metadata。M1〜M4の同種不適合は既存Flow同様Changed |
| 確保失敗・64KiB超・枠/変換容量超過 | Limit。結果/診断bufferを外へ返さない |
| cancel/期限/既存失敗 | 共通checkpointの有限理由を優先してラッチ。遅い成功/エラーを結果として採用しない |

従来のRetrievalFailureはUnavailableだけでChanged/Limitを表せない。§13のcollectorは内部Failureを返し、全エラーをUnavailableへ潰さない。従来の一括合成sourceは互換性を維持する。
errnoは操作直後に内部で分類し、OSエラー文字列やpath/FD番号/属性名/ACL/UID/GID/stat/hashをDebug・JSON・panic・ログへ出さない。
固定phase/理由/件数だけを内部診断に使う。比較成功でも非authorityのComparedM0M4以上へ昇格せず、entitlement gateは必ず停止する。

## 10. 未確認・承認待ち

1. 対象OS build/SDK/ABIとlocal APFSのprofile、FD版API availability、通常UIDからのACL/xattr可視性。SDK宣言は実機適合の証拠ではない。
2. filesecのAbsent/空ACL/未対応の意味、内部割当上限。bounded呼出しだけではmemoryのhard capは証明できない。
3. 通常UIDが不可視属性を列挙できない問題。解決前の成功値は「可視名の観測整合」だけで、closure全属性policyの証拠に使わない。
4. MNT_LOCALだけに依存しないFS/ownership/noexec profile、mount属性の変化をどこまでidentityへ含めるか。現行Filesystemは情報を縮約する。
5. st_flags等の未投影field、ABA・特権による復元・許可xattr値の変更。metadata/A/Bはwrite leaseの代替ではない。
6. trusted openerからのFile移譲、祖先/path/record/leaseの結合、同期OS呼出しのhard timeout。いずれも本書で実装/承認しない。

## 11. 後続の合成試験と実装順

1. collector/単発Ops/共有budget接続を合成sourceで先に検証。全phaseの操作順・同じsource ID・失敗後の呼出し0回・解放1回を必須にする。
2. fstat/fstatx差、負size/ns不正/型bits、local/ownership/noexec/未知FS、ACL present/unknown/null/不正戻り値を注入する。
3. 名前n=0/1/65536/65537、負値/ERANGE/短い/過大/再照会差、NUL/重複/未知名、provenanceのみを検証。初回・コピー後・最終照会後の各競合を別々に発火させる。
4. 各境界で期限/cancel/遅延成功/遅延エラー、先行失敗の保持、memory/枠の先行拒否、固定Debug/marker非露出を検証。
5. 既存328テストとA/B/M0〜M4・未設定registry/旧offline互換の回帰を実行する計画。新規OS sourceの実装後にだけ、新経路の試験結果を記録する。
6. 合成試験後も実OS適合は別の明示承認が必要。実ACL/xattr変更・root所有fixture・API接続・permitはこの計画の実行対象に含めない。

## 12. draft-0.1の文書検証

変更は本書と関連設計3文書の参照だけ。local link・code fence・行末空白・git diffを検査する。
Rust/TypeScriptの実装・テストは変更していないため再実行しない。上記は将来の試験計画であり、OS実sourceの検証済み記録ではない。

## 13. ReadScope collector・単発MetadataOpsの合成実装

[collector合成検証記録](E2E_BEST_PRACTICE_R2_OL03_METADATA_COLLECTOR_SYNTHETIC_2026-10-19.md)に追加20件・全体348件と初回検査の失敗/修正を記録する。
[collector.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/collector.rs)はOS syscallを持たない内部境界で、実装しているsourceはテスト内の合成値だけである。

- `MetadataOps: PositionedSource`はtyped stat/FS、ACL init/stat/query/free、名前size/readの単発操作を持つ。ABI/errno変換・実FD/OSの真正性はまだ実装/検証していない。
- `ReadScope::compare_collected_m0_m4`がcollectorでObservationを作り、従来のnormalize/Flow、A採取/parser/B再走査へ渡す。同じsource object・元Instant/cancel・payload台帳を使い、別sourceの注入引数はない。
  従来のcompare_m0_m4も同じFlowを使う。単発経路と一括合成経路の成功値はどちらも非authorityで、運用sourceが一括経路へfallbackする接続はない。
- 各操作の前後・変換/検査後に共通checkpoint。ACL initはcleanup1枠も先行予約し、成功handleを**post-checkpointより前に**AclGuardへ移す。
  guardは同じscope/sourceを借用して、正常/エラー/取消/期限/unwindでfreeを1回実行する。init失敗時はhandleをfreeせず予約だけ解放。free後の遅延/取消も最終checkpointで停止する。
- metadata呼出し上限100は同じSharedBudget全体で共有。初期phaseの正常経路は10回、5phaseで50回。両role相当の2回の比較で100に達し、新scopeでresetしない。
  cleanup予約は取得操作から消費できない。失敗attemptも計数し、metadataのInterruptedを再試行しない。preadの8回枠と32768要求/2GiB予約は別で、変更しない。
- 名前bufferは照会後に64KiB以下をtry_reserve_exactで確保。空でも1byteを渡し、copy/requeryを省略しない。3回の照会取得は各1attemptだけ。
  名前成功copyは返却後guardの前に課金し、遅延/拒否でも残す。不正な過大返却は渡したslice長まで保守的計数してChanged。これは壊れたsourceの実OS転送量の証明ではない。
  名前台帳は全体640KiB、各観測64KiB。確保前に今回のslice長が残枠に入るか確認し、不足時はcopy前に停止する。照会長はbytes課金に足さない。許可名以外は固定比較で拒否し、一般名前parserやsortは不要。
- FSはtyped `Local + apfs + !ownership_ignored + !noexec`だけ、ACL queryは0だけを許可。1はpolicy不適合、0/1以外は全phaseでMetadataUnavailableとして区別する。fstatx相当Stat/前後Statを完全照合する。
  M0 policy不適合はMetadata、後続はChangedを**ラッチ前**に選び、取得失敗はMetadataUnavailable、上限はLimit。遅延/cancelはcheckpointで優先し、既存の最初の失敗は上書きしない。
- `ComparedM0M4`の固定Debug・非Clone/非serialize・DER/absence/XMLの停止を維持。OS取得・ACL/xattr可視性・hard timeout・trusted opener/祖先/path/record/lease・API/permitの未対応を解消したとはしない。

今回追加したのはcollector境界の合成検証で、実OSのfilesec_freeやstatを呼んだ結果ではない。合成unwind試験はRAII解放を確認するもので、backend panicの機密非出力やpanic後の運用再開を承認するものではない。

## 14. macOS MetadataOps実sourceの内部実装

[実source層の合成検証記録](E2E_BEST_PRACTICE_R2_OL03_MACOS_METADATA_SOURCE_SYNTHETIC_2026-10-19.md)に新規14件・全体362件を記録する。
`metadata/darwin.rs`と`darwin/ffi.rs`はmacOS arm64にだけコンパイルする。公開constructor/通常入口への登録はなく、privateなstaged constructorだけが所有Fileを移譲して保持する。これ自体はFileの信頼性を証明しない。

- `HeldSource<SystemApi>`は同じFileを全操作へ借用し、fstat/fstatfs/fstatx_np/flistxattr/preadを各1回だけ呼ぶ。open/clone/seek/別path/FD差替え/独自時計/retryはない。
  source自体は予算を所有せず、既存collector/ReadScopeが全操作の前後で同じ予算を確認する。preadのEINTR再試行は既存ReadScopeだけが行う。
- `RawApi`はprivateなFFI差替え境界。実backendはFile、合成backendはFDを持たないFakeFileを関連型にし、実sourceと同じ投影・collector/A/B経路を通す。合成backendからSystemApiや実Fileを起動しない。
- fstat/fstatx_np/fstatfsの出力は正しいlibc ABIのzeroed storageを渡し、戻り値0のときだけ読む。失敗時に部分出力を使わない。
  statはtypeを明示decodeしてpermission/special bitsを完全保持。未知type/負size/ns不正はUnavailable。UID等のpolicyはcollectorで判定する。
- fstatfsの16byte FS名は配列内NULを必須にし、apfsのexact bytesとlocal/ownership/noexec flagsだけを投影する。mount path/source文字列やraw structは保持/表示しない。
- filesec_initのnullは取得失敗。成功pointerは非CloneのFilesecが所有し、collector guardのfreeでDrop→filesec_freeを1回実行する。
  生pointerから所有型を作るhelperはprivate unsafeとし、nullかuniqueなinit結果だけを許す。queryは-1 sentinelを初期化し、無更新/不正値を0へ救済しない。
- flistxattrはFD版options=0、size照会はNULL/0、copyはcollectorの非空64KiB以下sliceをそのまま渡す。負戻り値は取得失敗、非負の長さ/返却量はcollectorの既存上限・課金・差分照合へ渡す。
- errnoは失敗直後に取得し、EINTR/ERANGE/その他を有限分類。metadataのEINTRはretryせず停止し、ACL query不正値は全phaseでMetadataUnavailableを維持する。
  preadだけはEINTR/EAGAIN/その他を既存IoFailureへ分ける。off_t変換・offset+slice長・64KiBをcall前に検査する。
- source/errno/stat/filesecはraw Debug/JSONを持たない。source Debugは固定文言。OSエラー文字列・FD/path・属性値を外へ出さない。

テストが実行したのはFakeFile/FakeApiと純粋投影だけで、実SystemApiを使ったstat/ACL/xattr/preadは実行していない。null所有化helperの試験もinit/freeを呼ばない。
SDK/libc宣言の照合とコンパイル/合成成功は、採用OS/ABI・ACL不存在・xattr可視性・filesec内部memoryの実機適合証拠ではない。
trusted opener/祖先/path/record/leaseからのFile移譲、配備roleの運用binding、同期syscallのhard timeout、API実接続、DER/absence、permitは未接続/停止のまま。

## 15. secure opener側の詳細設計

[保持FD移譲詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)に、同じ所有Fileのmove、record/size出所、保持祖先と信頼anchorからの再walkを分離した。
binding/所有権契約に続き、所有leafのMetadataOpsとopen snapshotをM0で結合する合成経路を追加した。実HeldSource constructorは非公開・未接続のまま。M4前topology/record最終再照合/追加予算は未実装で、実sourceの運用呼出しは開始しない。
