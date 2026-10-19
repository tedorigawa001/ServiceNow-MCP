# BP-5 R-2 OL-03：secure openerからmetadata sourceへの保持FD移譲

Version: draft-0.5 / Date: 2026-10-20 / Status: binding/移譲・open snapshot/M0結合・祖先/path・record再読/最終照合の内部契約を合成resourceで実装。実reader/parser/opener/macOS source・leaseは未接続/未承認。

## 1. 範囲と停止境界

[保持FD/parser設計](BEST_PRACTICE_BP5_R2_OL03_HELD_FD_PARSER_DESIGN.md)と[実metadata source設計](BEST_PRACTICE_BP5_R2_OL03_METADATA_SOURCE_DESIGN.md)の間に、record由来の対象選択・安全なopen・File所有権移譲・祖先/path再照合を置く。
本書は既存ソースを読んだ設計案で、OS/APIの新しい動作試験結果ではない。draft-0.1の後に§12〜§15の内部契約を合成実装した。実機操作・API実接続・トークン発行・設定変更・permit発行・Pushは行わない。telemetry調査は保留。
APPROVED_REGISTRY=None、通常v2入口Unavailable、runtime gate92、DER/absence停止を維持する。FD移譲の成功も署名validity/実行許可にしない。

## 2. 現在の部品と不足

| 部品 | 現在確認したこと | 新しい経路で必要なこと |
|---|---|---|
| [records_v2.rs](../native/r2-outer/src/records_v2.rs) | 固定registry、activation/ledgerのexact bytes/hash・role policy・時刻を確認。公開結果は非authority | 読取snapshot/祖先/record再照合の根拠を保持したprivate context。公開InspectedV2RecordsだけからFile許可を発行しない |
| [schema.rs](../native/r2-outer/src/schema.rs) BinaryV2/Runtime | binaryはpath/hash/version/policy_idを持つ。**sizeはない** | sizeの出所を区別したrole descriptor。JSON契約を黙って拡張しない |
| [closure.rs](../native/r2-outer/src/closure.rs) | index/観測集合の純粋照合。CheckedIndexは件数/総量だけ | 同じ照合済みindexからNode entryのpath/mode/size/hashをprivateに導出する経路 |
| [deployment.rs](../native/r2-outer/src/deployment.rs) | directory FD相対openと各scan後の再解決。対象Fileはscan中にdrop | 安全なopenerを内部共通化し、対象leafと祖先chainを所有移譲。scanの公開戻り値やroot文字列をtrust tokenにしない |
| [darwin.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/darwin.rs) | private staged constructorがFileを所有、同じFileへ単発Ops/pread | 任意File constructorの公開ではなく、以下のsealed内部移譲だけを接続 |

既存の[macOS source合成362件](E2E_BEST_PRACTICE_R2_OL03_MACOS_METADATA_SOURCE_SYNTHETIC_2026-10-19.md)は型変換/合成backendの証拠であり、本移譲・実配備・record更新排他が検証済みという意味ではない。
deploymentの既存独立10秒・総量変数やrecords_v2の独立開始Instantを、そのまま連続呼出しして共通予算を守ったことにしない。

## 3. 内部所有モデル案

下記は全体設計の型案。§12で一部のRust内部契約を追加したが、Session/RecordEvidence等の運用producerは未実装。所有型・BoundTargetは非Clone/非serializeとし、比較用の非authorityデータだけは内部でCloneできる。constructorはprivate moduleに限定し、Debugは固定文言のみ。

| 型案 | 所有/借用と不変条件 |
|---|---|
| InspectionSession | 元Instant/cancel・wall/monotonic対応・共通台帳を所有。固定registryとrecord evidence/leaseを保持。roleごとに作り直さない |
| RecordEvidence | 安全に読んだactivation/ledger/indexのexact bytesとhash、schema/registry参照、保護されたpath/祖先identity。record再読の基準で、利用者JSONから構築しない |
| BoundTarget | Sessionを借用し、role・承認path components・期待hash/mode・size出所・release/generation/registry policyを固定。Fileの観測でhash等を書き換えない |
| OpenedTarget | leaf File、必要な祖先directory File群、component対応/初期snapshot、BoundTargetへの借用を所有。open後から移譲までの部分成功を外へ返さない |
| HeldTargetScope | OpenedTargetを消費。leafだけをHeldSourceへmoveし、祖先chainとbindingを同じscope内に残す。sourceのFileは取り出し/差替え/複製できない |
| PendingTargetDiagnostic | A/B・M0〜M4の結果。最終topology/record検査完了まではscope内で保留。単独でnative/permit型に変換不可 |

呼出しはprivateな`with_held_target(session, role, bounded_callback)`相当のscope案とする。callbackへraw FDや所有Fileを渡さず、RecordEvidence/leaseより長生きする参照を返せないようにする。
安全なopenerが返したOpenedTargetから、同じleaf Fileを**move**してsourceへ渡す。try_clone、IntoRawFd/FromRawFdの往復、整数FDの保存、path再openで代用しない。
移譲前はopener、移譲後はHeldSourceがleafの唯一の所有者。移譲の途中失敗でFileをlost ownershipにしない。共有祖先をRc等で生存させる場合も、任意callerのFile/Rcを混入できないsealed生成に限定する。

初期段階はrole単位でscopeを完了し、File/祖先をすべてdropしてから次roleへ進む。1対象の保持FD上限132を維持し、両roleのchainを同時保持して264へ自動拡大しない。
前roleの診断を次role後の有効なFD証拠とはみなさない。後日API/execで複数roleのFDを同時保持するなら、別の所有権/FD容量/lease設計が必要。

## 4. record bindingとsizeの出所

### 4.1 信頼連鎖

固定build registry → root所有の固定activation → exact bytesのledger hash → registry参照/role policy → exact bytesのindex hash → 対象entry、という連鎖を維持する。
activation自体のhashはローカル固定比較用であり、上位の署名根拠ではない。activationの安全なpath/owner/GID/modeと読取主体の条件を省略しない。
既存record条件はactivation root所有0440、ledgerは実行UID所有0600、どちらもregular/single link/ACLなし。activationのreader_gidと実効group、execution_uidとの一致も既存どおり確認する。
「全recordがroot所有」と書き換えたり、ledgerの自己申告をroot承認と扱ったりしない。

BoundTargetには少なくとも次を同じSessionから投影する。

- activation exact hash/固定path、ledger path/hash、index path/hash、release_id/generation、execution_uid/reader_gid、platform product version/build。
- registry id/schema/digest、対象roleとpolicy_id、binaryの承認path/hash、root-relative components/期待mode。
- openerが信頼rootから実測したexpected device、size出所と期待N、初期leaf/祖先snapshot。deviceの符号拡張表現は実sourceと同じにする。
- record期限/元のclock pair、closure集合照合の完了状態、lease evidenceの寿命。部分検査成功のboolだけでは代替しない。

policy_idが別role、同じbytesだが別release/generation、別Sessionのindex/ancestor、pathの取り違えはopen前にBindingで停止する。
publicなparse_and_bind/CheckedIndexの成功やcallerから渡されたpath/hash/sizeを、sealed descriptorへ昇格させない。

### 4.2 NodeとLauncherの違い（承認待ち）

| 対象 | hash | size/modeとpath |
|---|---|---|
| Node | ledger.node.sha256と、pinされたindexのNode entry hashが完全一致必須 | sizeはindex entry由来。ledger-0.2にsizeはない。mode0555。承認absolute pathをruntime root配下の同一relative entryへcomponent単位で対応させる |
| Launcher | ledger.launcher.sha256 | 現ledgerにsizeはない。runtime root外ならindex所属を仮定せず、別の信頼済みlauncher root/祖先に結ぶ |

Nodeのindex sizeを「ledgerにも宣言されている」と説明しない。hash差を片方優先で解消しない。
Launcherのsizeは、(a)次版recordへ宣言を追加、(b)open後の32bytes〜512MiBの実測NをObservedBoundedとして固定し、ledger hash一致/A/B/EOFで結ぶ、の2案がある。
本書の推奨候補は既存schemaを変えない(b)だが、**まだ承認しない**。それはDeclaredSizeではなく、観測sizeを期待宣言に偽装しない型区分が必要。
方式/launcher rootを決めるまではLauncherの運用移譲を停止する。Nodeだけの成功でLauncher未確認を埋めたり、size欄を既存JSONへ追加してstrict parserを迂回したりしない。

## 5. secure openと移譲前の検査

1. registry/record/binding/clock・予算・必要leaseを受付で確認。未設定/未承認ならpathを開く前にUnavailableで停止する。
2. role別の固定信頼rootを、保持した`/`からdirectory FD相対でcomponentごとに解決。絶対root/相対pathは各深さ64・path4096bytes・component255bytes以内。`.`/`..`/空/NUL/aliasを許可へ正規化しない。
3. directoryはO_DIRECTORY、全componentはO_RDONLY/NOFOLLOW/CLOEXEC/NONBLOCKの固定flags。各openの成功Fileを直ちにRAII所有へ入れ、後続の検査が失敗してもcloseする。
4. 各祖先のtype/UID/GID/mode/special bits/ACLとdev/ino/mtime/ctimeを取得し、root/非公開配備祖先のprofileへ照合。runtime directoryはroot所有0555。directoryのnlinkにleafの1を適用しない。
5. leafも同じparentから開き、regular/root所有0555/single link、local APFS/ownership/noexec profile、size/expected deviceを確認する。信頼root内の別device/子mountを許さない。
6. xattrはruntime root/配下・role leafに空/provenanceだけを許す案。system祖先/recordへの適用は§10の承認待ちを残す。検査しなかった属性を空としてsnapshotに入れない。
7. 初期leaf snapshotとBoundTargetを比較。祖先の再解決を移譲前に1回行い（§6）、open途中のpath切替を拒否する。
8. 完成したOpenedTargetを消費し、leafをHeldSourceへmove。callbackやsource constructorの引数で期待hash/path/ownerを書き換えられないようにする。

leaf向けMetadataOpsのStat/ACL/名前の取得部品は再利用候補だが、directoryへleafのtype/mode/sizeをそのまま適用しない。ancestor profileとleaf profileを型で分ける。
FFIの取得部品を共通化しても、record/directory観測をM0〜M4のphaseとして偽装しない。実sourceのprivate staged constructorをpublicに広げる変更も不要。

## 6. 祖先/path再照合とM0〜M4の結合

### 6.1 2種類の照合を両方行う

- **保持chainの再観測**：保持している全directory FDとleaf sourceを再観測し、初期snapshotとの完全一致を確認する。rootがrenameされてもFDは古い実体を指し続けるので、これだけでは足りない。
- **namespaceの再解決**：保持した信頼`/`から元の承認componentsを同じ固定flagsで再walkし、各edgeの新しい一時Fileのsnapshotを、元の保持chainに対応するsnapshotと比較する。最後のleafもsourceの初期dev/ino等へ結ぶ。

保持parentから次edgeを開く照合に加え、全pathを信頼anchorから再walkする。途中parentだけ差し替えられた場合や、古いparentの中では同じleafが残っている場合を取りこぼさない。
一時Fileは比較専用で、pread/hash/parserへ渡さない。pathが同じで同じhashでもinode/祖先が違えばChanged。
一時walkはcurrent/nextの最大2FDでstreamingし、全再解決chainを追加保持しない。旧chain最大129程度＋一時2等を含め、余裕を持った132上限で先行予約する案とする。record/lease/他process FDは別枠でprocess上限も確認する。
path再解決で失敗/取得不能/消失した場合も停止し、旧FDのbytesが読めることを理由に続行しない。

### 6.2 呼出し順案

1. open→初期snapshot→移譲前topology再照合→leaf move。
2. M0で移譲前leaf snapshotと同じ値であることを比較してbaseline固定。その後既存のpreflight/M1/A/M2/parser/M3/Bをそのまま進める。
3. B完了後、M4へ進む前に、保持祖先再観測・信頼anchorからのpath再解決・record再読/lease確認を行う。
4. M4を**1回だけ**取得してM0と比較。重複phaseやM4の再取得は許さない。
5. 結果をscope内に保留したまま、record exact bytes/identity/世代/期限・leaseを最終確認し、共通checkpointを通す。すべて完了してから限定診断を返す。

従来のcompare_collected_m0_m4はM0 baselineを独自に固定し、B〜M4の間にtopology callbackがない。そのまま前後に関数を並べただけでは上の手順を満たさない。
§13でsealedなopen snapshot/M0比較を同じReadScopeへ追加し、§14の別経路でM4前topology照合を必須にした。§15ではrecord再読をM4前/M4後に必須化したが、実record reader/parser・lease finalizerはまだない。caller任意callbackでpath検査をskipできる形にはしない。
topology検査のleaf観測はM0〜M4とは別の観測で、既存100呼出し枠をresetしない（§8）。

どの並べ方でもFile/namespace/recordをatomicには検証できない。M4後のrecord読取中の変更や検査後のABAを完全排除しない。
運用診断の有効範囲はこのscopeの終了までとし、後のAPI/import/execへvalid cacheとして持ち越さない。運用接続には寿命全体の更新排他が別途必要。

## 7. recordの再確認

activationは固定path、ledgerはpinされたactivationのpath、indexはpinされたledgerのpathから安全なreaderで再取得する。新しいactivationを採用して別ledgerへ追従しない。
保持record FDだけの再読ではpath差替えを見つけられないため、record祖先/path再解決とsnapshot比較も必要。
exact bytesは初回とbyte一致し、digestだけでなく保護されたmetadata/祖先identity・schema/role/policy/release/generationも変わっていないことを確認する。
identityが変わったrecordを、同じbytes/hashであることだけで受理しない。indexの全entry/集合検査を省略してNode entryだけを読む経路も作らない。

record再読のbytesは、元の2GiB実I/O台帳へ重複分も課金する。activation/ledgerは各64KiB、indexは16MiBの既存上限を維持し、全buffer同時保持/RSSの上限は別途設計する。
wall/monotonic整合を元clock pairから確認し、受付の残期限460秒超・最終450秒超の既存条件を緩めない。時計巻戻し/期限超過で新しいsessionへ自動retryしない。
record用xattr検査は現reader未実装であり、追加方針/可視性が承認されるまで運用trust context完成とはしない。

## 8. 共有予算・追加観測の境界

| 項目 | 設計案 |
|---|---|
| 時間/cancel | Sessionの同じ10秒・cancel・sticky first failureをopener/record/closure/source/finalizerへ伝播。既存readerの独立時計は運用接続時に共通化が必要 |
| payload | 元2GiBへindex/closure/record再読・preflight/A/Bを実bytesで課金。A/B予約を他の読取で使わず、残量不足なら開始前停止 |
| M0〜M4 | metadata100境界呼出し・名前640KiB・観測64KiB・pread32768要求/共有EINTR8回を変更しない。祖先検査をこの枠から除外して隠すのではなく、下の追加台帳へ明示計上 |
| topology | roleごとの初回walk・移譲前再walk・B後再walk/保持chain観測等を有限回に固定。全role共通の追加上限候補は16384境界呼出し・名前成功copy8MiB・一時名前buffer64KiB。record/closureの追加観測台帳との統合と正確な最悪回数の導出は承認待ち |
| retry | topology/metadata/record検査不能は同一呼出しでretryしない。新しいFD/flags/弱いpolicy/新10秒へfallbackしない。preadの既存EINTR枠だけが例外 |
| FD | role scope132を先行予約。一時再walk・失敗時close用の余裕を含める。processのrecord/lock等も含む上限へ収まらなければ停止。RLIMITを自動引上げしない |
| 解放 | ACL/一時File/leaf/chainの解放は期限後も行う。close/free用resource枠は取得枠が枯渇しても使えるよう予約する。解放で10秒のhard終了を保証しない |

追加topology枠のOS境界ごとの正確な配賦は**未採択**。§14ではSharedBudgetへ合成契約の単発呼出し16384上限だけを追加した。1契約呼出しを1 syscallと数えず、既存100/640KiBへ入るとも主張しない。名前copy8MiB・OS FD/cleanup台帳・record/closure統合の採用/実装前は運用finalizerを停止する。
実metadataの可視性・syscall内部memory/I/O・blocked I/Oの中断は引き続き未確認。OSの非復帰を協調checkpointだけで止められるとは主張しない。

## 9. 失敗時の解放・出力

| 失敗点 | 必須の後始末 |
|---|---|
| 受付/binding | target open0回。record/Sessionの所有resourceだけを解放 |
| root/途中component open/検査 | 開けた祖先/一時FileをRAIIで各1回解放。raw FD整数へ逃がさない |
| leaf open後/移譲前 | leafと完成前chainをopenerがdrop。移譲成功値や部分bindingを返さない |
| move後/M0〜M4失敗 | collectorのACL handle・buffer・scope予約を先に解放し、sourceがleafをdrop、残るchainをdrop。最初の有限理由は上書きしない |
| finalizer/record/期限/取消 | PendingTargetDiagnosticを破棄。一時walk/record Fileも解放し、同じrole/次roleへ進まない |
| 正常scope終了 | 最終確認済みの限定診断だけを返す。File/chain/一時bufferはscope内で解放し、FDを結果へ隠して持ち出さない |

借用しているSession/record/leaseをcalleeが二重解放しない。session中断時はsession ownerがそれらを最後に解放する。
leaseの解除失敗/終了未確認は「cleanup完了」に偽装しない。lease方式自体が未採択なので、既存host/runner終了票へ新しい成功を接続しない。
Rust FileのDropだけではcloseエラーの報告/終了確認を証明できない。close失敗後のFD番号retryは再利用した別FDを閉じ得るため行わず、追跡/host停止の扱いは別審査とする。
error/Debugは固定理由と件数だけ。record bytes/hash/approval ref、path/components、FD、stat、ACL/xattr名/値を出さない。公開exit code/JSONは変更しない。

## 10. 未確認・承認待ちと実装順

1. registry/本番policy・OS/FS適合・ACL/xattr可視性、system祖先とrecordのxattr適用範囲。不可視属性を「なし」にしない。
2. Launcher size出所と固定信頼root、Nodeのindex/ledger hash結合。record private fieldの限定viewとsealed constructorを審査し、公開getter/JSON authorityにしない。
3. RecordEvidenceを保持するreaderと元時計/共通台帳への接続。現在のInspectedV2Recordsをそのままauthority tokenにはしない。
4. role scopeのopener/leaf moveを合成所有resourceで実装→M0/open snapshot結合→M4前finalizer→record/祖先/path失敗matrixの順で確認する案。
5. 追加topology予算の最悪回数・FD132/process合計・record buffer/RSS、Filesec/close解放とhard timeout。承認までは運用gateを開かない。
6. 更新lease/管理freezeの選定、関連process終了確認とrelease保持。単なるbool/TTLやFile所有だけで更新排他を満たしたとはしない。

後続合成試験には、別Session/role/hash/世代の混在、同hash別inode、祖先/rootのrename、leaf symlink/hardlink/特殊file、open→move直前の変更、M0/B/M4前後の差、record差替え、全失敗点のDrop件数・FD上限・取消/遅延・固定非出力を含める。
合成成功でも実root配備/OS syscall/実署名/leaseを検証済みとせず、明示承認なしに実機テストを追加しない。

## 11. draft-0.1の文書検証

新規本書と関連設計の参照を更新し、local link/code fence/行末空白とgit diffを検査する。
Rust/TSコードを変更しないためビルド・テストは再実行しない。362件成功は前工程の実source合成検証で、本移譲の実装/試験結果ではない。

## 12. record binding・所有権移譲の内部契約

[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_FD_TRANSFER_CONTRACT_SYNTHETIC_2026-10-19.md)に追加18件・全体380件を記録する。
[transfer.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer.rs)はprivate moduleで、実reader/openerやmacOS constructorには接続しない。

- `RecordBinding`はactivation/ledger/indexのpath/hash・世代/release・実行UID/readerGID・platform・registry/policy・root・時刻を保持する**比較用データ**。
  raw record bytesを認証した型ではない。hash配列は入力された比較値であり、現実のrecordから計算した証拠ではない。JSON/公開結果からのproducerはない。
- `BoundTarget`はrecordとopaque lineageを借用し、Nodeのledger/index hash一致・Indexed size・mode0555・role/policy・root-relative pathを検査する。
  role=LauncherはUnavailableでopen前停止。ObservedBoundedをNodeの宣言sizeに変換しない。root/relative各64、結合path最大128 components、4096bytesをbounded検査する。
- `OpenedTarget<R>`はleaf R・祖先R群・初期Observationと、比較用record/target値・originを所有する。移譲時に全比較fieldと`Rc::ptr_eq`、祖先componentの数/順序を照合する。
  このoriginはprivateなscopeの対応だけで、実利用者・root承認・readerセッションの真正性を証明しない。
- 正常化した初期leaf policyが適合した場合だけ、同じRを`TransferSource<R>`へmoveし、`HeldTargetScope`が祖先とBoundTargetを保持する。
  **TransferSourceは所有権carrierであり、実HeldSource<SystemApi>には接続していない。** この段階ではM0結合も後工程だった。後続の§13で所有leafのMetadataOpsを使うM0結合を追加したが、ancestor snapshot/実path再walk・record最終再読はまだない。
- private `with_target`はopen前後/source-use前後/drop後に元SharedBudgetのcheckpointを確認し、最初の有限失敗をラッチする。
  source-use closureはテスト用内部境界で、公開runtime callback/injection口ではない。結果型はunit相当の非authority診断だけで、resource/FDを返せない。
  owned RのDropを使い、leaf→祖先の解放を確認。部分open失敗、移譲前拒否、移譲後失敗、遅延成功/エラー、取消、unwindを含めて1回だけ解放する。
- record時刻は比較用start wall値に対する受付460秒超・元Instantから導出した終了wallで450秒超を確認する。承認が開始より未来/加算overflowはBinding、残期限不足はExpired。
  実wall/monotonic clock pairの再取得/整合は未接続であり、この純粋検査を実record期限の観測証拠とはしない。
- 既存内部FailureにBinding/Unavailable/Expiredを追加しただけで、公開JSON/exit codeを変更しない。payload/metadataの容量・要求・再試行枠も変更しない。
  receiptの祖先数＋leaf＋一時2枠が132超ならLimit。ただし実openerの各open前予約やprocess全体FD台帳は未実装。

成功Debugは`MovedTarget(pending_m0_topology_records_not_execution_authority)`固定、execution_gateは必ずUnavailable。
実Session/RecordEvidence producer、祖先のOS metadata/namespace証明、M4 finalizer、追加topology予算、lease/実macOS source移譲・native/API/permitは引き続き停止する。M0結合の後続実装は§13。
合成resourceのBox token/Drop一致はRust所有権の証拠であり、実close成功や実FD数/OSメタデータの証拠ではない。

## 13. open snapshotとM0の内部結合

[open/M0合成検証記録](E2E_BEST_PRACTICE_R2_OL03_OPEN_M0_SYNTHETIC_2026-10-19.md)に新規14件・全体394件を記録する。
実opener/macOS constructorへは接続せず、合成resourceだけがprivate ResourceOriginとMetadataOpsを実装する。

- open receiptに初期Observationとresource originを保持し、attach時にleafのoriginと`Rc::ptr_eq`で一致を要求する。同じmetadataでも別originのleafへ取り換えるとBindingで止める。
  ResourceOriginはowned resourceに対応するprivateなopaque Rcで、FD整数や公開JSONではない。実openerが同じ保持Fileからsnapshot/originをmintするproducerはまだない。
- `review_opened_target`がHeldTargetScopeを消費し、sourceの所有leafを直接1つのReadScopeへ可変借用する。別source・snapshot・期待hashを注入する引数は持たない。
- collector呼出しの前後でoriginを確認し、移譲後のresource差替えや取得中のorigin変更をSourceMismatchで停止する。M0前の差ならmetadata/payload呼出し0回。
- M0はcollectorから**1回だけ**取得する。正常化したStat全field・ACL/FS・可視xattr名の集合をopen時Snapshotとexact比較し、一致する場合だけ既存Flowのbaselineへ渡す。
  M0でbaselineを更新して変更を救済しない。不一致ではpreflight/read payload0回。取得不明/期限/取消はopen snapshotへのfallbackなし。
- open時にpolicy適合を確認済みなので、この経路のM0 policy不適合はChangedへ**sticky latch前に**変換する。不正ACL present等の取得不明はMetadataUnavailableのまま。
  従来のunbound collectorのM0 policy分類は変更しない。
- 同じscopeのA/parser/B/M1〜M4をそのまま継続し、metadata50回/正常role・元のpayload課金を維持。open照合のためのM0再取得や新しい10秒は設けない。
- source/祖先/ACL handle/読取予約は返却前に解放する。失敗をラッチしてからdropし、解放後にもcheckpointを通す。unwindでもRAIIを維持する。
- 成功は非Clone/非serializeの`OpenBoundComparison(pending_topology_records_lease_not_execution_authority)`。従来のComparedM0M4から直接昇格するconstructorはない。
  XML/DER/absenceの既存entitlement gateは停止を維持し、祖先/path/record/leaseが未検証のままpermitを発行しない。

origin比較は協調的な所有型の結合であり、悪意あるMetadataOps実装やABA・実FD/OS identity・可視性を証明しない。raw Observationだけを別resourceから偽造するtrusted producerの侵害も保証対象外。
この段階の結果型にtopology保証は追加しない。別の§14の経路がM4前topologyを必須化し、§15がrecord再読契約を追加する。実record reader/parser・更新排他・実opener/File移譲・実機/API/permitは依然未実装/未接続。

## 14. 祖先/path再照合の内部契約・合成source

[topology合成検証記録](E2E_BEST_PRACTICE_R2_OL03_TOPOLOGY_SYNTHETIC_2026-10-19.md)と、privateな[topology.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology.rs)を追加した。実filesystem/OS adapterはない。

- `TopologyReceipt`は同じopenに伴う比較用lineage/record/targetと、各保持祖先のorigin/初期snapshotを所有する。非Clone・非serialize・公開constructorなし。実opener producerは未実装であり、root承認済みの証拠ではない。
- `TopologySource<R>`は保持祖先観測・固定`/`の新規anchor・parent相対child・一時resource観測という単発境界。component/順序とdirectory/leaf区分はBoundTargetから固定し、callerのpathやflagsを受け取らない。sourceはprivateな合成実装だけで、trusted OS backendではない。
- `review_topology_target`はHeldTargetScope/receipt/sourceを消費する。**移譲後・M0前**と**B完了後・M4取得前**の2回、保持祖先を全件再観測し、anchorから全edgeと最後のleafを再walkする。一方が成功しても他方を省略しない。M0〜M4は従来どおり各1回。
- origin・record/target・component/cardinalityの結合を前後で確認し、同metadataの別保持resourceはSourceMismatch、別receiptはBinding。directoryはbefore/after全Stat、ACL/FS、可視名の分類を初期snapshotとexact比較する。leafはopen時のStat/可視名へ結び、hash一致で別inodeを救済しない。
- directoryはleafのlinks=1やsize>=32を適用しない。合成profileではroot UID・directory type・mode0555/0755・非zero links・時刻ns・ACL absent/FS localを要求する。祖先のdeviceはleafと同一と仮定せず、各初期値と比較する。**system祖先のmode/xattr/FS適合が承認済みという意味ではない**。OS側のAPFS/ownership/noexec等の取得/方針は未接続。
- raw xattr名を受け取る契約にはせず、Empty/Provenance/Disallowed/Unknownの固定型を使う。実OS列挙のbounded解析・可視性・成功copy課金を代替しない。UnknownはMetadataUnavailable、policy不適合・初期値との差はChanged。
- `SharedBudget.topology_calls`は全呼出しで共有し、単発境界16384回を超える前にLimit。同じ10秒・cancel・sticky failureを全境界の前後へ伝播する。M4前に予算をresetしない。payload/metadata50正常呼出し/100上限・名前枠・EINTR枠は変更しない。
- namespaceのcurrent/nextは最大2個だけ生存するstreaming所有型。一時resourceをpread/parserに渡さず、失敗/遅延/取消/unwindでも解放する。132の構造上限を維持するが、合成Drop数は実FD/close成功/OS resource予約の証拠ではない。
- B後の再照合失敗では保留中の解析結果を捨て、M4を取得せず停止する。初回失敗ではM0/bytesを取得しない。再試行・旧FDからの継続・弱いpolicyへのfallbackはない。
- 成功は非Clone/非serializeの`TopologyComparison(synthetic_pending_records_lease_not_execution_authority)`だけ。従来のOpenBoundComparisonから変換できず、entitlement/native/permit gateを開かない。

この契約は協調的な合成sourceの挙動を検証するもの。実sourceの内部で隠れた再試行/巨大allocation/別path読取がないこと、ABA/検査後変更の防止、更新lease/record再読、OS hard timeoutは未証明。telemetry調査は保留し、実機/API・本番policy・token/設定/permit/Pushは行わない。

## 15. record再読・最終照合の内部契約

[record合成検証記録](E2E_BEST_PRACTICE_R2_OL03_RECORD_FINAL_SYNTHETIC_2026-10-20.md)とprivateな[records.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs)を追加した。実installed reader/厳密JSON parser・closure集合producerへは接続しない。

- `RecordReceipt`は同じlineage/RecordBindingとactivation/ledger/indexの固定順3件のpinsを所有する。pinは初回exact bytes・祖先/leaf snapshot。非Clone/非serialize、公開constructorなし。合成fixtureがmintし、初回実readerによる認証済み証拠とはしない。
- 入力結合時にrecord全field・lineage・kind順序・path深さ/祖先数・size・SHA-256を確認する。activation固定path、ledger/indexは元bindingのpathに固定し、後から得たpathへ追従しない。activation/ledger各64KiB、index16MiB。hashは64KiB chunkごとに元checkpointを通す。
- `RecordSource`はclock、kind固定anchor、parent相対child、観測、位置指定read、3件の意味投影再検証という単発境界。retry/fallback/公開path/flagsの注入口はない。各再読では新しいanchorから全edgeをwalkし、初回snapshotと照合した**同じleaf handle**を読む。
- positive short readは進捗分だけ継続し、0進捗・過大返却はReadFailed、extra EOF/bytes差はChanged。コピー成功bytesは既存2GiBへ課金し、A/B用予約を流用しない。最大64KiBの追加bufferでpinと逐次exact比較し、raw record/code/path/hashは出力しない。
- read前の全path、同じhandleのread後metadata、handle解放後の全path再walkを要求する。旧FDが不変でもnamespace差替えは拒否。recordは順次処理し、再walkの一時handle最大2個、旧target祖先＋leafと合わせた132の構造上限を維持する。record Fileを全工程保持したという主張ではない。
- activation leafはroot/0440/readerGID、ledger leafはexecutionUID/0600、index leafはroot/0444、いずれもregular/single link。全Stat/ACL/FS/可視名をexact比較。directoryはrootまたはledgerのexecutionUIDを許す既存条件と書込/special bit拒否を用い、leafのsize/nlink規則を適用しない。system/record xattr/FSの運用profile承認は別途必要。
- `revalidate`は再読でexact一致した3件のpin bytesだけを受け、返した全RecordBindingを元値と比較する。generation/release/registry/policy/UID/期限/index bindingの変更もChanged。**今回のsourceは架空bytesから合成投影を返す契約テスト**であり、厳密JSON/schema/closure集合検査を実装したものではない。既存parserを元予算へ接続するproducerは未実装。
- 元のstart wall/monotonicとclock再取得を結ぶ。両clockの巻戻し・elapsed差1ms超・元SharedBudgetのelapsedとの差1ms超をExpiredで拒否。開始時の460秒超、再読前後の450秒超を厳密に要求し、期限を更新しない。元10秒/checkpoint/cancelが優先し、実clock sourceやhard timeoutは未接続。
  **実clock接続時の注意**：record sourceのwall経過・monotonic経過・SharedBudgetの`Instant`経過は、それぞれms切捨ての独立した読取値である。合成試験は同じ起点から作るため通るが、実sourceで起点の取得時刻がわずかにずれると、正常時でも差が2msになり`Expired`（安全側の誤拒否）となり得る。実clock source接続前に、`start_monotonic_ms`を`SharedBudget.started`と同じ読取から導出する契約にするか、許容を2msへ広げるかを決める。決めるまで実clock接続を有効化しない。
- 新しい`review_record_target`は初期receipt/time検証→M0前topology→A/B→M4前topology→record再読→M4→record最終再読/投影/clock確認を必須にする。共通比較器のprivate hookへ固定処理を接続し、利用者が省略できない。旧TopologyComparisonの保証は変更せず、そこから新結果へ昇格するconstructorはない。
- record境界も元のtopology契約16384回枠を共有し、phase/role/recordごとにresetしない。payload/metadata100/名前640KiB/EINTR8枠を増やさない。これは契約call数であってsyscall数ではない。
- 最初の失敗をラッチし、保留解析結果・source/target/record bytesを解放してから最終checkpoint。失敗後M4/次record/次roleへ継続しない。成功は固定Debugの`RecordComparison(synthetic_pending_lease_os_reader_not_execution_authority)`で、entitlement/native/permit停止を維持する。

実reader側の安全な初回allocation/読取課金、protected path/flags・実ACL/xattr可視性・APFS等、再parseと全closure集合照合、更新lease、OS FD/cleanup台帳、clock取得、API/permitは未接続。合成snapshot・手動投影はroot承認や実inodeを証明しない。record間の変更、ABA、検査後変更をatomicに排除せず、今回の成功を後続execの有効cacheへ持ち越さない。

## 16. 厳密parser・全closure再検証の接続設計

[再検証接続詳細設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_RECORD_PARSER_CLOSURE_DESIGN.md)に、I/O sourceと固定verifierの分離、activation/ledger-0.2/固定registry/index全宣言の照合、同session/roundの全closure観測producer、M4前後の全scanとrecord前後再読を具体化した。
元10秒/2GiB/16384契約callをresetせず、100,000件の形式上限を実行可能件数としない。ledger時刻の二重加算、decodeの理由丸め、cancel/管理allocation/同じNode sourceへの限定借用、実clock丸めとlease等の未確認事項を明記した。
後続で[共有予算JSON core](E2E_BEST_PRACTICE_R2_OL03_SHARED_JSON_CORE_SYNTHETIC_2026-10-20.md)だけを先行実装した。元SharedBudgetの期限/cancel/workと型付き理由を保持するが、§15の合成revalidateを厳密record parser/全closureへ接続した実装・テスト結果ではない。旧decode契約と運用gateの停止を維持する。
さらに[activation/ledger-0.2/registryの純粋検証](E2E_BEST_PRACTICE_R2_OL03_STRICT_RECORD_JSON_SYNTHETIC_2026-10-20.md)を共有予算JSONへ接続した。raw hash-first・既存schema/意味検査・型付き理由を維持するが、実reader/revalidate・実registry producer・index/全closure観測は依然未接続で、permitを発行しない。
