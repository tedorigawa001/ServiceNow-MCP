# BP-5 R-2 OL-03：raw／DER整合確認とabsence証明

Version: draft-0.4 / Date: 2026-10-19 / Status: raw XML・純粋物理signature parserは内部合成実装済み。保持FD/API結合・native接続・DER・absence・実API検証は未実施。

## 1. 結論と現在の境界

[native設計](BEST_PRACTICE_BP5_R2_OL03_NATIVE_SECURITY_DESIGN.md)§5の保守的停止を維持する。
APIのrawとdictionaryの意味が一致すること、署名内のXML/DER全表現が一致すること、entitlementが存在しないことは**別の証拠**として扱う。
rawキーの値を署名内の元bytesと断定せず、APIの両キー欠落だけからAbsenceProvenを生成しない。
DERの形式識別と意味解析も区別する。現時点で実装/承認済みのDER意味decoderはなく、DERが関係する完全照合は未対応として停止する。

本番registry未設定・通常v2入口Unavailable・runtime gate92・permit未発行を維持。
初版はMDのみ。後続で[raw XML限定部品の合成実装](E2E_BEST_PRACTICE_R2_OL03_RAW_XML_SYNTHETIC_2026-10-19.md)を追加した。native接続、実Security/CF呼出し、署名、公証、実機/PDI操作、token発行、設定変更は行っていない。telemetry調査は保留。
既存native設計に記載された以前の1台・1版のprobe観測は引き継ぐが、今回再実行した証拠ではない。

## 2. 根拠台帳（2026-10-19照合）

| ID | 公式URL／SDK・該当箇所 | 確認した点・限界 |
|---|---|---|
| EE-01 | [kSecCodeInfoEntitlementsDict](https://developer.apple.com/documentation/security/kseccodeinfoentitlementsdict) Discussion | dictionary欠落には、entitlementなしと別形式の両方がある。欠落単独ではabsenceにならない |
| EE-02 | [kSecCodeInfoEntitlements](https://developer.apple.com/documentation/security/kseccodeinfoentitlements) Discussion | CFDataのblob。Web説明はRequirementInformation指定を求める。一方SDKではgenericと記載（§3） |
| EE-03 | [SecCodeCopySigningInformation](https://developer.apple.com/documentation/security/seccodecopysigninginformation(_:_:_:)) Discussion、SDK SecCode.h 同関数コメント | validityと情報取得は別。破損時の部分情報やunsignedの取得成功を考慮し、先行validityと必須情報検査を要求 |
| EE-04 | [Using the latest code signature format](https://developer.apple.com/documentation/xcode/using-the-latest-code-signature-format) Overview／hash slotの説明 | XMLに加えDER entitlementを含む形式が存在する。主な起動要件の説明対象はiOS等であり、その条件をmacOS全版へ一般化しない |
| EE-05 | [CFPropertyListCreateWithData](https://developer.apple.com/documentation/corefoundation/cfpropertylistcreatewithdata(_:_:_:_:_:)) Parameters/Return Value、SDK CFPropertyList.h | plist解析と返却format・所有権。entitlement DER decoder、重複key拒否、DTD/外部参照禁止を保証する記述としては使わない |
| EE-06 | Apple公開[StaticCode.cpp](https://raw.githubusercontent.com/apple-oss-distributions/Security/main/OSX/libsecurity_codesigning/lib/StaticCode.cpp) `signingInformation`／`entitlements`／`component` | DER起点でXMLを再構成する経路と、内部専用DERキー・例外抑制がある。public APIのrawが物理slot原本とは限らないことの実装上の注意 |
| EE-07 | Apple公開[xnu cs_blobs.h](https://raw.githubusercontent.com/apple-oss-distributions/xnu/main/osfmk/kern/cs_blobs.h) Magic numbers／CS_SuperBlob／CS_GenericBlob／CS_CodeDirectory | XML/DER識別magic、slot 5/7、長さ・index構造の参考。安定したpublic DER意味スキーマの保証ではない |
| EE-08 | ローカルmacOS 26.5 SDK `Security.framework/Headers/SecCode.h` 332–403, 467–482／27.0 SDK同箇所 | public flagsとkeyの型/説明を読取比較。InternalInformationはApple用・変更可能と記載。実OSの返却挙動は今回未検証 |
| EE-09 | ローカルmacOS 26.5 SDK `usr/include/mach-o/loader.h` `mach_header_64`／`LC_CODE_SIGNATURE`／`linkedit_data_command` | 保持FDからsignature領域を列挙する候補の位置・長さ情報。公開headerだけでabsence証明が完成するわけではない |

SDKの場所は`/Library/Developer/CommandLineTools/SDKs/MacOSX26.5.sdk`と`MacOSX27.0.sdk`。採用toolchain/OSの承認ではない。
Apple Webの一部は直接取得がJS外枠で、Markdownリンクも取得失敗。公式検索抽出とSDK本文を突き合わせ、取得できなかった本文を読了済みとはしない。
EE-06/07は調査日の`main`を読んだ補助根拠で、特定OS buildと同一とは未確認。物理signature/DER parserの実装承認前に対象release/tag/commitと全必要構造を固定・再照合する。今回のAPI XML wrapperは設計済みmagic/length契約だけの合成実装で、実API適合を主張しない。
Community投稿・非公式DER decoder・private APIを本番根拠/依存に採用していない。

## 3. 今回見つかった取得条件の差

### 3.1 flagsだけでrawの完全取得を証明しない

EE-02のWeb説明とEE-08のgeneric注記に差がある。現実装はSigningInformation（2）のみ。
将来の取得profile案はSigningInformation | RequirementInformation（2 | 4）を**最初から固定**し、両方の根拠を満たす方向とする。
今回flagsを変更していない。特定OSでこのprofileが受理され必要情報を返すか、追加情報の量/処理時間も未検証。
欠落時にInternalInformationを追加したりprivate DERキーを探索するfallbackは設けない。

### 3.2 API rawと物理slotを区別する

EE-06の公開実装にはDER由来のXML再構成やdictionary補正、情報取得内の例外抑制が見える。
そのためAPI rawを`api_blob`、保持FD内のslotを`embedded_xml`／`embedded_der`として別々に記録する設計とする。
同じAPI応答内のraw/dictionary一致は二つの独立した暗号証拠ではない。元XML/DERとの一致も、OSが実行時に使う値と一致した証明も別途必要。

## 4. 証拠レベルと対応形式案

以下は証拠レベルの契約案。API内XML一致だけを示すprivate `ApiXmlMatch`を追加した。公開JSON/既存署名結果enumの変更はない。

| 状態 | 言えること | 言えないこと |
|---|---|---|
| `unknown` | 情報欠落・未対応・矛盾・上限超過で停止 | 空、問題なし |
| `api_xml_consistent` | 限定XMLとして復号したapi_blobとCFDictionaryが完全一致 | 物理DER/XMLの独立一致、absence、実行許可 |
| `embedded_consistent` | 対応済みの全物理表現とAPI値が一致し、signature/identityへの結合条件も成立 | OS全体の実行時値、更新排他、公証/最新失効確認、permit |
| `absence_candidate` | §7の必要条件が全てそろった検証候補 | 現時点でAbsenceProvenを生成できること |

| 形式 | 現実装 | 次の限定設計 |
|---|---|---|
| API CFDictionary | rawなしの場合だけ型投影 | rawと別に型/件数/値を保持、後で完全比較 |
| API CFDataのXML blob | nativeはrawがあれば停止。別の純粋部品だけ内部合成実装済み | §5の限定profileでAPI内部一致だけを検査。物理slot/CFData取得との接続はない |
| 物理XML slot 5 | 合成bytesのenvelope/hash検査のみ実装、実FDは未読取 | 意味解析は未接続。将来API rawとはbyte一致を要求せずtyped値を比較 |
| 物理DER slot 7／DER magic | 合成bytesのenvelope/hash検査のみ実装、実FDは未読取 | 意味decoder未承認のため停止。未知DERをXMLや空へ変換しない |
| binary/OpenStep plist、未知magic/将来形式 | 未対応 | 初期profileでは拒否 |
| entitlement slotなし | 未判定 | §7の構造検査と同一signature結合を設計・検証するまでunknown |

DERが存在するのにXML/API一致だけで`embedded_consistent`へ上げない。
最初のXML照合部品だけで、現在のraw拒否や通常入口停止を解除しない。

## 5. 限定XML profile（内部部品のみ実装）

- api_blobはCFData型確認後、長さを確認してbounded copy。`0xfade7171`とbig-endian長さを持つ8bytes wrapperだけを初期候補にする（EE-07）。headerなしpayloadを推測して救済しない。
- lengthはheader込み実bytesに一致。切詰め・overflow・末尾データ/余分NUL・BOM・別magicを拒否。実APIがこのwrapperを返す条件は採用OSで未検証。
- UTF-8、plist 1.0の単一dict、key→booleanという限定profile。XML byte列とCFDictionaryのkey集合・型・値を完全一致で比較する。
- XMLの5標準実体/数値参照は字句解析内で一度だけ復号。不正Unicode、key制御文字、空key、重複keyは**map構築前**に拒否。trim/case-fold/Unicode正規化/再serializeを同一性判定に使わない。
- falseは観測値として保持してtrueとの不一致を検出する。数値1・文字列true・array/data/nested dictは初期profile外として拒否し、存在しなかった値へ変換しない。
- ネットワーク/外部実体の解決は禁止。任意DOCTYPE、内部subset、ENTITY、parameter entity、未知PIを拒否。
- 通常plistにあるApple PLIST 1.0の標準PUBLIC DOCTYPEは、固定の識別子/URLからなる宣言を**不活性な字句としてのみ許す案**。DTDを取得/展開しない。正確な許可構文・引用符/空白の扱いは実装前レビューで固定する。承認前はDOCTYPE付き入力も停止。
- `CFPropertyListCreateWithData`だけへの丸投げでは、事前の重複key/深さ/DTD制限を満たしたとしない。今回CFは使わず§5.1の限定文法を実装した。CF解析結果との比較は未実施。

### 5.1 今回実装したsubsetと接続境界

`signature_boundary/raw_xml.rs`に、依存追加なし・非再帰の限定文法を実装した。一般XML parserや正規表現抽出ではなく、閉じたtoken/構造だけを受理する。
optional XML宣言は先頭のみ、version 1.0、optional encodingはUTF-8のみ（順序固定）。plistはversion 1.0属性が必須、dict属性は禁止。
ASCII空白と両種の引用符を許可し、empty dictは自己終了/開始終了の両方、booleanは自己終了/内容なしの開始終了の両方を受理する。
comment/CDATA/未知PI/standalone/namespace/BOM/全DOCTYPEを拒否する。標準DOCTYPEの不活性許可も未承認なので実装していない。
plist→dict→key/boolean以外の入れ子は即拒否するため、深さ8より厳しい固定構造。XML再帰やentity再展開は行わない。

入力は借用したblob bytesと既存の型付き`Observation`。CFData取得・CFDictionaryの真正性は検査しておらず、呼出し側が与えた観測同士の比較である。
raw envelope込み64KiB・観測の既存byte予算64KiB、32keys、key復号後UTF-8 128bytesを検査する。原本全体をStringへ複写せず、keyだけboundedに確保する。
false同士の一致を認めるのは観測の整合であり、本番policyとしてfalseを許す変更ではない。既存policy比較器/PA-06は別契約のまま。
結果は件数のみの`ApiXmlMatch(api_only_not_execution_authority)`。DER magic、raw欠落、AbsenceProven/Unknown観測は拒否し、完全な物理表現一致/absenceの証拠型を生成しない。
元のInstant/cancelを共有し、空白/実体参照/key走査と最終照合まで期限を確認する。時計のtest hookはprivate関数内だけで、公開起動口は増やさない。
native raw拒否・signing情報flags・reader・permit/execは変更していない。API XMLだけ一致してもnativeの停止を解除しない。

## 6. 物理signatureの列挙とDER（必要な追加設計）

[物理signature列挙・CodeDirectory結合設計](BEST_PRACTICE_BP5_R2_OL03_PHYSICAL_SIGNATURE_DESIGN.md)に、固定commitの根拠、bounded FD解析、single-CD/SHA-256初期subset、APIの20bytes cdhashとの照合、拒否条件・未確認事項を具体化した。純粋bytes parserだけ[合成検証済み](E2E_BEST_PRACTICE_R2_OL03_PHYSICAL_SIGNATURE_SYNTHETIC_2026-10-19.md)。保持FD/API結合は未接続で、DER/absenceの停止は変更しない。

保持FDの同一thin arm64/MH_EXECUTEからload commandsを完全走査し、LC_CODE_SIGNATUREをちょうど1件要求する案。
cmdsize/sizeofcmds/ncmds、領域のfile内包含、加算/乗算overflow、重複/重なり、切詰めを検査する。signatureなしをabsenceにしない。
SuperBlobのmagic/length/count/indexを全件走査。slot 5（XML）・7（DER）と、それぞれmagic `0xfade7171`／`0xfade7172`の整合を検査する。
未知slotを無条件に無視せず、対象signature profileで認めたCodeDirectory/CMS/requirements等だけを識別する。slot/magic/領域が曖昧なら停止。
CodeDirectoryの全対象special hash slotも照合し、物理slotなしだが対応hashあり、逆の組合せ、欠けたCodeDirectory、未知version/hash方式は拒否する。
これらは独自CMS暗号検証を作る計画ではない。先行Security validity、same-object/path/FD/hash、CodeDirectoryの対応付けを別途維持する。

DER意味decoderは今回は選定しない。public SDKのSecurity Headers検索では汎用entitlement DER decoderを確認できなかった（完全なAPI不存在の証明ではない）。
EE-06のCoreEntitlements/privateキーを利用しない。`SecTaskCopyValue(s)ForEntitlement(s)`も、固定静的fileの全表現列挙/absenceの代替にはしない。
DERを扱うなら、対象Apple公開sourceを固定し、version/tag/長さ・canonical encoding・重複・全bytes消費・bool型・未知型の拒否契約を別途審査する。
一般的なASN.1 decoderやDERという名称だけでApple entitlementの意味schemaを満たすとはしない。

## 7. absenceの必要条件案

AbsenceProvenは呼出し側がboolで指定できる値ではなく、検査完了を示すprivate証拠型からだけ作る案。
以下を全て満たすことを必要とするが、**十分性は採用OS/profileと実fixtureで未確認**。当面producerは無効のまま。

1. 承認policyに対するstatic validity（launcherはdynamic selfも）が成功。unsigned/ad-hoc、不完全情報、unknown statusは除外。
2. 正確な取得profileで同一objectのdictionary/rawが共に欠落。取得成功だけでなくidentifier/flags/issuer等の必須情報が完全。
3. 同じ署名後hashの保持FDで既知形式のembedded signatureを完全列挙し、XML/DER slotが存在せず、CodeDirectory側にも対応する非空hashがない。
4. detached signature・外部signature source・非対応CodeDirectory/将来形式が関係しないと確認できること。現在のpublic source観察だけでは成立としない。
5. Security側objectと解析したembedded signatureの同一性を、path名だけでなくidentity/hashと対応するCodeDirectory情報で結合する方法を承認・検証すること。
6. 全検査の元開始時刻/cancel/10秒予算・前後metadata・更新排他・exec直前再検査の条件を満たすこと。

空dictが存在する場合は`Dictionary(empty)`でありabsenceではない。物理empty XML/DER slotがある場合も不存在ではない。
要件のいずれかが未確認ならunknownで停止し、empty policyとの一致へ進めない。

## 8. 取得量・拒否理由・合成試験案

上限案はAPI raw＋物理XML＋DERの取得bytes合計64KiB、dictionary 32keys/key128bytes、XML深さ8。
signature envelopeは4MiB、load-command領域1MiB、ncmds4096、SuperBlob index64件を初期案とする。既存file上限512MiB・外側10秒は変更しない。
これは未承認の追加局所上限であり、framework内部確保量/停止しないFFIを制限できる保証ではない。

内部理由案：`invalid_envelope`、`unsupported_representation`、`representation_mismatch`、`duplicate_key`、`absence_unproven`、`limit`、`deadline`、`cancelled`。
公開exit codeや既存enumを今回変更しない。raw bytes/keys/values/path/証明書をerrorへ出さず、形式・件数・有限理由だけを将来返す。

| 合成群 | 必須ケース（実装済み範囲は§5.1/§6/検証記録を参照。実FD/API結合・DER意味解析/absenceは未実装） |
|---|---|
| API XML一致 | key順だけ違う一致、entity復号、empty、false保持、raw/辞書片方欠落・値/型/集合不一致 |
| XML拒否 | 重複key、DTD/ENTITY/外部参照、未承認DOCTYPE、深さ/件数/長さ超過、数値/string/nested、末尾データ、不正UTF-8 |
| envelope | XML/DER magic、big-endian長さ、overflow、切詰め、slot/magic矛盾、未知version・slot、範囲重なり |
| DER未対応 | DER-only、XML＋DER、API XML再構成だけ一致を、完全一致/absenceへ昇格させない |
| absence | 物理/CodeDirectory/APIの全組合せ、unsigned/不完全情報/外部署名を拒否、emptyと不存在を区別 |
| 結合/資源 | 別FD/別CodeDirectory、前後差替え、期限/cancel、部分取得CF資源解放、raw非出力 |

## 8.1 観測したNodeでの到達範囲（2026-10-19、レビュー）

レビュー中にローカルのNode v24.18.0（1台・1版）の`LC_CODE_SIGNATURE`を読取専用で走査した（scratchpadの小さなscriptで、プロジェクトへは追加していない）。
SuperBlobは5 slot：CodeDirectory（0）、requirements（2）、**XML entitlement（slot 5、`0xfade7171`、640 bytes）**、
**DER entitlement（slot 7、`0xfade7172`、337 bytes）**、CMS（`0x10000`）。また以前`codesign`で確認したXML entitlementには、
標準の`<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" …>`が含まれていた。

- §5.1の初期subsetは全DOCTYPEを拒否するため、観測Nodeのentitlement XMLは現状必ず`InvalidXml`になる。§9の1（DOCTYPE許可構文の審査）が実artifact対応の前提である。
- XML/DOCTYPEが通るようになっても、§4のとおりDERが存在する限りXML/API一致だけで`embedded_consistent`へ上げないため、観測Nodeは`api_xml_consistent`までしか到達しない。
  §9の4（DER decoderの信頼元・対応subset）は、absenceのためだけでなく**Nodeを通すための必須前提**である。
1台・1版の観測であり、採用版の署名構成は別途確認する。

## 9. 次の順序・承認待ち

1. evidence level、上限、取得flags、DOCTYPE許可構文をレビューする。
2. raw XMLのbounded envelope/限定構造/typed比較器だけを合成実装済み（24テスト）。標準DOCTYPE許可・native有効化は別工程。
3. 物理signature列挙の純粋bounded parserだけ合成実装済み。実FD読取/CodeDirectoryとAPIの結合、未承認のDER/absenceは別工程であり、停止を維持する。
4. DER decoderの信頼元/対応subsetとabsence十分条件を別審査する。確認できなければproducerは無効維持。
5. 別承認後の実artifact/OS適合で、API再構成、形式併存、empty/absence、例外/部分情報の挙動を検証する。

PA-05/06の運用/型方針、本番署名policy、OS/SDKの採用承認、更新排他・hard timeoutは依然未完了。
設計や合成検証の成功を、本番policy投入・通常起動・permit発行の承認に読み替えない。
