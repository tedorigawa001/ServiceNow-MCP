# BP-5 R-2 OL-03：保持FDの物理signature列挙・CodeDirectory結合

Version: draft-0.2 / Date: 2026-10-19 / Status: 詳細設計案のみ。parser・native接続・実artifact検証は未実施。

## 1. 目的と停止境界

[raw／DER証拠設計](BEST_PRACTICE_BP5_R2_OL03_ENTITLEMENT_EVIDENCE_DESIGN.md)§6の物理列挙と、[native backend](BEST_PRACTICE_BP5_R2_OL03_NATIVE_SECURITY_DESIGN.md)のpath/保持FD照合の間を具体化する。
ファイル全体hash、CodeDirectoryのhash、各special-slot hashは別の対象を測る。互いを代用しない。
本書はプロジェクト独自の狭い初期profile案。Appleがこのsubsetの安全性や実artifact適合を承認した意味ではない。

DERはenvelope/slotの存在を診断しても意味解析せず停止する。slotなし/zero hashをabsenceへ昇格させない。
本番registry未設定、通常v2入口Unavailable、runtime gate92、permit未発行を維持する。
telemetry調査は保留。今回はMDのみで、実装・実Security/CF呼出し・署名・実機/PDI操作・token発行・設定変更は行わない。
既存文書にある以前のNode観測は再実行していない。本案がそのNodeや採用予定版を通せるとはしない。

## 2. 根拠・固定した参照元

照合日：2026-10-19。Apple公開リポジトリのmain参照先を`git ls-remote`で読取り、以下の**commit URLの本文も確認**した。ローカルclone/checkoutは作成していない。
Security: `db15acbe6a7f257a859ad9a3bb86097bfe0679d9`、xnu: `f6217f891ac0bb64f3d375211650a4c1ff8ca1ea`。
これらは文献の固定であり、採用OS build/SDKと同一の実装だという証明ではない。

| ID | URL／SDKと該当箇所 | 確認範囲・限界 |
|---|---|---|
| PS-01 | [TN3126: Inside Code Signing: Hashes](https://developer.apple.com/documentation/technotes/tn3126-inside-code-signing-hashes) Per-page hashes／Special slots | code pageとspecial slotの違い、XML/DERのhash。iOS向け再署名条件をmacOS全版へ一般化しない |
| PS-02 | [kSecCodeInfoCdHashes](https://developer.apple.com/documentation/security/kseccodeinfocdhashes)、[DigestAlgorithms](https://developer.apple.com/documentation/security/kseccodeinfodigestalgorithms)、SDK SecCode.h keyコメント | algorithm配列とhash配列は対応順。配列順は優先順位ではなく、選択されたalgorithm/hashは別に照合する |
| PS-03 | [Security codedirectory.h（固定commit）](https://raw.githubusercontent.com/apple-oss-distributions/Security/db15acbe6a7f257a859ad9a3bb86097bfe0679d9/OSX/libsecurity_codesigning/lib/codedirectory.h) CodeDirectory／getSlot／signingLimit | packed hash範囲・負のspecial slot・version別field。Appleの広い互換受理範囲をそのまま採用しない |
| PS-04 | [Security codedirectory.cpp（固定commit）](https://raw.githubusercontent.com/apple-oss-distributions/Security/db15acbe6a7f257a859ad9a3bb86097bfe0679d9/OSX/libsecurity_codesigning/lib/codedirectory.cpp) checkIntegrity／slotIsPresent／cdhash | 内部range・page数・digest処理、cdhashを20bytesへ切詰める経路。実APIの返却長/対象との適合は未検証 |
| PS-05 | [xnu cs_blobs.h（固定commit）](https://raw.githubusercontent.com/apple-oss-distributions/xnu/f6217f891ac0bb64f3d375211650a4c1ff8ca1ea/osfmk/kern/cs_blobs.h) Magic numbers／CS_CodeDirectory／CS_SuperBlob | magic、slot 5/7、index/length、version field配置。ABI安定性やDER意味schemaの保証ではない |
| PS-06 | macOS26.5 SDK `usr/include/mach-o/loader.h` mach_header_64／load_command／linkedit_data_command | file内offset/length、64-bit load commandの8byte alignment。SuperBlobに同じalignmentを推測して適用しない |
| PS-07 | macOS26.5 SDK `Security.framework/Headers/CSCommon.h` SecCSDigestAlgorithm、`SecCode.h` CopySigningInformation/keyコメント | SHA-256とSHA-256-truncatedを区別。validityと情報取得成功を分離する |

SDK rootは`/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`。headerを読むだけでAPI/署名/Nodeを実行していない。
Apple Webは公式検索抽出も照合した。一部の直接取得はJS外枠で、全文取得済みとはしない。
通常sandboxのGitHub DNS解決は失敗したため、読取専用の承認済みネットワーク経路で公開refだけを確認した。資格情報/非公開リポジトリは使用していない。

## 3. 入出力・trustの分離

将来の入力は、deployment検査が安全に開いて保持したFD、root承認ledgerの期待file SHA-256/UID/世代/release、共有開始Instant/cancel、同じnative handleのvalidity成功後の限定API観測。
argv/env/path文字列だけや「検証済み:true」という呼出し側boolを根拠にしない。テストで与えるbytes/観測と、実OSの真正性を区別する。

部品は段階を分離する案とする。

1. `PhysicalInventory`相当：bounded bytesの構造/slot有無/CodeDirectory view。署名valid・absenceの証拠ではない。
2. `CodeDirectoryMatchOnly`相当：同一profileで局所算出したCD digestと、型検査したAPI観測との一致。CMS/OS validityの代用ではない。
3. entitlement統合：別のXML typed比較を使い、DERがあればUnsupported、なしでもabsence未証明なら停止。全表現一致を自動生成しない。

いずれもprivateな将来型で、今回API/JSON/実装を追加しない。raw bytes/identifier/Team ID/pathはDebugや有限理由へ出さず、件数/形式/停止理由だけを扱う。

## 4. 解析上限案

| 対象 | 上限・条件 |
|---|---|
| 保持file | 既存512MiB、regular単一link、事前の信頼済みmetadata。全体hashはblock単位で処理 |
| Mach-O | thin little-endian arm64、subtype ALL、MH_EXECUTE、32bytes header |
| load commands | sizeofcmds 1MiB、ncmds4096、各command 8bytes以上・8byte alignment |
| signature領域 | LC_CODE_SIGNATUREをちょうど1件、datasizeは5MiB以下、file内に包含（最大CDとCMS等を収める。§4.1） |
| SuperBlob | index64件まで。index表/全child区間のchecked演算、重複/重なり拒否 |
| CodeDirectory | 初期は1個。lengthは`hashOffset + 32*nCodeSlots`と完全一致し、最大4MiB＋header領域（64KiB）以下。nSpecialSlots最大7、nCodeSlots最大131072 |
| entitlement取得 | API raw＋物理XML＋DERのbytes合計64KiB。大きいblobをいったん複写してから制限しない |
| API観測 | 初期algorithm/hash配列は各1件、選択algorithmは整数、cdhashは20bytes、CD identifier/teamは各128bytesまで |
| 時間/取消 | 外側の元Instantから10秒、読取block/command/index/hash loopとAPI前後で確認。新しい予算を作らない |

### 4.1 上限の整合（draft-0.2で修正）

draft-0.1のCodeDirectory上限256KiBは、nCodeSlots上限131072（hash配列4MiB）・保持file上限512MiB（4KiB page換算で131072 page）と矛盾し、
約8,000 slot（file約32MiB）を超えるartifactを必ず拒否していた。レビュー中に観測したNode v24.18.0（1台・1版、約120MB）のCDは
937,904 bytes（29,299 slot×32＋header等）で、draft-0.1では通らない。
CD上限を「`hashOffset + 32*nCodeSlots`との完全一致、最大4MiB＋header領域64KiB」へ、signature領域をそれを収める5MiBへ改めた。
file上限・nCodeSlots上限・CD上限・signature領域上限が同じpage数から導かれるようにし、どれか一つだけを緩めない。
16KiB pageは同じfile上限でslot数が少なくなるため、この上限内に収まる。

値は初期局所上限案で、既存の上限を緩めない。framework内部の確保量/停止しないFFIのhard timeoutを保証しない。
割当は検査後のcommand領域・signature領域へ限定し、全fileをVecやmmapで確保しない。

## 5. Mach-Oからsignature領域まで

1. 同一保持FDでmetadata/full-file SHA-256を取得し、ledgerの期待値と一致させる。file offsetを変えないpreadを使う案。
2. headerをlittle-endianとして明示decode。fat/swapped/別arch/subtype/bundle/dylibを拒否する。
3. `32 + sizeofcmds`をchecked加算しfile内に収める。ncmdsと最小command長の必要量も検査する。
4. commandをncmds件完全走査。cmdsize>=8、8の倍数、現在位置へのchecked加算、command領域内包含を検査し、最後は領域末尾に一致させる。
5. 非対象commandはサイズ検査後に読み飛ばすが、未知の`LC_REQ_DYLD`付きcommandは初期未対応として拒否する。理解していない必要機能を無視しない。
6. LC_CODE_SIGNATUREはcmdsize=16を要求。重複/欠落、dataoffがheader/commandに重なるもの、datasize<12、overflow/EOF外は拒否。
7. 初期profileはsignature領域末尾がfile末尾に一致するものに限定する。署名後の余分bytesを黙って捨てない。実artifact適合は未確認。

手順5で名前を認識するrequired commandの初期集合案はLOAD_WEAK_DYLIB/RPATH/REEXPORT_DYLIB/DYLD_INFO_ONLY/LOAD_UPWARD_DYLIB/MAIN/DYLD_EXPORTS_TRIE/DYLD_CHAINED_FIXUPS（SDKの各LC名）。FILESET_ENTRYは対象外で拒否する。
認識したcommandもpayloadの安全性を検証した意味ではなく、この部品は一般Mach-O/dyld validatorではない。依存/loaderの許可はclosure・配備検査に委ね、Security validityも省略しない。

既存deployment/pathのtrustと更新排他は別の責務。保持FDがあるだけで、Securityが同じbytesを検査することを保証したとはしない。

## 6. SuperBlobの完全列挙

signature先頭にembedded signature magic `0xfade0cc0`、BE length/countを要求する。
`12 + 8*count <= length <= datasize`をchecked演算し、offsetは**SuperBlob先頭基準**で解釈する。
index type/offsetを全件検査し、各childのmagic/length（8bytes以上）がindex表の後でSuperBlob内に収まることを要求。
type重複、同じchildの別名参照、区間重なり・切詰めを拒否。indexの並び順は要求せず、区間を一度sortして検査する案。
child間gapとSuperBlob末尾/LC領域末尾の未使用bytesはzeroだけ許す。非zero paddingは未知データとして停止。zero走査も予算に含める。
SuperBlob/childにload commandの8byte alignmentを流用せず、byte境界でchecked解析する。

| slot | 初期の構造対応 | 必須性・拒否条件 |
|---|---|---|
| 0 CodeDirectory | magic `0xfade0c02`、§7へ | ちょうど1件必須 |
| 2 requirements | magic `0xfade0c01`、envelope長を検査したopaque payload | optional。存在すればCDのslot -2とのhash一致必須。独自のrequirement式実行器を作らない |
| 5 XML | magic `0xfade7171`、blob全体をhash対象として保持 | optional、型/値解析は既存限定XMLへ別途接続。存在をabsenceへ変えない |
| 7 DER | magic `0xfade7172`、envelopeとhashだけ検査 | 存在すれば診断可能でもentitlement統合はUnsupportedで停止 |
| 0x10000 CMS | magic `0xfade0b01`、非空payloadをopaqueで保持 | 初期profileはちょうど1件必須。CMSの自己解析で署名成功を生成しない |
| alternate CD（0x1000以降）、ticket、launch/library constraints、その他 | 初期未対応 | 先頭/最良を推測せず拒否。物理署名の別候補を隠さない |

このprofileは合法な署名全般を受理するものではない。unknown slotを消したり、正規化・自動再署名して通したりしない。

## 7. CodeDirectory初期subset

### 7.1 header・内部range

versionは**0x20400と0x20500だけ**を初期候補とし、最小header長をそれぞれ88/96bytesとする。古い/新しい版を近い版へ解釈しない。
magic/総長、spare2/spare3=0、scatterOffset=0を要求。0x20500はpreEncryptOffset=0のみ。linkageやscatter等の追加配列は未対応。
hashType=2（SHA-256）、hashSize=32、platform=0を要求。SHA-1/SHA-256-truncated/SHA-384等へfallbackしない。

`S=32*nSpecialSlots`、`C=32*nCodeSlots`をchecked演算し、`hashOffset >= S`、`H=hashOffset-S >= header_min`、`hashOffset+C <= length`を要求。
identifier/teamのoffsetはheaderの後・Hの前。各128bytes以下の非空UTF-8をNUL終端まで完全に確認し、制御文字/範囲外/相互重なりを拒否する。hash配列/固定fieldへstringを重ねない。
team offset=0を初期profileでは拒否する（後段のDeveloper ID policyにも必要）。表示用文字列やcase-foldで代替しない。

### 7.2 code coverageとheader属性

初期はcodeLimit64=0、codeLimit=dataoff（signature領域の開始）、pageSize exponentは12または14だけを候補とする。
`nCodeSlots = (codeLimit-1)/page_bytes + 1`をoverflowなしに検査し、空coverageやfile範囲外を拒否する。
execSegBase/execSegLimitはcodeLimit内のchecked区間として検査する。runtime/execSegFlagsは観測値を保持し、未知bitや未対応の意味を黙ってmaskしない。
execSegFlagsのexact policy/許可bit集合は未承認。純粋な構造検査とruntime採用判断を分離し、この項目が未決のままpermitへ進めない。
static flags・identifier/teamは、将来の同一native snapshot/承認policyとの一致も要求する。

この部品で全page hashやCMSを独自に再検証する案ではない。構造/coverageの整合とCD結合を扱い、暗号的validityは先行Security検査を必須とする。

### 7.3 special-slot hash

slot `-k`は`hashOffset - k*32`から32bytes。kがnSpecialSlots外なら表現上未割当、範囲内all-zeroなら表現上空として区別する。
requirements/XML/DERが存在する場合は**child wrapperを含む総長bytes**のSHA-256を計算し、それぞれ-2/-5/-7と一致させる。
childあり＋hash空/未割当、childなし＋hash非zero、digest違いは拒否する。DERのhash一致は意味解釈成功ではない。
standalone初期profileでは-1/-3/-4/-6の非zero hashを未対応として停止し、Info.plist/resources等の外部対象を勝手に探索しない。
zero/未割当が整合しても、証拠レベルはslot診断にとどめる。AbsenceProvenは生成しない。

## 8. Security APIとのCodeDirectory結合案

先行validity成功後の**同じ保持code handle**から、固定取得profileで公開keyを取得する。private CodeDirectory/FullCdHashesキーを代替経路にしない。
以下はまだ実装していないtyped観測拡張の契約案。

1. DigestAlgorithmはCFNumber整数2、DigestAlgorithmsはCFArrayで整数2が1件だけ。CFBoolean/float/範囲外を数値へcoerceしない。
2. CdHashesはCFArrayでCFDataが1件、UniqueもCFData。両dataは20bytesで同一。null/型違い/重複/配列長差は拒否する。
3. 保持FDから取り出したCodeDirectoryの**headerを含むlength bytes**へSHA-256を計算し、先頭20bytesを対応cdhashと一致させる。残り12bytesを無視した完全32bytes照合と報告しない。
4. CDのhashType/algorithm、identifier/team、全static flags、physical/XML/DER hashとAPI snapshotの整合を同時に要求する。
5. APIの選択algorithm/Uniqueが配列内の同じ要素に対応することを照合する。配列順やbytes長からalgorithmを推測しない。

公開sourceには20bytesへ切詰める経路があるが、公開keyの一般契約は将来変わり得る。採用OSでこの限定profileが返ることは未確認。32bytesが返った場合も暗黙受理せず停止する。
full-file SHA-256はroot ledgerの期待値、full CD SHA-256は局所digest、20bytes cdhashはAPIとの限定対応と分けて保持する。
一致はCMSの独立検証ではない。またAPI観測をserializableな自己申告へ落として後から別handleへ付け替えない。
single-CD制限を広げる場合は全alternateとalgorithm集合、OSの選択挙動を別設計/承認する。

## 9. FD・世代・時刻と差替えの限界

将来の統合順序案：更新排他取得→保持FD/full hash/metadata→inventory→同じpathのnative validity/情報取得→CD照合→同じFDのsignature領域/全体hash/metadata再確認→activation/ledger世代と期限再確認。
metadata比較はdev/ino/size/owner/mode/link/mtime/ctimeを含め、保持祖先FD/path再openの検査も引き継ぐ。
inode/mtimeだけが同じ、またはcdhashだけが同じことを理由に、file全体/世代確認を省略しない。
読取前後の差替え、同時書込、短読取、期限/cancel、lease喪失は全結果を拒否する。

ただしpath-based Security APIと保持FDはatomicに束縛されない。途中差替え→復元や、検査後execまでの変更を、これらの前後比較だけで排除したとはしない。
更新排他・release保持・exec直前の再確認とsingle-thread/FD前提が未完了なら、実行permitは生成しない。
同期FFIやblocked I/Oの強制中断も未実装。bounded loop検査をhard realtime保証としない。

## 10. 拒否・試験・未確認事項

内部有限理由案：invalid_macho / invalid_range / duplicate_slot / overlapping_blob / unsupported_cd / unsupported_slot / special_hash_mismatch / api_cd_mismatch / identity_changed / unsupported_der / absence_unproven / limit / deadline / cancelled。
理由の細分化は内部診断案であり、公開exit code/JSON契約を今回変更しない。

| 合成群（未作成・未実行） | 必須ケース |
|---|---|
| bounded構造 | ncmds/sizeofcmds/全length/offsetの上限±1、checked overflow、EOF/短読取、alignment、未知required command |
| signature | LC欠落/重複、table侵入、未整列index、同一blob alias/重複/重なり、zero padding/非zero padding、未知slot/alternate |
| CD | 20400/20500、各最小長、string終端/重なり/制御文字、hash範囲、scatter/preEncrypt/未知version、coverage/pagesize/algorithm差 |
| special slot | -2/-5/-7のwrapper込みhash、一部bodyだけのhashを拒否、zero/未割当/child有無の全組合せ、DERがあれば統合停止 |
| API結合 | Number/Boolean型混同、20/32bytes、配列長差/選択値差/algorithm差、同issuer別CD、同CDでもfull-file差、別handle観測 |
| 終了/非出力 | 途中差替え・世代変更・timeout/cancel・資源解放、slotなしをabsenceへしない、raw/keys/hash/pathの秘密非出力 |

### 10.1 観測したNodeとの照合（2026-10-19、レビュー）

ローカルのNode v24.18.0（1台・1版）をscratchpadのscriptと`codesign -dvvv`で読取専用に照合した（プロジェクトへは追加していない）。
- LC_CODE_SIGNATUREは1件・cmdsize16、signature末尾はfile末尾に一致（dataoff 120,008,256、datasize 957,104）。
- `LC_REQ_DYLD`付きcommandはCHAINED_FIXUPS/EXPORTS_TRIE/MAINの3件で、§5の認識集合に含まれる。
- SuperBlobはslot 0/2/5/7/0x10000の5件でalternate CDなし。SuperBlob（948,091 bytes）後のdatasizeまでの残りは全てzero。
- CDはversion 0x20500、SHA-256・hashSize32、platform0、pageSize 2^12、spare/scatter/preEncrypt/codeLimit64=0、codeLimit=dataoff、nSpecialSlots7、nCodeSlots29,299。
- special slot -2/-5/-7はwrapper込みSHA-256と一致し、-1/-3/-4/-6はzero。CD全体のSHA-256先頭20bytesが`codesign`のCDHashと一致。
- execSegFlagsは0x1（許可bit policyは未承認のまま）。CD lengthは937,904 bytesで、§4.1の修正前上限を超えていた。
1台・1版の観測であり、採用artifactの適合証明ではない。DER slot 7があるため、本部品が通ってもentitlement統合は停止する。

承認待ち：subset/局所上限、zero padding方針、execSegFlags、CodeDirectoryの実OS対応、20bytes API対応、CMSとembedded CDの同一性、SDK/profile固定、更新排他とhard timeout。
Nodeのsingle/alternate CD構成、CodeDirectory version/pageSizeや署名末尾条件は採用artifactで未確認。既存1台・1版のslot観測だけでは本subset全体の適合を証明しない。
DER decoder・absence十分条件・標準DOCTYPEは別課題のまま。実装開始はまず純粋なbounded inventory/parserからとし、合成fixtureを本番policyへ転用しない。
