# BP-5 R-2 OL-03：launcher／Nodeの署名・entitlement検証設計

Version: draft-0.6 / Date: 2026-10-19 / Status: C方式を採択。純粋policy/ledger-0.2解析・参照/entitlement比較・安全なreader接続は内部合成検証済み。実署名検証・OS適合試験は未実施。

## 1. 目的と現在の境界

[OL-01の信頼済みビルド・配備設計](BEST_PRACTICE_BP5_R2_OL01_BUILD_DEPLOY_LEDGER_DESIGN.md)を具体化する。
[closure詳細設計](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)と
[FD読取の合成検証](E2E_BEST_PRACTICE_R2_OL03_DEPLOYMENT_READ_SYNTHETIC_2026-10-19.md)はbytes/metadataの検査であり、署名・発行者の検査ではない。
現在の`runtime_gate`は必ず92で停止する。本書の作成や署名検査部品だけの成功をgate解除に使わない。
telemetry調査は保留。本書では実装・署名コマンド・実機/PDI操作・token発行・設定変更を行わない。

以下の「必須」「拒否」はプロジェクト要件案であり、AppleがR-2の安全性を保証するという意味ではない。
公式資料で確認したAPIの性質・制約は§9に出典と確認範囲を示す。

## 2. 信頼元と承認の連鎖

| 対象 | 信頼元・必要な独立証拠 | 信頼しないもの |
|---|---|---|
| launcher | 承認したsource/toolchain・署名担当・Developer ID Applicationの発行者/Team ID/identifier・最終binary SHA-256・配備承認 | 自身のJSON、argv[0]、PATH、display名だけ、自己検査だけ |
| Node | 正確な公式artifactとrelease署名鍵/SHASUMSの確認、採用artifactの最終hash・実署名者・entitlement承認 | `node --version`実行だけ、Homebrew/nvmの可変path、署名済みなら任意のNode |
| ledger | 固定root所有activationがpinするexact bytes hash・世代・release・承認期限 | 実行UID所有ledgerの自己申告、同じ未検証download中の鍵/hash |
| 署名policy | 承認済みの固定policy IDと限定されたrequirement template、対象別の期待値 | ledger内の任意requirement文字列だけ、証明書display名、同じTeam IDなら全プログラム許可 |
| 配布/公証 | 別工程の発行者確認・公証/配布receipt・承認期限・失効時の停止責任 | notarizationを署名validityや最新失効情報と同一視、quarantine除去 |

同じ発行者でも別identifier、同じidentifierでも別署名者/別bytesは拒否する案。
Team IDとidentifierだけでDeveloper ID Applicationと開発用証明書を区別できるとはしない。
Appleの信頼anchor・証明書クラス・発行者条件を含むrequirement templateを専門レビューし、正確な条件は承認待ちとする。
既知でないTeam IDや証明書OIDを実値として本書に記入しない。
Node release署名の検証鍵とApple code signingの証明書は別の信頼経路で、互いの代用にしない。

launcher自身については、main以前のloader注入をmain内の自己検査で排除できない。
署名済みHardened Runtime・信頼済み配備・OSの起動制御を外側の前提とし、外部の配備担当による検査も必須にする。
起動後のself検証は防御の追加であり、侵害済みlauncherからの自己証明を信頼しない。

## 3. 検証対象とpolicy契約案

初期対象は承認したmacOS arm64上の通常Mach-O実行file。初期案はthin arm64のみとし、fat/universal・別arch/subtype・script/bundleは拒否する。
採用artifactがこの制約を満たすかは未確認。universal対応を必要とする場合は全sliceの署名者・entitlementまで別承認で設計する。
Appleはuniversalの一sliceだけの検査では不十分で、全sliceの署名者が同じとも限らないと説明している。[A1](https://developer.apple.com/documentation/security/secstaticcodecheckvalidity(_:_:_:))

| 照合項目 | 方針案 |
|---|---|
| path/identity/hash | 安全なFD読取の結果と、Security APIが検査するpath/実体を前後照合。署名後最終bytesのhashを使う |
| requirement | 固定templateから生成した承認済み条件を使う。null requirementや`true`等の緩い条件へfallbackしない |
| 発行者 | requirement検証に加え、取得したTeam ID/identifier/証明書クラスを承認値と照合。表示用publisher文字列は根拠にしない |
| 署名形式 | unsigned/ad-hoc/linker-only・不明形式を拒否。署名情報の取得成功だけでvalidとしない |
| runtime flag | 実署名のHardened Runtime bitが必要。全静的flagも承認snapshotと照合し、未知の差分は再承認へ回す |
| version | 実行せず承認済みartifact receipt＋最終hashへ結合。Security APIがNodeのsemverを保証すると扱わない |
| entitlement | §4の型付き完全一致。追加だけでなく欠落・false化・型変更も拒否 |

### 3.1 現行ledgerとの隔たり

現行0.1 ledgerの`signature_requirement`は文字列、`publisher`は文字列、`entitlements`は名前の配列、`hardened_runtime`はboolである。
これだけでは証明書クラス・期待する全flag・entitlement値や型の完全一致を表せない。
署名器が自由なrequirementを解釈して許可範囲を拡大する方式にはしない。
候補の比較・型付き期待値/観測値・移行は[型付き署名policy設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_TYPED_SIGNATURE_POLICY_DESIGN.md)に具体化した。
固定registryに期待値を一元化し、参照専用ledger-0.2からID/digestで結合するC方式を採択。[ledger-0.2 parser/参照binding](E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_SYNTHETIC_2026-10-19.md)と[安全なreaderへの内部接続](E2E_BEST_PRACTICE_R2_OL03_LEDGER_V2_READ_SYNTHETIC_2026-10-19.md)は合成検証済みだが、個別policy承認・実署名・本番reader有効化は未完了。
root activationがledger bytesをpinする点を維持し、旧recordを黙って新契約に読み替えない。
requirementを再文字列化すると表記が変わり得るので、round-trip文字列一致を論理的な同一性の証明にしない。[A2](https://developer.apple.com/documentation/security/secrequirementcreatewithstring(_:_:_:))

## 4. entitlementの型付き照合

### 4.1 対象別の期待値

- launcher：空dictionaryまたは安全に「entitlement自体がない」と証明された状態だけを許可する案。
  debug/DYLD/library validation/JIT例外等はfalseで記載されていても拒否する。
- Node：採用版について人が承認したexact dictionary。初期実装候補はstring key→CFBoolean trueだけとし、
  数値1、false、文字列、array、nested dictionary等は拒否する。必要なら契約の次版で型を明示して再承認する。
- Nodeの許可集合は現在未確定。OL-01にある1台・1版の観測を、そのまま本番allowlistにしない。
  `get-task-allow`やDYLD/library validation等の例外を承認するか、不要な例外を除いた別署名版を用いるかは人の判断が必要。
  再署名は公式署名との信頼連鎖を変えるため、単なる属性整理として行わない。

初期候補上限はdictionary32 keys・key128 UTF-8 bytes・entitlement blob64KiB。キーの制御文字/重複・不明CF型は拒否する。
順序は無視するが、keyと型付きvalueを完全一致で比較する。CFBoolean trueとCFNumber 1を混同しない。
上限は取得後の投影をboundedにする要件であり、Security.framework内部の確保量を制御できる証拠ではない。

### 4.2 「欠落」と「空」を分ける

`kSecCodeInfoEntitlementsDict`の欠落は、entitlementなしだけでなく別形式の場合もあるため、空集合へ変換しない。[A3](https://developer.apple.com/documentation/security/kseccodeinfoentitlementsdict)
adapterは少なくとも`dictionary`／`absence_proven`／`unsupported_or_unknown`を区別する案。
`absence_proven`を作れる条件は、採用SDKの取得flags・raw blob/DERを含む対応形式・取得APIの返却挙動を確認してから定義する。
取得flags不足、型違い、情報欠落、不明なDER形式は拒否し、XMLに見える文字列だけを独自解析して救済しない。
辞書と別形式の情報が食い違う場合も停止する。absenceを証明できない間は、entitlementを持たないlauncherでも検査成功にしない。
この部分のAPI適合確認は未実施であり、未署名ならキーがないという理由でlauncherを受理しない。

## 5. Security.framework adapter案と手順

Rustの小さいFFI境界から公開Security/CoreFoundation APIを使う案。crate/SDK/framework link・CF所有権は追加審査する。
通常起動では`codesign`/`spctl`/`security`/shell等の子processを起動せず、署名情報やraw CFErrorをstdout/stderrへ渡さない。

1. 元のclock/deadlineを共有し、OL-02 recordと配備fileのidentity/hashを検査する。検査開始時刻を作り直さない。
2. launcherは`SecCodeCopySelf`で呼出し元codeを得てdynamic validityを検証し、対応するstatic code/pathとledgerのlauncher実体を結合する。
   argv[0]や単なる実行path文字列ではselfを同定しない。このAPIでcode objectが得られるだけではvalid signatureではない。[A4](https://developer.apple.com/documentation/security/seccodecopyself(_:_:))
3. Nodeは安全なFDで照合した固定pathからstatic code objectを作成する案。任意path探索・別architectureへの自動切替なし。
4. 承認済みrequirementを生成し、`SecStaticCodeCheckValidity`等で署名・対象条件を検証する。情報抽出とvalidity検査を分離する。
5. signing informationを取得し、CF型/個数/サイズを確認した限定snapshotへ投影する。runtime flag・発行者・entitlementを型付き照合する。
6. path/FD/bytes identity・record世代・期限を再確認する。署名APIが同じFDを検査したと推測せず、path APIとの競合を残余として扱う。
7. この段階の出力は検査snapshot/限定集計のみ。他の全gateが未完了の間は実行permitを生成しない。

候補flagsはAPI別の固定集合とする。static validationの省略flags（`DoNotValidateExecutable`、`DoNotValidateResources`、`BasicValidateOnly`）や
未知bitを使わない。`StrictValidate`はbundle向けの追加検査であり、standalone binaryや閉包全体の保証を増やす魔法の指定と扱わない。[A5](https://developer.apple.com/documentation/security/static-code-validation-flags)
正確なflags組合せ・SDK可用性・CF取得項目は実装前に採用SDKと照合し、不適合時にflagsを減らして再試行しない。

## 6. オフライン・公証・時間の扱い

通常検証はnetwork不要を要求し、候補は`kSecCSNoNetworkAccess`。Appleの公開headerでは、この指定がオンライン失効/公証確認を抑えることも説明されている。[A6](https://github.com/apple-oss-distributions/Security/blob/main/OSX/libsecurity_codesigning/lib/CSCommon.h)
従って成功しても「最新の失効確認済み」「公証確認済み」と報告しない。オンライン強制確認flagとの併用を安全策と説明しない。
cacheや承認receiptの鮮度・有効期限・失効/撤回担当は配備工程で別途承認し、未知/不足なら停止する。
API flagsだけで全OS daemonの通信がゼロだと証明せず、採用OSでの確認方法も承認待ちとする。

Appleは、standalone binaryにはticketを直接stapleできず、app/bundle/disk image/flat installer package等の配布形式を説明している。[A7](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)
裸のlauncherへticketを付ける手順を前提にしない。候補は署名済みinstaller/containerでの配布だが、配布containerの評価が展開後fileの実行評価を
そのまま代替するとはしない。採用形式・offline時の初回起動・OS更新後の挙動を別検証する。
quarantineは既存closure方針どおり存在すれば拒否し、署名成功を理由に削除/無視しない。公証・配布と両立するかは未確認。

**Node単体は公証されていない可能性がある。** 2026-10-19のレビューでローカルのNode v24.18.0（1台・1版）を`codesign`/`lipo`で確認し、
thin arm64、`Developer ID Application`の署名連鎖、Hardened Runtime、6個のentitlement（値はすべて`<true/>`）を観測した。
そのうち`com.apple.security.get-task-allow`はAppleの公証サービスが受け付けないことが一般に知られており、
tarball内の`node`単体は公証されず、公証は配布用`.pkg`側だけである可能性がある。これは知識に基づく推測で、
本レビューでは`spctl`等による評価（ネットワーク照会を伴い得る）を実行しておらず、未確認である。
Nodeについて次のいずれかを承認するまで、公証を前提とした検査成功にしない。

1. Node単体の公証を要求する（観測したentitlementのままでは満たせない可能性が高い）。
2. 署名・公証済み`.pkg`等の配布物の確認と、展開後のNode最終bytes hash・署名者・entitlementの承認を結合して代替とする。
3. いずれの場合も、OL-05で採用版の公証状況を確認方法とともに記録する。

外側の全検査10秒・exec直前の残期限450秒超を維持する。Security APIごとに新しい10秒を付与しない。
同期FFIが停止しない場合、呼出し前後のdeadlineだけでは強制中断できない。
補助processで隔離する案は「通常起動は任意子processなし」からの設計変更であり、黙って導入しない。強制停止方式は承認待ち。
さらにSecurity.framework利用によるthread/FD生成を確認する必要がある。現行exec部品は専用single-threaded processを前提にFDを閉鎖するため、
検証後にその前提が満たされなければ接続しない。multithreaded processからのforkを安易な代替策にしない。

## 7. 失敗時停止と合成テスト方針

失敗は有限理由（unsupported/unsigned/invalid_signature/requirement_mismatch/entitlement_mismatch/identity_changed/deadline等）に写像し、
Node起動0回で停止する。raw OSStatus文言、CFError/証明書全文、path、Team ID一覧、entitlement blob、approval refを公開出力しない。
未知OSStatus・null/型違い/サイズ超過・FFI失敗は拒否。自動修復・再署名・online fallback・flag緩和・別Node起動を設けない。
公開exit codeの追加/割当は別契約で決め、現行90〜95やentry側71/73を再定義しない。未完了gateは92のまま。

| 合成試験群 | 必須の境界 |
|---|---|
| 信頼元 | 正常な架空policy、任意requirement/未知policy/異なるTeam ID/identifier/証明書クラス/hashの拒否 |
| validity | 情報抽出だけ成功・unsigned/ad-hoc・不正署名・未対応arch/fat・不明OSStatusを成功としない |
| flags | runtime欠落・静的flag差分・省略flag/未知flagの注入・online fallbackを拒否 |
| entitlement | 正常空/承認済みNode、追加/欠落/false/数値1/型違い/未知形式/辞書欠落/サイズ超過・取得flags不足を拒否 |
| binding/差替え | validな別binary、self/path不一致、検査前後のfile/世代/期限変更。path APIのfake成功だけでFD結合済みとしない |
| 停止/秘密 | 全拒否でNode0回、raw error/証明書/marker非出力、snapshotをpermitへ変換できないこと |
| 予算/資源 | 全体deadline、CF objectの所有権/失敗時解放、補助thread/FDがexec前提と矛盾する場合の停止 |

第一段階は型付き期待policyと純粋比較器、次にSecurity API境界のfake応答を使う合成テストとする。
これは本物の暗号検証やOSの注入拒否の証拠ではない。実adapter試験では別承認で専用の非秘密fixtureを用意し、
署名済み正常系・署名後の破損・誤署名者・entitlement差分・self結合・offline/timeoutを確認する。
ad-hocのfixtureをDeveloper ID正常系として採点しない。今回署名用鍵・登録・公証送信・fixture作成は行わない。

## 8. 承認待ち事項・次の順序

1. launcher/Nodeの正確な版・署名担当・Team ID/identifier/Developer ID証明書クラスとrequirement template。
2. Node公式署名の採用か別署名か、entitlementのexact typed dictionary・全静的flag・残余リスクの承認。
3. C方式は採択済み。個別の本番policy、registry組込み・参照専用次版ledgerの移行と旧offline reader分離を承認する。
4. entitlementのabsence証明・DER等の対応、thin arm64検査、Security API/CF bindingと採用SDKの確定。
5. offline失効/公証の鮮度・receipt、配布形式、quarantine拒否との両立、撤回/再承認の責任者。Nodeは単体公証を要求するか、配布物の公証＋展開後hash結合で代替するか（§6）。
6. 10秒内の強制停止方式とthread/FD前提。更新lease・path差替え防止・exec直前再検証との統合。

純粋parser/entitlement比較器は[合成検証済み](E2E_BEST_PRACTICE_R2_OL03_TYPED_POLICY_SYNTHETIC_2026-10-19.md)。次版ledgerの安全なreaderへの内部接続は合成検証済み。本番policy承認・registry信頼元・本番有効化は未完了で、実署名検証やgate解除を先行させない。
人の承認、実署名検証、信頼済み配備・実Node適合・実PDI開始条件は未完了。

## 9. 公式根拠・確認範囲（2026-10-19）

| ID | 根拠URL・該当箇所 | 確認した点と限界 |
|---|---|---|
| A1 | [SecStaticCodeCheckValidity](https://developer.apple.com/documentation/security/secstaticcodecheckvalidity(_:_:_:)) Discussion | 署名/requirement検証、並行変更に対する限界、universalのslice。検索抽出の本文で確認。採用SDK/OSでの実行は未確認 |
| A2 | [SecRequirementCreateWithString](https://developer.apple.com/documentation/security/secrequirementcreatewithstring(_:_:_:)) Discussion | requirementの再文字列化と表記変化。具体的なDeveloper ID templateの承認は未実施 |
| A3 | [kSecCodeInfoEntitlementsDict](https://developer.apple.com/documentation/security/kseccodeinfoentitlementsdict) Discussion | dictionary欠落の複数の意味。absence/DER対応APIの採用は未確定 |
| A4 | [SecCodeCopySelf](https://developer.apple.com/documentation/security/seccodecopyself(_:_:)) Discussion | 呼出し元code objectとvalidity確認を区別。host/guestの扱いもあり、R-2専用processでの適合は未確認 |
| A5 | [Static Code Validation Flags](https://developer.apple.com/documentation/security/static-code-validation-flags) Constants | 検証省略・全arch・strict flagsの意味。APIごとの組合せは採用SDKで要再照合 |
| A6 | [Apple公開CSCommon.h](https://github.com/apple-oss-distributions/Security/blob/main/OSX/libsecurity_codesigning/lib/CSCommon.h) SecCSFlags / SecCodeSignatureFlags | NoNetworkAccessとruntime/ad-hoc flag。公開mainの読取であり、対象端末のSDK/OSとの一致は証明しない |
| A7 | [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow) Staple the ticket to your distribution | standalone binaryへの直接staple不可、配布形式とoffline ticket。R-2の配布/起動成功の証拠ではない |

Apple APIページは一部の直接取得でJS用の外枠だけが返ったため、検索に抽出された公式Discussion/Constantsも照合に用いた。
公開headerのmainやWeb資料をruntime時に取得してpolicyにする設計ではない。実装前に採用SDK版へ固定して再照合する。
