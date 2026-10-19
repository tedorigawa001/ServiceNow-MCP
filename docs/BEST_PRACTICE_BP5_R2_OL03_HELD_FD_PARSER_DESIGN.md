# BP-5 R-2 OL-03：保持FDの安全読取・物理signature parser接続

Version: draft-0.8 / Date: 2026-10-19 / Status: A/B・M0〜M4・collector・macOS実sourceを内部実装。保持FDの運用移譲・実OS取得/適合・運用承認は未実施。

## 1. 目的と停止境界

[物理signature設計](BEST_PRACTICE_BP5_R2_OL03_PHYSICAL_SIGNATURE_DESIGN.md)の純粋parserに、同じ保持FDから取得したbytesを渡すための内部接続を定義する。
file全体SHA-256とparser入力の対応、metadata、record binding、共有予算を結ぶ。pathだけで開き直したfileや呼出し側のbytesを「保持FD由来」と扱わない。
本書は既存実装の調査に基づくプロジェクトの設計案であり、新しいOS/API適合試験の結果ではない。

telemetry調査は保留。実装済み範囲は§12〜§17の内部予算/A/B/M0〜M4/collector・staged実source。secure openerからの運用移譲は未実装。API実接続・DER意味解析/absence証明・実機/PDI操作・token発行・設定変更・permit発行は対象外。
本番registry未設定、通常v2入口Unavailable、runtime gate92を維持する。後日の読取接続が成功しても、署名validity・実行許可を生成しない。

## 2. 現状との境界

| 現在の部品 | 確認した実装 | 今回設計する不足分 |
|---|---|---|
| [deployment.rs](../native/r2-outer/src/deployment.rs) | directory FD相対open、owner/mode/ACL/xattr、metadata、closure全体hash/集合照合 | `inspect_deployment`はCheckedIndexだけ返す。role対象のFileを後工程へ保持する経路はない |
| [native/file.rs](../native/r2-outer/src/signature_boundary/native/file.rs) | private PinnedFileの位置指定読取/hash、前後metadata、同じ開始Instant/cancel | deploymentから未接続。identity/layoutの呼出しごとに再hashし、path照合は絶対pathを再openする。parser用buffer・共通I/O台帳はない |
| [physical_signature.rs](../native/r2-outer/src/signature_boundary/physical_signature.rs) | 宣言file長＋header/commands＋signatureの借用bytesをbounded解析 | bytesが同じFD/走査由来であること、全体hash/metadata/世代は証明しない |
| [ledger_v2.rs](../native/r2-outer/src/ledger_v2.rs) | registry参照・role・record bindingの純粋照合 | 運用上信頼済みrecord・保持FD・leaseの一体化ではない |
| [positioned_read.rs](../native/r2-outer/src/signature_boundary/positioned_read.rs) | 共通10秒/2GiB/再試行枠、予約/精算、位置指定要求・短読取/遅延応答の拒否。childでpreflight/A採取/parser/Bへ接続 | 合成sourceだけで検証。実pread adapter・deployment/PinnedFile・OS metadataへは未接続 |
| [metadata.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata.rs) | typed stat/ACL/xattr名/FS観測、M0〜M4順序・policy/差分照合、A/Bへのphase接続 | 合成観測だけ。OS stat/ACL/xattr取得、実FD/祖先/path/record/leaseへ未接続 |

既存の[配備読取検証](E2E_BEST_PRACTICE_R2_OL03_DEPLOYMENT_READ_SYNTHETIC_2026-10-19.md)と[parser合成検証](E2E_BEST_PRACTICE_R2_OL03_PHYSICAL_SIGNATURE_SYNTHETIC_2026-10-19.md)はそれぞれの部品の証拠であり、本接続の試験へ流用しない。
公開`inspect_deployment(root, binding, started)`の成功や外部から渡されたFileだけを、新しい信頼済み接続のconstructorにしない。

## 3. 内部入力・所有権・出力案

### 3.1 信頼元とbinding

将来の運用入力は、安全なrecord readerが固定activation/ledger/indexをexact bytesで照合して得たimmutableな内部contextからだけ導出する。
roleはLauncher/Nodeのどちらか1つ、接続先path・期待size/full-file SHA-256・mode・release_id・generation・ledger/index digest・policy参照を固定する。
Nodeの期待hashはledgerとclosure宣言の完全一致を要求し、片方を優先しない。ledger-0.2のBinaryV2にsize欄はなく、Node sizeはpinされたindex entry由来。Launcher sizeの出所は[FD移譲設計§4](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)の承認待ち事項で、観測Nを宣言値と偽装しない。
Launcherもledger側の承認対象と結ぶ。runtime root外のlauncherへruntime closureの所属を偽って適用せず、固定launcher配備root/祖先の保護を別に検査する。
root/device/role/期待値が別contextのもの、record世代の混在、size/hash欠落、未承認pathは読取前に拒否する。
registry/policyが未設定の通常入口は、引き続きfileを開く前にUnavailableで停止する。

期待hashはfileから算出した値で上書きしない。argv/env、JSONの「verified:true」、任意FD番号、synthetic owner設定を信頼元にしない。
record由来を保証する運用context自体はまだ未接続であり、合成入力の成功をroot承認済みという意味にしない。

### 3.2 所有権と寿命

内部の`HeldArtifactReadOnly`相当型が、安全なopenerから**所有権を移した同じFile**、必要な祖先directory FD、record binding、初期metadataを保持する案。
読み手はこれを可変借用し、raw FDを保存/複製して後で再使用したり、途中で別Fileに差し替えたりできないようにする。FD番号の一致だけでは実体一致としない。
role対象は順次処理し、全closureのfile FDを保持しない。既存path深さ上限（絶対root/相対path各64）を維持し、1対象の保持FDは合計132以下を初期上限案とする。
他のrecord/lock/native handleのFDは別途既存台帳へ計上し、この132をprocess全体のFD上限と説明しない。

出力はprivateな`FdInventoryReadOnly`相当の非authority型。role/binding、前後metadata、全体hash、parser用bufferと局所CD診断の対応を内部に保持する。
自己参照structを作らず、所有bufferから限定closure内でInventoryを借用するか、必要な限定属性だけ投影する。Inventoryの寿命がbuffer/保持対象を越えないことを型で守る。
既存`Identity`（device/inode/size/hash）だけへmetadataを縮約して前後照合を省略しない。native SnapshotやAbsenceProvenへの変換は設けない。
Debug/エラーは固定理由と件数だけとし、path/bytes/identifier/Team/hash/FD番号を表示・serializeしない。
HeldArtifactReadOnly/FdInventoryReadOnlyは引き続き設計案で、constructor・公開APIは追加しない。§13のCapturedAは別の再検証待ち診断型で、FDやrecordの信頼を示さない。

## 4. 安全なopen・metadata契約

対象はmacOS arm64のlocal同一device、regular単一link、32bytes以上512MiB以下。Launcher/Nodeの承認modeは0555、ownerは0固定。
runtime directory0555・runtime通常file0444、system/配備祖先のowner/mode/ACL条件は既存[closure設計](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)を引き継ぐ。
symlink/hardlink/FIFO/socket/device、別device/対象FS不明、他者書込・特殊permission・ACL propertyあり・検査不能は拒否する。
directory FDから固定componentを`O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK`、directoryにはO_DIRECTORYで開く。realpath文字列の一致で代替しない。
先にmetadataで通常fileを確認してから本文を読む。runtime/対象fileのxattr名は空またはcom.apple.provenanceだけ、quarantine/ResourceFork/未知名は拒否する。
provenance値は読まず、由来の真正性には使わない。system祖先のxattr検査範囲は既存の未決事項を残し、黙って適用範囲を広げない。

metadata snapshotは次をexact比較する（初回からpolicy不適合ならMetadata、後で変化したらChanged）。

| 区分 | 内容 |
|---|---|
| 実体 | dev/ino、file type、size、nlink |
| 権限 | UID/GID、完全なmode（特殊bit含む）、ACL propertyなし |
| 時刻 | mtime/ctimeの秒・ns。atimeは全体hashの読取で変化し得るためidentityにしない |
| xattr | bounded列挙した名前の生bytes集合、順序のみ正規化。上限64KiB、名前255bytes、重複/不正/列挙競合拒否 |
| 配備 | 祖先FD/root identity、期待device、role、release_id/generationとrecord digestの固定対応 |

snapshotはfstat前→ACL/xattr検査→fstat後とし、前後identityが違えば破棄する。metadata取得失敗を「属性なし」へ変換しない。
許可属性の値変更・ABA・特権による改変をmetadataだけで完全検出したとはしない。

## 5. 読取・採取・再照合の順序

以下の全段階で同じ保持Fileを使用する。path再解決用の一時FDはidentity確認専用であり、hash/parser用bytesの供給元に入れ替えない。

1. **受付**：元の開始Instant/cancel・I/O台帳・binding/record期限を確認。更新leaseが必要な運用経路では取得/存続証拠がなければ停止（§8）。
2. **保持**：安全なdirectory FD相対openからFileを移し、初期snapshot M0と承認size Nを完全照合。期待hashはこの時点で固定。
3. **bounded preflight**：offset0の32bytesを固定配列へ取得し、sizeofcmds/ncmdsを上限検査後、header/commands全体を最大1MiB＋32bytesのbufferへ読む。再読した先頭32bytesも初期配列と完全一致させる。
   純粋parserと共有する限定Mach-O range検査でLC_CODE_SIGNATUREを一意に求める。署名領域は5MiB以内、offset/長さはchecked、commandsの後、終端=Nを要求する。
   このrange抽出部品の分離は将来の最小refactor案であり、別の緩い検査器や「先頭のLCだけ採用」は作らない。
4. **metadata M1**：preflight後にM0と照合。未検証長から巨大bufferを確保しない。header/commandsとsignatureだけ上限内で確保する。
5. **全体hash A＋range採取**：同じFileをoffset0〜Nまで64KiB以下のblockで位置指定読取し、**hashへ渡すそのblockから**header/commandsとsignatureの重なり部分をbufferへコピーする。
   本文bufferを別の読取で後付けしない。全blockのSHA-256 H_Aを期待hashと比較し、各rangeの採取量が宣言長に完全一致することを確認する。
6. **metadata M2と入力一致**：M2=M0、採取したheader/commandsがpreflight bytesと完全一致、EOF確認を要求する。不一致ならrangeを再計算して同じ呼出しでやり直さない。
7. **parser**：Aから採取したbufferだけを現在の純粋parserへ渡し、file_bytes=N、元Instant/cancelを使う。成功しても内部診断を保留し、まだ返さない。
8. **metadata M3**：解析後に再照合。時間超過・取消・metadata変化なら診断も破棄する。
9. **全体hash B＋range再比較**：同じFDの0〜Nを再走査。H_B=H_A=期待hashを要求し、対象rangeのblock断片をAのbufferとbyte完全一致で比較する。Bのsignature全体bufferは新たに確保しない。
10. **最終確認**：EOF・metadata M4=M0、保持祖先と信頼rootからのcomponent再解決、leafのdev/inoを含むsnapshot一致、record exact bytes/hash/世代/期限の再確認を行う。lease/共有予算も確認してから限定診断を返す。

preflightはrangeの割当計画だけで、A/Bと別の署名証拠ではない。parserはCD全体hashとspecial-slot hashを計算し、A/Bのfull-file hashとは別に保持する。
hashが期待値と一致しても、metadata/path/世代不一致を救済しない。同じCDでも他のfile bytesが違えば全体hashで拒否する。
署名slotがない/unsupportedな入力で全体hashの一部だけ一致しても成功にしない。
各走査終端ではNで1byteの位置指定読取を行い、0bytesだけをEOFとして受理する。追加bytesはChanged。初期snapshotのNを追記後のsizeに更新しない。

### 5.1 位置指定読取の失敗

将来のI/O境界は1回のpread相当を明示し、offset/要求長/返却量を検査する。通常cursor/seek/readへ切り替えない。
必要range内の0bytes・正だが要求量未満の短読取は、その時点でChangedとして停止する安全側profileとする（正当な短読取も拒否し得る）。
EINTRだけ、開始時に固定した全対象共通8回の再試行枠内で許し、毎回前後に期限/cancelを確認する。成功時に枠を戻さない。
EAGAIN・その他I/Oエラー・返却量超過/不正offset・checked変換失敗は停止。read_exact_atの隠れた再試行loopに期限検査を委ねない。
途中失敗で別FD/path/弱いflagsへfallbackしない。失敗後に新しい10秒でretryしない。

## 6. 共有期限・容量・memory

| 予算 | 接続案 |
|---|---|
| 時刻 | 外側検査開始の同じmonotonic Instantから10秒。deployment・読取・parser・再hash・最終再検証に伝播。role/phaseごとに更新しない |
| checkpoint | 各I/O/metadata/record/再openの前後、64KiB block/hash/copy、parserのcommand/index/zero/hash loop、最終返却前。期限後の成功応答も破棄 |
| wall期限 | ledger/activation等の期限を開始/最終で照合。既存の直前再検証・残期限450秒超の条件を緩めない。monotonic超過をwall clockで救済しない |
| 実読取量 | 既存の全file読取2GiB上限を拡大せず、index/closure、preflight、A/B、追加再確認等の成功読取bytesを共通台帳に**重複分も**計上する |
| 予約と回数 | Nから2*N＋preflight最大量（32bytes＋header/commands全長）をchecked計算して残予算に入るか開始前確認。A/BのEOF検査各1byteも要求枠を予約。実使用分へ精算し二重課金しない。各対象のpread試行最大32768回＋共有EINTR枠8回を初期上限案にする |
| buffer | 初期32bytes、最大(1MiB＋32bytes)のpreflight、同長のA採取header、signature5MiB、stream用64KiB。payload bufferは合計7MiB＋64KiB＋96bytes以内。Aのheader比較後はpreflightを解放 |
| 合計memory | 上記はbytes bufferだけ。slot metadata、record/index、祖先snapshot、allocator/OS内部量を含むRSS上限の証明ではない。全file Vec/mmap・B用大blob複製なし |
| 対象順 | Launcher/Nodeは順次。不要なbuffer/対象FDを解放してから次へ。ただし後続API/execに必要な保持FDは別の所有設計へ移すまで閉じない |

既存deploymentの容量台帳は、そのscanの読取を数える内部変数である。共有予算の部品は追加したが、deployment/native/PinnedFileへは**まだ接続していない**。
本案は新規接続で重複読取も課金するため、今まで上限内だった配備でも追加検査でLimitになり得る。unique file総量と実I/O総量を同じ値として報告しない。
両roleが512MiB、closure読取も別に行う場合、A/Bだけで2GiBに達しpreflight等を含めて拒否される。容量や10秒を自動緩和しない。
将来closureの対象hashとAを同一走査に統合する場合は、同じbytes/binding/metadataを共有する実装・試験が必要。既存成功値のcache流用だけで読取を省略しない。

blocked I/O・metadata syscallは協調的checkpointでしか中断できない。hard timeout・外部監督との接続は別課題で、10秒以内のOS復帰を保証しない。

## 7. 拒否条件と破棄

| 内部理由案 | 拒否する状況 |
|---|---|
| Unavailable / Binding | 信頼済みcontext/production registry不在、role/path/期待hash/世代の混在、必要leaseを確認できない |
| Metadata / Changed | owner/mode/type/link/device/ACL/xattr不適合、snapshot差、再解決したpath/祖先の差、EOF/size差、短読取 |
| HashMismatch / SourceMismatch | H_A/H_Bと期待hashの差、preflight/Aのcommands差、A/Bの採取range差 |
| ReadFailed / Limit | I/O/metadata検査不能、EINTR枠超過、overflow、file/range/buffer/実I/O/回数上限超過、確保失敗 |
| parser由来 | InvalidMachO/InvalidRange/InvalidBlob/InvalidPadding/DuplicateSlot/OverlappingBlob/MissingSignature/UnsupportedCommand/UnsupportedSlot/UnsupportedCodeDirectory/SpecialHashMismatch等を弱めず伝播 |
| Deadline / Cancelled | 元期限以上・未来Instant・途中取消。解析成功後でも返却不可 |
| Entitlement停止 | 読取診断は保持できても、既存gateのUnsupportedDer/AbsenceUnproven/UnverifiedXmlは必ず維持 |

有限理由は内部設計案。公開exit code/JSONを追加・再定義しない。失敗したroleの診断を別roleへ流用せず、接続呼出し全体を失敗させる。
途中parser結果、未完成hash、取得bufferは外部へ返さずRAIIで破棄する。所有FDは解放、借用元のFD/leaseは所有契約に従い二重closeしない。
bytesのdropはメモリの完全zero化保証ではない。panic/I/Oエラーにraw bytes/pathを含めず、有限理由のみを上位へ渡す。

## 8. 更新排他・path結合の限界

同じFDは同じopen file descriptionを保持するが、in-place書換えを禁止するものではない。A/B hash・metadata・path再解決でもABAを完全には排除できない。
Securityのpath-based APIと保持FDはatomicに結合されない。本接続の成功を、同じnative handleによる署名検証の証拠にしない。

既存[closure設計§5](BEST_PRACTICE_BP5_R2_OL03_CLOSURE_DESIGN.md)のread lease/稼働release保持は未採択・未実装。
外部lease所有者か管理freezeの採択、書換禁止、世代切替と終了確認の契約が承認されるまで、運用上の信頼済み接続とpermitは有効化しない。
単なるboolやTTLの「lease有効」で代替しない。合成sourceではその前提をstubで明記し、実更新排他を試験したとしない。
exec adapterがFD>=3を閉鎖する現状も変更しない。検査用FDの保持と、exec後のrelease寿命管理は別問題である。
後続API接続では同じ所有対象を維持し、API前後・exec直前の再確認を追加する必要がある。本案A/Bの完了をexec/importまで有効なcacheにしない。

## 9. 接続全体の合成試験計画（実行済みの範囲は§12〜§15）

| 試験群 | 必須の確認 |
|---|---|
| 正常接続 | 架空bytes/合成署名の保持FDからA/B/parserまで、期待hash/metadata一致。構造診断だけ返りentitlement gateは失敗 |
| 同一FD/採取 | 同長だが別FDのsignature/header注入不可、FD番号再利用不可、A hash対象と採取buffer一致、cursor非変更、A/Bのrange差拒否 |
| open/再解決 | leaf/祖先symlink、hardlink/FIFO、不明device、pathを同じbytesの別inodeへ交換、祖先directory交換、所有対象close後の再利用拒否 |
| 改変 | preflight後/採取中/parser後/B途中/最終再解決前の同長書換え・追記・切詰め、metadata/ACL/xattr名変更。hook発火も必須 |
| I/O境界 | exact/0/正の短読取、EINTR8/9回、EAGAIN/不正返却量、checked offset/size変換・終端の追加1byte、確保前の巨大length拒否 |
| 予算 | 元Instant/cancelの全phase伝播、metadata/read/parser/final後の遅い成功を破棄、hash/copy途中期限、全読取台帳の重複課金/上限ちょうど/超過 |
| binding | 同じbytesでもrole/release/generation/ledger/index hash違い、Nodeのledger/closure期待値不一致、期限切れ、lease不在で運用経路を停止 |
| 解放/非出力 | 各失敗点でFD/bufferの寿命・二重解放なし、固定Debug/reason、本文/marker/path/Team/digest非出力、native/Node/permit呼出し0回 |
| 既存回帰 | 33 parser試験と全Rust回帰、旧0.1 offline互換、未設定registry→Unavailable、通常gate92、DER/absence停止を維持 |

通常UIDの一時fixtureと合成metadata/clock/I/O sourceを分離する。test-only owner/hookを本番入口へ露出しない。
実root配備・実Security・実署名/DER/absence・最大I/O性能・停止しないOS syscallは本試験で証明しない。

## 10. 承認待ちと次工程

1. 対象FDを渡すprivate opener/所有型、role別の信頼rootとrecord由来のbinding。公開CheckedIndexや任意Fileからの昇格を禁止する境界。
2. A採取/B再確認のI/O予算増、短読取即拒否・EINTR8回・試行32768回・FD132・buffer上限の採用。最大artifactの10秒/RSS適合は別評価。
3. 寿命全体の更新排他/lease所有者、blocked I/Oのhard timeout、OS/FS適合。いずれも合成成功だけで承認済みとしない。
4. 承認後の実装は、共有予算/位置指定読取境界→range採取/純粋parser接続→再hash/metadata/再解決→合成失敗点試験の順。API/nativeへの実接続は別工程。
5. 本番policy/registry、API-CD結合、XML意味統合、DER/absence、permit/exec接続は引き続き未対応の停止条件として残す。

## 11. draft-0.1時点の文書確認

既存deployment/native file/parser/ledgerのソースと関連設計を読み取り、現在実装済みの部品と今回の提案を分離した。
関連MDのlocal link・code fence・行末空白とgit diffを確認する。今回コード変更はなく、Rust/TypeScriptテストや実機適合試験は再実行しない。
過去の221件成功は純粋parser追加時の記録であり、本書のFD接続が検証済みという意味にはしない。

## 12. 共有予算・位置指定読取境界の内部実装

[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_POSITIONED_READ_SYNTHETIC_2026-10-19.md)に追加27件と全体248件の結果を記録する。
`SharedBudget`は元Instant/cancel、2GiB実読取量、未消費予約、全対象共通EINTR再試行8回、最初の失敗を保持する。
`ReadScope`が同じ台帳と単一sourceを排他的に借用する。途中のsource差替え・共有台帳のClone/resetは提供しない。
最初の失敗をラッチし、次のread/begin/checkpointは同じ理由で停止する。cancel解除/時計の巻戻し/新scopeで再開させない。

- `begin`はNが32bytes〜512MiBの範囲内か確認し、`2*N + 32 + (1MiB+32) + 2`をchecked予約する。
  preflightのcommands長が未判明なため、初期境界では最大header量を保守的に予約する。小さいfileでも残予算がこの予約を満たさなければ停止し得る。
- `PositionedSource::pread`はoffset/可変sliceを受ける単発試行trait。現在その本番実装はなく、raw FD/path/open/seek/OS syscallは追加していない。
  trait実装の自己申告を同じ保持FDの証拠にしない。将来OS adapterが隠れたretryや別FDを使わないことは別試験が必要。
- 通常readは非空64KiB以内、checked終端がN以内。0/正の短読取は補完せずChanged。不正返却量はReadFailed。EOFはNから1byteを要求し0だけ受理する。
- 通常要求は対象ごと32768回まで。EINTRだけ同じoffset/sliceで最大8回を全対象共有枠から再試行し、成功後も回復しない。9回目/EAGAIN/他エラーは停止。
- 成功応答の実bytesは短読取/遅延/取消応答も含めて課金し、予約から同量を消費。EOFの0bytes/EINTRは0課金。残予約はscopeのDropで解放する。
  返却量がslice長を超える壊れたsourceは要求長までを保守的に計上し停止する。この値を実OS読取量の証拠にしない。
- source呼出し前後に期限/cancelを確認する。遅い成功も破棄。I/Oを試行したreadの失敗時は現在のbounded出力sliceをzeroにするが、一般的な秘密メモリ完全消去ではない。
- `account_read`は将来index/closure adapter用の実成功bytes課金補助。I/O許可/予約を発行するAPIではなく、前段のcheckpointと容量確保は接続側に必要。
  呼出し後guardの前に課金するため、すでに取得した遅延bytesも数える。既存scanからの呼出しはない。

予算/読取境界はprivateかつ非authority。公開JSON/exit code・既存source・runtime gate・permitを変更していない。
本節の段階では実FD owner/metadata・binding/lease、preflight range分離、A/B hash・採取buffer・parserへの共通予算接続を次工程としていた。後続の実装済み範囲は§13を参照。

## 13. preflight・A採取・純粋parserの合成接続

[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CAPTURE_A_SYNTHETIC_2026-10-19.md)に追加25件と全体273件の結果を記録する。
`positioned_read/capture.rs`の`ReadScope::capture_a`は、同じscope/source・予約・EINTR枠のまま以下を行う。

1. 32bytesの初期headerを読み、純粋parserと共有する`preflight_length`でprofile/件数/長さを確保前に検査。
2. preflight header/commandsを64KiB以下で再読し、初期32bytesとの一致を要求。
3. `preflight_range`を使って署名rangeを取得。parser側も同じ`macho_range`を使用し、別の緩いLC判定は作らない。
4. A走査で全file bytesをSHA-256に渡し、その同じblockの重なり部分だけをheader/signature bufferへ採取。採取量と宣言長の完全一致を要求。
5. 全体hashと入力期待hashの完全一致、EOF、preflightと採取headerの完全一致を要求。不一致では再計算/retryせず台帳に失敗をラッチ。
6. A採取bufferを借用して純粋parserを実行。元Instant/cancel/clockを引き継ぎ、command/index/hash loopでも10秒期限を更新しない。

成功値`CapturedA(pending_revalidation_not_execution_authority)`はprivate・非serialize・非Cloneの所有bufferと局所診断であり、Inventoryの自己参照structにはしない。
entitlement gateはUnsupportedDer/AbsenceUnproven/UnverifiedXmlのいずれかで必ず停止する。XML意味解析/DER/absenceへ接続しない。
期待hash/file長はこの部品への入力データにすぎず、root承認record由来を証明しない。traitは同じsource objectを借用するだけで、同じ実FDを証明しない。

読取実bytesは既存台帳へ重複込みで計上。今回の正常経路は`32 + header/commands全長 + N`bytes（EOF0bytes）を使用し、B用を含む未使用予約はscope寿命中保持する。
payload bufferの確保は上限確認と`try_reserve_exact`、loop/copy/hash/比較/parse前後は共通checkpointを使う。全file Vec/mmapや署名rangeの独立再読はしない。
新規有限理由HashMismatch/SourceMismatch/Parser(reason)を内部台帳へ追加したが、公開JSON/exit codeは変えない。

本A追加時点ではB再hash・M0〜M4も未実装だった。後続のB実装は§14、合成M0〜M4は§15、staged実sourceは§17を参照。**実metadata取得の運用実行・祖先/path/record/lease照合は未接続。** A cursorが通過した後のin-place変更はAだけでは見つからない場合があり、それを示す合成ケースも残す。
CapturedAをFdInventoryReadOnlyや署名validity/permitへ変換する経路はない。実OS adapter・deployment/native接続・本番policyは引き続き停止したまま。

## 14. B再走査によるbytes-only照合

[B合成検証記録](E2E_BEST_PRACTICE_R2_OL03_RECHECK_B_SYNTHETIC_2026-10-19.md)に追加26件・全体299件を記録する。
同じReadScopeの`recheck_b`へCapturedAを所有権移動して渡し、成功時だけ`ComparedAB(bytes_only_pending_metadata_not_execution_authority)`を返す。
CapturedA/ComparedABは非Clone・非serializeであり、失敗時はAのbufferも破棄する。B結果をpermit/FD検証済み型へ変換する経路はない。

- scope開始時にprivateな`Rc<()>`識別子を1つ作り、Aへ同じ識別子を保持。Bは`Rc::ptr_eq`とN/保存rangeの整合を確認し、別scope/source・別台帳へのA持越しを読取前に拒否する。
  この識別子は生FD番号やcaller申告ではないが、OSのFD/record/metadataの真正性を証明するものでもない。小さい管理用割当で、payload/RSS上限とは分ける。
- Bは同じsource object・元Instant/cancel/clock・残予約・読取回数・EINTR枠を使う。beginし直さず、Nも期待hashも呼出し側がB用に上書きできない。
- 0〜Nを64KiB以下で再読してSHA-256へ渡し、その同じblockとAのheader/commands・署名rangeの交差をbyte完全一致で照合する。
  A採取とB比較はcheckedな同じ交差計算helperを使用。全体hash一致だけでrange比較を省略せず、range一致だけでfile本文のhashを省略しない。
- 成功条件は全体hash B = Aで期待hash照合済みの全体hash、両rangeの照合量 = 宣言長、元NでEOF0bytes、最終checkpoint成功。
  range差はSourceMismatchで早期停止できる。この場合、未完了のB hashを照合済みと報告しない。range外の差は最終HashMismatchで拒否する。
- Bの大容量bufferは作らずstream用64KiBだけ。Aのbufferをそのまま所有して返し、parserの再解釈・署名rangeの再選択・別FDへのfallbackは行わない。
- 正常実読取量はA/B合わせて`32 + header/commands全長 + 2*N`（EOF応答は0bytes）。Bも課金し、B前の残予約不足・要求回数上限・共有EINTR枠枯渇で停止する。
- read/hash/range比較/EOFの前後と最終返却前で共通checkpointを確認。遅い成功・取消・短読取・追記/切詰め・不正scopeは既存台帳へラッチし、後続read/新scopeも拒否する。

ComparedABのentitlement gateは、AのUnsupportedDer/AbsenceUnproven/UnverifiedXmlをそのまま保ち、常に失敗する。
同じsourceを保持しても、source内の実体交換を防いだことにはならない。Bの既読位置への後発変更・ABAを全hash2回だけで完全に排除できない。
その限界を合成ケースでも確認しており、実metadata/祖先/path/record/lease・実FD読取・hard timeoutが未完了のまま信頼済み証拠へ昇格しない。後続の合成metadata照合は§15。

## 15. M0〜M4 metadata内部契約・合成接続

[metadata合成検証記録](E2E_BEST_PRACTICE_R2_OL03_METADATA_SYNTHETIC_2026-10-19.md)に追加29件・全体328件を記録する。
`MetadataSource: PositionedSource`にデフォルト成功はなく、同じsource objectからphaseごとのtyped Observationを取得する。
Observationは前後Stat、ACL状態（Absent/Present/Unknown）、filesystem（Local/NonLocal/Unknown）、xattr名の照会長と返却bytes（Noneは不明）を持つ。
実取得の契約は「同じ保持FDでstat前→ACL/名前列挙→stat後」だが、現在は合成値だけであり、そのOS取得手順や真正性を証明しない。

| phase | 挿入位置 | 確認 |
|---|---|---|
| M0 | 最初のbytes読取前 | 初期policyと宣言N/期待device。baselineを固定 |
| M1 | preflight/range検査後、A走査前 | M0との完全一致 |
| M2 | A hash/採取・EOF/header一致後、parser前 | M0との完全一致。hashが一致してもmetadata差を救済しない |
| M3 | parserと保守的entitlement gateの分類後、B前 | M0との完全一致 |
| M4 | B hash/range・EOF後、結果返却前 | M0との完全一致と最終共通checkpoint |

内部FlowはM0→M1→M2→M3→M4だけを許し、欠落・重複・順序違いをSourceMismatchで拒否。後の観測値でM0を更新しない。
`compare_m0_m4`がA/B・phase hookを一体で呼び、M4完了前はmetadata比較結果を返さない。
従来のbytes-only診断経路は引き続き非authorityであり、それをmetadata比較結果へcast/変換するconstructorは作らない。

### 15.1 Stat・属性の検査

- Statはdev/ino、FileType、UID/GID、mode、nlink、size、mtime/ctime秒・ns。atimeは契約に含めない。
- FileTypeはRegularだけ。modeはfile型と分離したpermission/special bitsの完全値で0555のみ、UID0・単一link・local・期待device/Nとの一致を要求する。
  OS st_modeをそのまま受け取るABI型ではない。将来adapterは型bitsを明示decodeし、未対応bits/変換失敗をmaskや既定値で隠さない。
- mtime/ctimeのnsは0〜999999999。前後Statは全field完全一致を要求し、差はM0でもChanged。
- ACLはpropertyなしだけを受理。Present（空/deny-onlyを含む想定）とUnknownを「なし」へcoerceしない。当初は実ACL照会未実装で、後続のstaged実sourceは§17。
- xattr名は照会長/返却長が64KiB以内か確認し、長さ差はChanged。空の成功列挙と`com.apple.provenance\0`だけを受理する。
  重複・未知/quarantine/ResourceFork・NUL不正・case差・不明Noneは拒否。受理可能な集合が2種類だけなので、一般の名前mapや文字列を確保せず固定enumへ投影する。
  provenanceの値は入力にも取得にも含めず、由来の真正性や値の不変性は主張しない。
- 正常化したmetadataはM0とexact比較。dev/ino/GID/time差、許可xattr名の追加/削除もChanged。

初期policy不適合/不明はMetadata、後続policy変化/不明はChanged、取得失敗は全phaseでMetadataUnavailable、上限超過はLimit。
各取得の前後と比較後に元Instant/cancelを確認し、遅延成功/エラーも破棄。結果は既存台帳にラッチし、再取得・別source・新しい10秒で救済しない。
metadata phaseは最大5回で、file bytesの2GiB台帳・A/B読取回数/EINTR枠を更新し直さない。名前bytesはmetadata専用64KiB/観測の上限で、file payloadの課金には加えない。
一括sourceが返すVecは既に確保済みの観測値である。後続collector/単発Opsでは照会長を確保前に検査し、各操作へ共有checkpointを接続した（§16/§17）。一括sourceの自己申告を実OS取得の証拠にはしない。

### 15.2 出力と残余

成功値はprivateな`ComparedM0M4(source_only_pending_path_record_lease_not_execution_authority)`。
A/B bufferと固定M0観測を保持するが、raw names/stat値をDebug/JSONへ出さず、非Clone/非serializeとする。entitlement gateは常に拒否する。
これは合成sourceの観測整合だけで、OS取得・root承認device/N・同じ実FD・署名validityの証拠ではない。
metadata差が観測されれば既読位置の変更も止めるが、元値へ復元されるABAや、sourceが不完全/虚偽の観測を返す場合を完全排除しない。
実FD opener/OS metadata reader・祖先/path/record/lease・hard timeout・API/permitは引き続き未接続。

## 16. 実metadata sourceの詳細設計への分離

[実metadata source詳細設計draft-0.3](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)に、同じ保持Fileへのfstat/fstatfs・filesecによるACL確認・bounded flistxattrの順序を具体化した。
一括MetadataSourceではsyscallごとの共通checkpoint/Changed・Limitを渡せないため、ReadScope collectorと単発Opsの内部接続を合成実装した。[追加20件・全体348件の検証記録](E2E_BEST_PRACTICE_R2_OL03_METADATA_COLLECTOR_SYNTHETIC_2026-10-19.md)を参照。この追加時点ではOS source未実装で、後続は§17。
collectorは全対象共通のmetadata100呼出し枠・名前640KiB台帳を追加し、ACL解放枠を先行予約する。既存payload2GiB/10秒/32768要求/8再試行枠を緩めず、解放は期限後も実行する。
SDKのXATTR_MAXNAMELENは127bytesで、§4の255bytesは従来の局所上限でありDarwin定数ではない。
公式資料の列挙対象は呼出し主体に可視な属性名だけであり、空/許可名の結果を全属性不存在の証拠にはしない。可視性・ACL意味・内部memory・FS適合は承認待ちで、運用接続は停止を維持する。

## 17. staged macOS MetadataOps実source

[macOS実source合成検証記録](E2E_BEST_PRACTICE_R2_OL03_MACOS_METADATA_SOURCE_SYNTHETIC_2026-10-19.md)に新規14件・全体362件を記録する。
privateな所有File sourceと単発FFIを実装し、collector/同じReadScopeへ接続可能にした。実FDでは動かさず、RawApiをFDなしの合成backendへ差し替えて投影/失敗/解放を確認した。
constructorは通常入口/secure openerへ未接続。元10秒・metadata100回・名前640KiB・payload2GiB/32768要求/8再試行を変更せず、OS適合・path/record/lease・hard timeout・API/permitも未接続。

## 18. secure openerからの所有権移譲設計

[保持FD移譲詳細設計draft-0.2](BEST_PRACTICE_BP5_R2_OL03_SECURE_FD_TRANSFER_DESIGN.md)に、record evidence/role descriptor・OpenedTargetからsourceへのmove・祖先/namespace再照合・M4前finalizer・失敗時解放を具体化した。
binding比較と所有権carrierへのmoveだけを[合成resourceで内部実装](E2E_BEST_PRACTICE_R2_OL03_FD_TRANSFER_CONTRACT_SYNTHETIC_2026-10-19.md)した。実macOS sourceへの移譲、M0/open snapshot結合やB〜M4のtopology検査hook、record reader/lease/finalizer・追加台帳は未接続/未実装。
