# BP-5 R-2 OL-03：native Security backend（未有効）

Version: draft-0.10 / Date: 2026-10-19 / Status: native部品は未有効。raw XML・A/B・M0〜M4・macOS metadata sourceは別部品で内部実装。保持FDの運用移譲/OS取得・native接続・DER/absence・実API適合は未確認。

## 1. 境界

[内部契約](BEST_PRACTICE_BP5_R2_OL03_SECURITY_BOUNDARY_DESIGN.md)のprivate `Backend`を実装する。
`native.rs`は所有権/手順/投影、`native/ffi.rs`はmacOS arm64限定のSecurity/CF宣言、`native/file.rs`は保持FDの読取を扱う。
native関数を実装したが、**通常起動・ledger reader・permit・execへは接続していない**。
本番registryはNone、通常v2入口はUnavailable、runtime gateは92を維持する。
実Security APIの呼出し、署名/公証、実機/PDI操作、token発行、設定変更は行っていない。telemetry調査は保留。

## 2. SDK・固定API経路

ローカルのmacOS 26.5 SDKの公開header宣言を読取り、ABI型/定数を照合した。採用SDK/OSの本番承認ではない。
`SecStaticCode.h`、`SecCode.h`、`SecRequirement.h`、`CSCommon.h`とCoreFoundationのString/URL/Dictionary/Number宣言を対象にする。

| 操作 | 実装するAPI/条件 |
|---|---|
| Node code取得 | 絶対pathから`SecStaticCodeCreateWithPath`、create flags=0 |
| launcher取得 | `SecCodeCopySelf`→`SecCodeCopyStaticCode`、copy flags=0。argv[0]を使わない |
| requirement | 固定templateから`SecRequirementCreateWithString`。任意条件/quote等の注入を拒否 |
| static validity | `SecStaticCodeCheckValidity`。`NoNetworkAccess`（1<<29）＋`CheckAllArchitectures`（1<<0）＋`SingleThreaded`（1<<12） |
| self dynamic validity | `SecCodeCheckValidity`。`NoNetworkAccess`、同じ保持requirementを使用 |
| signing情報 | `SecCodeCopySigningInformation`、`SigningInformation`（1<<1）。これだけで署名validとしない |
| 実体path | `SecCodeCopyPath`→CFURL型検査→bounded filesystem表現。期待path完全一致＋現在pathのidentityと保持FDを再照合 |

static検査ではExecutable/Resources検査省略flagsを使用せず、失敗後にflagsを緩めて再試行しない。
`StrictValidate`は本初期profileでは設定していない（bundle向け追加検査）。初期対象はthin arm64の実行fileのみ。
`SingleThreaded`はresource検査の並列化抑制であり、framework/OSがthread/FDを一切増やさない保証とはしない。
NoNetworkAccessの指定を、OS全体の通信ゼロ・最新失効/公証確認済みと説明しない。native OS適合・flag受理は未検証。

## 3. 固定requirementのdraft実装

`developer_id_application_v1`、`apple_developer_id`、`developer_id_application`だけを認識する。
anchor apple generic、Developer ID中間証明書のOID `1.2.840.113635.100.6.2.6`、leafのApplication OID `1.2.840.113635.100.6.1.13`、leaf subject.OU、identifierのAND条件を生成する。
Team IDは限定大文字英数字、identifierは既存ID用限定ASCIIで、長さ上限と非空を要求する。null/true requirementへのfallbackはない。
これは**審査用templateの実装**であり、本番policy/発行者/OIDの採用承認ではない。

Snapshotのanchor/certificate classラベルは、成功した固定requirementの述語から導く。証明書display文字列を取得・照合したという意味ではない。
Team IDとidentifierはsigning dictionaryから型付き取得して既存比較器側で完全一致させる。
独立した証明書chain抽出・検証を追加したわけではない。実SDK/OSの挙動とtemplateの専門レビューは別途必要。

## 4. CF所有権・型投影・停止

- Create/Copyの非null出力を`Owned`へ直ちに収容。失敗statusと非null出力が同時に返っても解放する。0 status＋nullは拒否。
- 補助CFURL/CFStringもRAII管理。dictionaryのGetで借用したkey/valueは親所有objectの生存中だけ使用し、個別にReleaseしない。
- `CFGetTypeID`でURL/String/Dictionary/Number/Boolean/Dataを区別。整数flagsはfloat拒否・SInt64への正確な変換成功・u32範囲を要求。
- StringはCF長と変換量を検査し、128bytesの固定bufferから投影。部分変換・不正UTF-8・制御文字を拒否。
- dictionaryは32件まで。count確認後、固定長key/value bufferへ列挙する。Securityが返す所有dictionaryを同時変更しない前提。外部mutable辞書を受け取る公開APIは設けない。
- 全static flags差・ad-hoc/linker-signed bitを拒否。CFNumberをCFBooleanへ変換しない。
- 未知statusは固定ApiFailedへ写像。CFErrorを要求せず、raw OSStatus/issuer/blob/pathを表示しない。
- static再検証開始で以前の検証済み状態を破棄。launcherのSnapshotはdynamic self検証も成功していないと拒否する。

## 5. entitlementの保守的な対応範囲

[raw／DER整合・absence証拠設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_ENTITLEMENT_EVIDENCE_DESIGN.md)に公式仕様/SDKの照合、対応形式案、拒否条件、未確認事項を整理した。raw XMLの限定解析/型付き辞書比較は[別の純粋部品として合成実装](E2E_BEST_PRACTICE_R2_OL03_RAW_XML_SYNTHETIC_2026-10-19.md)したが、nativeへは未接続。[物理signatureの純粋bytes parser](E2E_BEST_PRACTICE_R2_OL03_PHYSICAL_SIGNATURE_SYNTHETIC_2026-10-19.md)も同様に未接続である。以下の停止条件は緩めていない。
特にAPI rawは物理署名slotの元bytesとは限らない。公式WebのRequirementInformation指定とSDKのgeneric注記の差も記録し、将来は固定取得profileを審査する。今回はSigningInformationのみの実装を変更していない。

native初期対応は**型確認済みdictionaryが存在し、raw entitlementキーが存在しない場合だけ**。
辞書欠落はUnknownObservation。raw/DER等が同時にある場合は、対応形式・辞書との整合を未検証のためUnsupportedで停止する。
従って実artifactがdictionaryとrawの両方を返す場合、署名が正しくても本実装では停止する。
**観測（2026-10-19、レビュー中のローカル1台・Node v24.18.0の1版）**：scratchpadで作った読取専用のC probeから
`SecStaticCodeCreateWithPath`→`SecCodeCopySigningInformation`を呼ぶと、`kSecCSSigningInformation`だけでも
`kSecCodeInfoEntitlementsDict`と`kSecCodeInfoEntitlements`（raw）の両方が返った（`kSecCSRequirementInformation`併用時も同じ）。
よって現行実装は、正しく署名された観測Nodeを必ず`Unsupported`で停止する。entitlementを持たないlauncherは辞書自体が返らないため
`UnknownObservation`で停止する。実artifactを通すには、raw/DER形式と辞書の整合検査とabsence証明の両方が必要で、
[承認票](BEST_PRACTICE_BP5_R2_OL03_PRODUCTION_POLICY_APPROVAL.md)のPA-06と型付きpolicy契約§8の未決事項に当たる。
同じprobeで、実装の定数（NoNetworkAccess/CheckAllArchitectures/SingleThreaded/SigningInformation、ad-hoc/linker-signed flag、
ReqFailed/Unsigned/SignatureFailed/StaticCodeChangedのstatus）がSDKの値と一致し、`otool -hv`でNodeがthin arm64（subtype ALL、EXECUTE）であることも確認した。
absence producerは実装せず、nativeからAbsenceProvenを生成しない。
blob_bytes欄はこの限定経路の投影key/値のbyte予算であり、実raw blobの長さやframework内部確保量ではない。rawが存在するものは解析せず拒否する。
empty launcherが辞書欠落になる場合も救済しない。raw/DER整合・absenceの対応を承認/実装してから対応範囲を広げる。

## 6. FD・予算・残る競合

privateな`PinnedFile`は、将来deployment inspectorが保持したFileと正確な承認pathを渡すための部品。親directoryのtrustを再定義せず、owner緩和やpublic constructorは設けない。
現在はinstalled reader/deploymentとの受渡しを接続していない。
[保持FD/parser接続設計](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)に、安全なopenerからの所有権移動、A/B全体hashと採取bufferの結合、metadata/path/recordの再確認、共有読取予算の設計を分離した。共有予算と合成sourceのA/B・M0〜M4照合まで実装済みで、PinnedFile・OS metadataへは未接続。既存PinnedFileの呼出しごとの再hashや絶対path再openを、その接続が実装済みである証拠にしない。API実接続は同設計でも対象外。
preadでoffsetを変えずSHA-256を計算し、file/device/inode/size/owner/mode/link/mtime/ctimeを前後比較する。32bytes以上512MiB以下、regular単一linkを要求。
Mach-Oはlittle-endian64/ARM64/ALL subtype/MH_EXECUTEだけを初期受理する。
現在pathはO_NOFOLLOW/CLOEXEC/NONBLOCKで再openし同様にhashし、保持FDと比較する。親directoryの排他は別工程。
Security APIのpath参照とこれらの観測はatomicではない。途中差替え→復元や検査後の変更まで防いだ証拠ではなく、更新排他・exec直前再検証が必要。

元の開始Instant/cancelを共有し、内部Security呼出し前後・hash block・投影loopでも検査する。期限後のCopy出力を捨ててRAII解放する。
同期FFIの呼出し中に強制停止する仕組みはない。512MiBはこの部品の上限で、外側closure契約を緩める設定ではない。

## 7. 根拠と確認範囲

保持FDの[実metadata source詳細設計](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)で、fstat・ACL・xattr名・FSの取得と単発操作単位の共有予算を分離した。collector/単発Opsに続きstaged macOS実sourceを内部実装し、RawApi合成backendで確認した。実sourceでのOS取得・API接続は未実施。ACL意味・属性名の可視性・hard timeoutの未確認事項をnative検証の成功で救済しない。

| 資料 | 今回照合した点 |
|---|---|
| [SecStaticCodeCreateWithPath](https://developer.apple.com/documentation/security/secstaticcodecreatewithpath(_:_:_:)) | code objectを作成しても署名validityを証明しない |
| [Apple Code Signing Tasks](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Procedures/Procedures.html) requirementsの例 | Developer IDの固定anchor/OID条件。採用policyの承認とは別 |
| [kSecCodeInfoEntitlementsDict](https://developer.apple.com/documentation/security/kseccodeinfoentitlementsdict) | 欠落はentitlementなし以外の形式も含み得るため、空への救済なし |
| macOS26.5 SDK公開headers（上記§2） | FFI宣言、Create/Copy retained ownership、flags、CFRange/CFIndex、CF型取得とbounded変換 |

Webは公式検索抽出の説明と公開SDKを照合した。実Security APIの振る舞い、CF retain/releaseのOS上の適合、ネットワーク抑制や公証は検証していない。
[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_NATIVE_SECURITY_SYNTHETIC_2026-10-19.md)を参照。
