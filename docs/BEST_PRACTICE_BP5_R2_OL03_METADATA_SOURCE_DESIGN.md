# BP-5 R-2 OL-03：保持FDの実metadata source詳細設計

Version: draft-0.1 / Date: 2026-10-19 / Status: 設計案。実source・OS取得・適合試験・運用承認は未実施。

## 1. 目的・停止境界

[保持FD/parser設計§15](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)のM0〜M4と[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_METADATA_SYNTHETIC_2026-10-19.md)を前提に、同じ所有Fileからstat・ACL・xattr名・filesystemを取得する内部sourceを設計する。
既存328テストは合成観測の整合性の証拠であり、本書のOS取得経路の証拠ではない。

telemetry調査は保留。本書ではMDだけを変更し、実装・Security API実接続・実artifact/PDI操作・トークン発行・設定変更・permit発行・Pushは行わない。
SDK/既存ソースの読取と公式資料照合は行ったが、対象Fileへのmetadata syscallやprobeは実行していない。
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
- 現行`MetadataSource::metadata(phase)`はObservationを一括で返し、共通checkpointは呼出しの前後だけ。これだけで各内部syscallの期限を守ったとはいえない。
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

dev/ino/UID/GID/nlink/size/mtime/ctimeを既存Statへlosslessに変換する。signed dev_tはMetadataExt::devと整合するbit-pattern表現をtarget幅を固定して定義し、負値の単純なchecked u64変換で全deviceを拒否する実装にしない。
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
4. 不正present・失敗・API未対応はUnknown/取得失敗で停止。空/deny-only ACLでもpropertyがあれば拒否し、ACE数0を不存在の代替にしない。

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

現行SharedBudgetにはmetadata操作数・名前bytesの集計欄はまだない。実装前に局所枠と共通台帳への接続を追加する必要がある。preflight/A/Bの予約をmetadata用として横取りしない。
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

現行RetrievalFailureはUnavailableだけでChanged/Limitを表せない。collectorが内部Failureを返す設計にして、全エラーをUnavailableへ潰さない。
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

## 12. 今回の文書検証

変更は本書と関連設計3文書の参照だけ。local link・code fence・行末空白・git diffを検査する。
Rust/TypeScriptの実装・テストは変更していないため再実行しない。上記は将来の試験計画であり、OS実sourceの検証済み記録ではない。
