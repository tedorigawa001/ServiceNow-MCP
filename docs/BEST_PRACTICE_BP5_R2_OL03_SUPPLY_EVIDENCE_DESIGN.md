# BP-5 R-2 OL-03：保護producerの供給証拠検査・詳細設計

Version: draft-0.8 / Date: 2026-10-23 / Source baseline: `e77f1ae` / Status: Context/Records/HeldSources・PolicyCaps→SlotsとPC-02の同estimate scan必要量projection/35項目比較を合成実装。PC-03のone-shot parts設計を追加（MDのみ）。全体必要量/cap承認・準備Envelope/通常strict未接続、本番issuer/運用承認なし

## 1. 範囲と不変条件

[生成入口設計](BEST_PRACTICE_BP5_R2_OL03_PRODUCER_CREATION_DIAGNOSTICS_DESIGN.md)§11の準備claim・owner確保・同budget結合に続き、context/records/held-source/policy/3slotの**供給証拠**を検査する境界を設計する。既存sealの由来確認と、上流で何を検証したかの証明を分ける。

全体受付無効・telemetry保留・APPROVED_REGISTRY=None・通常v2 Unavailable・gate92・DER/absence停止を維持する。§11〜13の合成内部subset以外の実装、OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行を含めない。通常strictは差し替えない。証拠検査の成功は署名検証/実行許可や現在時点のファイル不変性を意味しない。

任意の値をprivate wrapperやRcに包むだけでは、承認済みregistry・実効groups・安全な取得・正しいcapの証拠にはならない。発行時の検証、発行元への到達経路、同じ所有値との結合を成立条件に含める。

## 2. 現状と差分

| 現行部品 | 成立していること | この設計で追加する契約 |
|---|---|---|
| [preparation.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/preparation.rs) | 準備claimの一度限り消費、同budget入口検査、Option完全性確認、部分入力discard | 各値に対応する上流の検証済み証拠を消費する |
| [protected_inputs.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs.rs) | 供給seal・context参照・lineage/binding・source stamp・slotの結合 | sealが一致するだけで証拠欠落を救済しない。既存利用guardも省略しない |
| [InspectionContext](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict.rs) | registry/groupsを借用する内部構造 | raw借用の存在と、承認/実効contextの証拠を別扱いにする |
| [RecordReceipt/RecordSource](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records.rs) | pins・lineage・binding、同sourceでの再読/検証契約 | 初回の安全取得・厳密検証と、そのsource所有値の供給証拠を結ぶ |
| [ResourcePolicy](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/round_declaration/session/resources.rs) | session/round会計、cleanup予約 | 数量上界と承認capを分離し、信頼できるpolicy発行を要求する |

本番発行元はいずれも将来案である。Context/Recordsの合成issuerを§11、HeldSourcesを§12で実装した。既存の合成constructorや[InspectedV2Records](../native/r2-outer/src/records_v2.rs)から自動変換する口を作らない。後者だけではindex pins/held/source/3slotを含む一式の証明にならない。

## 3. 証拠の型・発行元・発行前提

型名はprivate内部契約の候補で、MCP JSON/外部設定へ追加しない。全証拠は非Clone・非Copy・非serde、固定opaque Debugとする。検査用scalarのコピーは許すが、コピーから証拠を再生成できない。

| 証拠型案 | 唯一の発行責務案 | 発行前に必要な検証 | 値との結合 |
|---|---|---|---|
| ContextEvidence | 承認build registryと同起動contextを保持する専用module | 承認された固定registry、boundedな実効uid/gid/groups・環境context取得、対応するschema/model | 同じimmutable保持領域、inspection origin/claim/started、registryの承認identityと実効context |
| RecordsEvidence | 安全なrecord取得・初回厳密検証module | activation/ledger/registryのhash-first検証、indexの適用可能な検証、role/generation/hash/time/metadataの結合 | 元receipt lineage、pins/binding、targetと外部BoundTarget保持領域、同RecordSourceの発行identity |
| HeldSourcesEvidence | 同secure opener/attach系列の固定module | 保持resource/open snapshot・祖先/path・topology取得の必要検査とrecord系列への結合 | 元held resource origin、TopologyReceipt、同RecordSource/TopologySource所有値 |
| PolicyCapsEvidence | 将来の承認cap検査・ResourcePolicy発行module | 承認capとモデルの照合、同宣言の必要数量、session/round/live/cleanup/retry枠の適合 | 同cap承認、submodel群、receipt/target/budget、ResourceInputとQuota3個 |
| ScanSlotsEvidence | 将来の固定backend所有module | 3scanが未開始で、承認対象backend/model・root/source系列へ対応すること | Initial/BeforeM4/AfterM4、同供給系列・固定順序、対象root/receipt/budget |

ContextEvidenceは資料上のregistry名やgroups配列の自己申告を受理しない。RecordsEvidenceはhash/時刻等のscalarだけ、HeldSourcesEvidenceはFD番号/pathだけ、ScanSlotsEvidenceは型名/slot番号だけでは発行できない。PolicyCapsEvidenceは算術結果だけでは発行できない。

### 3.1 発行元を閉じる方法

証拠型のfieldとconstructorは**発行元moduleが所有**し、受信側は固定の消費/照合口だけを使う案とする。中央の汎用`Evidence::new(raw, approved=true)`、公開traitの任意実装、caller指定factory/backend、env/argv/任意pathからの証拠読込は設けない。実際に発行元だけから構築できる可視性/型配置は実装前に確認する。

sourceは、固定発行元が取得時から管理する仮称IssuedSource/IssuedOpenBundleとして所有し、専用identityを**取得した値と同時に**移す。move前のsourceアドレスは保存せず、後から任意のgeneric sourceへstampを付けてtrustedにしない。証拠が同sourceを示しても、そのbackendの検証保証が未承認なら発行不可とする。

同じ証拠検査coreを合成試験で使う場合も、test発行口はcfg(test)だけに閉じる。本番発行口不在はUnavailableのまま。test用証拠をserialized fixture・環境変数・ビルドflagで本番へ持ち込まない。

## 4. 所有権・外部保持領域

上流の固定所有者がcontext/registry/groups、target、BoundTargetとその参照先bindingを安定した外部領域に保持する。Envelopeと証拠は借用lifetimeを持ち、結果格納/入口returnまで保持領域を生存させる。自分のfieldを借用する自己参照Envelopeは作らず、unsafeの寿命延長・RefCellによる共有化・contextの同値コピーで回避しない。

receipt/held/topology/source/scan/policy/Quotasは準備所有者へ値移譲する。証拠はそれらの由来を持つが、resourceやsourceを二重所有しない。証拠に含めるRc等の参照はidentity用であり、FDの複製や再openを行わない。

| 対象 | 受理する結合 | 拒否する代替 |
|---|---|---|
| context/registry/groups | 発行済みの同じ保持領域・承認identity | 同じbytes/groupsでも別の未承認保持領域 |
| receipt/binding/target | 同lineage＋厳密binding＋同target発行系列 | 同値だが別lineage/世代、callerが組み立てたtarget |
| 外部bindingコピー | 同record producerが作り、元receiptと同lineageかつbinding完全一致 | 外部から受け取った同値コピー、別record系列 |
| held/source/topology | 発行元の同resource/source所有identityとopen/record系列 | 同pathを再open、同じ数値FD、sourceをfactoryで再作成 |
| policy/slot | 同承認/モデル/receipt/budgetへ結合された所有値 | 同じ数量の別policy、入替scan/Quota、欠落を既定値で補充 |

既存releaseの「receipt move後のlineage/value照合→局所canonical参照正規化」は維持する。証拠のために元receipt fieldのアドレスを固定したり、既存のpointer guard/再読を省略しない。

## 5. 一度限りの消費と公開

証拠一式は仮称SupplyEvidenceSetとしてEnvelopeの部分所有領域にOptionで格納する案とする。各証拠型は上流発行元の非再発行owner/claimにも結合し、単なる値のmoveだけで同じ値に別証拠を再発行できる設計にはしない。発行者のunique claim/保持量の詳細は未実装である。

準備claimは既存どおりowner確認/workより先に消費する。slot確保後、証拠は固定順にOption::takeで一度だけ検査器へ移す。検査器はpayloadを借用し、所有resourceを持ち出さない。証拠とpayloadが揃った検査済み段階だけ、非Cloneの仮称ValidatedSupplyPartsへ進む。未検査の同名型をcallerが作る口や、任意stage setterは作らない。

複数証拠を消費した後で失敗しても再充填/再試行しない。検査済みの証拠/段階は準備owner内に保ち、成功時の固定公開guardが一度だけ消費してProtectedSupplyを封印する。証拠検査済みの値だけを、既存create_typed→利用guard→固定releaseへ渡す。新規の成功/Closed/ack/permitを発行しない。

## 6. 固定検査順・検査内容

| 順序 | 位置 | 固定の検査 |
|---:|---|---|
| 0 | 既存準備claim/OwnerBegin | 不可逆開始、同ownerのslot確保。ここで失敗したら証拠検査を呼ばない |
| 1 | Supply(InspectionEntry) | 既存O.supply_entry。同budget/seal/claim/session/started・fresh・未generated/未used |
| 2 | Supply(Context) | ContextEvidenceの発行元/同保持領域/承認registry/実効context結合。存在確認だけにしない |
| 3 | Supply(ReceiptTarget) | RecordsEvidenceと元receipt/pins/binding/target/外部保持領域・同record source系列 |
| 4 | Supply(HeldSources) | HeldSourcesEvidenceと元held/open/topology、同source所有値、直前段階のrecord/context結合 |
| 5 | Supply(PolicyCaps) | PolicyCapsEvidence、同承認cap/submodel/必要数量・ResourceInput/Quota3個の結合 |
| 6 | Supply(Slots) | ScanSlotsEvidence、固定3scanの系列/順序/未開始状態、root/receiptとpolicyとの適合 |
| 7 | Supply(SealPublish) | 全証拠消費済み段階・必須値・同供給系列を確認し、ProtectedSupplyを一度封印 |
| 8 | Supply(PublicationCheckpoint) | 元budgetの公開前最終checkpoint。遅延成功を拒否 |
| 9 | 既存Create/Use/TransferCommit | 型付きcreate/既存利用guard/固定release/実結果retainを維持 |

順序8の位置variantは設計候補で、現行enumへは未追加。issuer不在/証拠欠落はその段階で停止し、後段を試さない。各段階は元budgetで開始前/課金後/公開前のcheckpointを維持する。新budgetや別の期限を作らない。

証拠に保持した発行元snapshotの検査であり、この工程から新しいOS照会/外部通信は行わない。初回のhash-first/metadata/time検証や、後続のrecord再読・A/B・M0〜M4・3round scan前後検証は別責務として残る。古い証拠の存在から現時点の不変性を推論しない。

### 6.1 承認capとの未確定な接続順序

PolicyCapsEvidenceの具体的な承認主体/固定配布形式/版・失効/モデルbindingは次工程のcap設計で決める。本書では承認capの実数や本番policyを確定しない。

必要数量のprofileをいつ安全に取得し、初回index decodeと3round資源配賦へ接続するかも未確定である。`create成功→scan→cap承認→create`という循環を作らない。初回decodeを勝手に追加したり、raw scalar/合成profileから承認証拠を作ったりしない。事前の保護されたprofile供給または既存phaseへの統合を、全体work設計と対で決めるまで、本番のPolicyCaps段階はUnavailableで停止する。

## 7. 失敗分類・診断保持・解放

| 事象 | primaryの方針 | location |
|---|---|---|
| issuer/証拠/承認cap欠落、未知/未対応model | Unavailable | 該当Supply段階 |
| 別budget/世代/lineage/保持領域/source/slot、重複消費 | Binding | 最初に不一致を検知したSupply段階 |
| 元検証器がhash不一致/変更/期限不適合を検出 | HashMismatch/Changed/Expired等の元理由を保持 | 拒否を受け取った段階 |
| 証拠上限・必要数量・work/checked算術の不適合 | Limit | 該当段階 |
| 共有期限/取消/先行sticky failure | Deadline/Cancelled/先行理由を保持 | その時点の段階。Bindingへ畳まない |

locationは検知位置であって原因種別ではない。InputRejectedのlocation/primary/解放/checkpoint観測を既存上位ownerへ一度moveする。Supplyでは旧input_stageはNoneであり、拒否なしと解釈しない。未開始のround/CompletionFailureを捏造せず、移譲後は実Outer全体を保持する。

resourceの所有者は固定準備ownerのままとし、検査失敗時にpayloadを返して上位へ再試行させない。まず元budget/claimへ第一理由をlatchし、消費中の証拠/ValidatedSupplyPartsを閉じる。その後にscan3個→resource/Quotas→RecordSource→TopologySource→held→TopologyReceipt→RecordReceiptの固定discardを実施し、最後にcheckpointを観測する。

証拠型のDropは新I/O/close/callback/検証失敗を起こさない契約とする。証拠の参照解除はresource解放の証拠ではなく、source/FDはpayload側だけが解放する。外部保持領域は上流が入口returnまで維持する。停止通知・診断move・固定discardに新work/heap確保を要求しない一方、解放回数/保持memoryを独立resource費から除外しない。

Debug/log/診断projectionへpath・raw code/record・registry/groups・token・FD番号・ポインタ値を出さない。panic/abort/forget/kill・戻らないDrop、受領前失敗や入口へ渡さないEnvelopeの回収は保証しない。SequenceReturnedからOS close/Closed/ack/permitを作らない。

## 8. 追加費目・上界候補

model候補を`bp5-r2-supply-evidence-0.1`とする。未知modelは固定registryの検査でUnavailableとし、ID文字列の一致だけで証拠を信頼しない。以下は未実装・未計数の候補である。

| 費目 | 候補work | 現行との関係 |
|---|---:|---|
| O.supply_entry | 1 | 既存実装を維持、一度だけ課金 |
| O.supply_context/receipt/sources/policy/slots | 各1 | 固定数の証拠identity/段階guard。動的検査/発行費を含めない |
| O.supply_publish | 1 | 消費済み段階と固定公開guard |
| O.supply_terminal | 1 | 公開直前guard/checkpoint |
| U_evidence_issue | 未確定 | 上流の証拠発行・取得・初回検証/包装の未包含費 |
| U_evidence_dynamic | 未確定 | groups・可変長binding/path等の照合、cap/model/必要数量検証の未包含費 |

本案では、現行complete1の必須値確認を各段階とpublishへ分散して**置き換える**。同じ完全性検査を二度課金しない。固定部分の比較式は現行17からcomplete1を除き、新規7を加えた`17 - 1 + 7 = 23`候補である。これは費目差分であり、実消費済みworkを返却する計算ではない。現行17の実装/検証結果は本書だけでは変更しない。

全体候補は固定release直呼びとの差について`23 + U_evidence_issue + U_evidence_dynamic`。既存R/I/S/Oで実行/課金する処理はそこへ一度だけ置き、証拠側へ再加算しない。初回registry/record parseを証拠のために再実行せず、同じ検証済み値を保持する方式を優先する。ただし「保持済み」と仮定して実際の検査を省略しない。

可変長比較を固定guard1のString/Vec全比較へ隠さない。各入力の既存byte/group/depth上限を先に確認し、必要なら既存JSON/text/hashモデルと整合するchunk単位（65536 bytes）等で事前課金してから照合する。係数/固定費/失敗prefixは実装と独立oracleで導出する。workはCPU/wall time/RSSの上界そのものではない。

発行claim、証拠/ValidatedSupplyPartsのinlineサイズとRc参照、上流保持領域、bindingコピー/chain配列、同時に保持する部分証拠とpayload、固定解放に必要な量をallocation/bytes/FD/cleanupの独立台帳へ列挙する。証拠を付けても「管理費0」「取得済みFDは無料」と扱わない。

[全体work設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)の6 record検証・3 index decode・3scan・coupling35＋K/configure1・profile/算術/typed tailを維持する。未知項を0にせず、100万work・元10秒・payload2GiB等の既存上限も緩めない。独立resource上界とcap承認が未確定なら全体受付は無効のまま停止する。

## 9. 全体の合成検証受入条件（部分実施は§11〜12、全体は未達）

1. test issuer以外のraw registry/groups、同値コピー、任意generic source/数量summaryから証拠を作れない。non-test issuer不在でUnavailableとなる。
2. 型は非Clone/非Copy/非serde、opaque Debug。証拠のlookup/projectionから再発行/状態resetできない。
3. Context→Records→HeldSources→PolicyCaps→Slots→Publish→Checkpointの順とlocationを照合。前段失敗なら後段検査/scanは未開始。
4. 同値だが別issuer/保持領域/budget/source、別世代/role/model、slot/Quota入替を一つずつ拒否する。外部bindingコピーは既存の限定例外だけ受理する。
5. 各証拠欠落、二重消費、消費途中失敗、owner差替え、準備claim再利用で停止し、先行理由を保存する。
6. 各work不足・課金後取消・期限切れ・失効・上限超過/overflow、公開直前の遅延成功を拒否する。issuerの元失敗理由も保持する。
7. 各部分状態で証拠参照とresourceが一度だけ所定順に解放される。drop watchは記録専用で、破棄後に検証する。
8. 成功は既存create/利用guard/固定release/実結果保持だけを通る。後続の再読/M0〜M4/3round検証・既存gateを省略しない。
9. 合成cap/issuerを本番へ昇格せず、未承認cap/未知上界は停止。独立oracleで固定/動的/発行費の重複・漏れを検査する。
10. 固定評価セットは変更せず、既存生成済みbundle経路と旧offline契約を維持する。OS/backend/permitのfake成功を足さない。

## 10. 次の実装範囲と承認待ち

PolicyCapsの承認原票・ModelBundle・必要profile/Initial bootstrap供給順序・失敗停止は[詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)で具体化した。固定build内cap原票と限定BootstrapCapsを信頼元候補とし、全cap値・失効/配布・所有者API移行は未承認。原票/Witness/消費器の実装はまだない。

ContextEvidenceとRecordsEvidenceの内部型/発行前提/消費検査を§11、HeldSourcesを§12、独立したScanSlots検証片を§13で合成issuerだけ実装した。PolicyCapsは承認cap契約/全体profile供給順序と対で設計・接続する。それまでは全体成功を主張しない。検査順5/6を実装順に合わせて入れ替えない。

本番issuerの配置/可視性と必要検証、sourceに対応する所有stampの発行方法、外部保持領域の構築、cap承認主体/配布/失効、profile供給と初回decodeの順序、発行claim/保持量、正確な動的費/上界は未承認・未検証である。既存seal・型名・同値hashだけを根拠にこれらを既成事実にしない。

## 11. Context/Recordsの合成内部subset

[supply_evidence.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence.rs)と専用context/records moduleに、非Clone/非Copy/非serdeのContextEvidence、RecordsEvidenceと消費済み段階を置いた。fieldは各moduleだけが構築し、発行関数・取得factory・意図的な不正fixture生成はすべてcfg(test)。本番issuer・外部入力口・ProtectedSupplyへの変換はない。

### 11.1 発行前提とimmutable所有値

合成factoryはcontext/targetを外部借用し、receiptとRecordSourceを**値で所有するEvidenceInputs**を先に構成してから検査する。source stampとissuer identityはこの所有領域の取得時に作る。検査成功まで外へ返さない。非testでは所有領域のconstructor、変更口、source/receipt抽出口を設けない。

- Context：固定の合成承認registryに実bytesで照合し、registryは64KiB以下、groupsは既存MAX_GROUPS以下。合成実効groups `[80]` とuid501/gid80を用いる。callerのapprovedフラグではないが、**OS実効contextや本番registry承認の証拠ではない**。
- Records：同sourceで既存のvalidate_receipt→bounded reread_bytes→clock_check→hash-first verify_recordsを通す。activation/ledger/registryの厳密JSON・binding・時刻等を検証し、Initialのindex decode/Node照合も行う。任意sourceをstampだけで承認しない。
- 取得はContext/Recordsをまとめた合成factoryであり、独立した本番取得段階ではない。検査済みのimmutable所有領域との結合なので、消費時には可変長bytesの比較や再parse/I/Oを行わない。所有containerのmove前のreceipt/sourceアドレスを保存しない。

### 11.2 発行・消費claimと順序

同SharedBudgetの既存ProtectedBridgeClaimにcontext/recordsのissued/usedを各1個追加した。発行・消費の試行はwork/checkpointより先に不可逆claimを消費する。proofのdrop/失敗で再発行せず、別issuerを作り直しても同budgetのclaimを迂回できない。proofは固定model、同inspection origin/bridge/session/started、session未開始・未generated/未usedへ結合する。

発行はContext→Records。消費はContextEvidence→ContextCheckedを必須とし、RecordsEvidenceがそれを値で消費してContextRecordsCheckedへ進む。両proofの同issuer・context保持領域・receipt lineage・source stamp・外部BoundTargetの同一性を照合する。チェック済み段階は供給公開・Closed・ack・実行permitではない。

失敗は元理由をstickyにし、Supply(Context/ReceiptTarget)のInputRejectedへ保持する。別budgetへの混入は提示側と元claimの双方を停止する。proofはresourceを所有せずidentity参照だけを保持する。EvidenceInputsの固定field順でsource→receiptを破棄する。本subsetの拒否時点では解放/checkpoint診断はNotReachedであり、固定準備ownerのdiscard観測を捏造しない。

### 11.3 費目・限界

合成発行2＋消費2は各1 work、計4。取得検証の費用は別で、既存record/index/json/hash/I/O費を共有budgetへそのまま課金する。合成contextの入口/上限確認1、bounded registry比較1、groupごと1、record取得dispatch1を追加した。実効contextのOS取得費や全体上界を確定したものではない。

EvidenceInputsのidentity/source stampに新規Rc allocation各1個、既存budget claimへbool4個、proof/checked段階には既存identityのRc参照を保持する。receipt/sourceの所有量・外部contextのbytes/groupsは別に残る。固定guardの成功を管理memory/取得費0と扱わない。

既存run_creationの17 work差分、固定評価セット、通常strictは変更していない。合成factory内の初回index decodeは単独の発行前提試験専用で、通常経路へ4回目のdecodeを追加していない。将来は既存検証の所有結果へ統合し、3decode/6record検証と二重課金しない順序・上界を別途設計する。§8の23候補や全体受付は未有効化。

[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CONTEXT_RECORDS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。後続のHeldSourcesは§12、PolicyCaps/ScanSlots、準備Envelopeへの証拠接続、上位ownerへの取得前失敗/解放観測の合流は未対応である。

## 12. HeldSourcesの合成内部subset

[held.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/held.rs)にHeldSourcesEvidenceとHeldSourcesCheckedを実装した。fieldは専用moduleが所有し、取得/発行・不正fixture生成はcfg(test)限定。非Clone/非Copy/非serde・固定opaque Debugを維持し、raw FD/pathや診断票から証拠を構築する口はない。

### 12.1 発行前提

合成opener/attach系列のHeldTargetScope、TopologyReceipt、TopologySourceと、§11のimmutable EvidenceInputsを値で受け取る。前段のContext/Recordsを発行・消費済みで、同budget/origin/session/started・未session開始・未generated/usedであることが前提。前段不適合はtopology/metadata操作より前に停止する。

合成factoryはrecord source→topology source→held→topology receipt→record receiptの順で所有するHeldEvidenceInputsへ移す。後から任意のsourceへ承認stampだけを追加するのではなく、所有値を封じた領域を作り、次の検証をすべて通した場合だけ返す。

1. 外部BoundTargetの同保持領域とleaf originを照合する。
2. 既存recheckでrecord lineage/binding/target、各祖先origin・snapshot、固定anchorから全path edgeとleafのmetadataを照合する。
3. 同じleaf resourceでMetadataOpsの新しいmetadataを取得する。ACL/xattr/FS、before/after stat、open時snapshotとの完全一致を既存collector/normalizeで検査する。Phase::M0という既存タグを使うが、A/B走査やComparedM0M4/完了証拠を作らない。
4. leaf originを再確認し、同sourceのrecheckをもう一度行い、共有checkpointを通す。取得直後の値だけを返す。

metadata取得時のReadScopeは既存A/B payload枠を一時予約するがpayloadは読まず、終了/失敗で予約を返却する。ACL handleの解放予約、metadata/topology操作上限、10秒・取消・既存work上限を共有し、別budgetへ分離しない。合成sourceはOS安全取得や本番backend承認の証拠ではなく、今回の証拠から現在以後の不変性も推論しない。

### 12.2 一度限りの発行・消費

既存ProtectedBridgeClaimへheld issued/usedのbool2個を追加した。発行/消費の試行はwork前に不可逆claimを消費する。発行済みは専用HeldIdentityのissued_hereにも記録し、budgetのflagだけから別issuerのproofを認めない。証拠段階からのstopも既存claimへlatchする。

HeldSourcesEvidenceの消費には、同issuerのContextRecordsCheckedを値で必須とする。immutable所有領域、前段issuer、leaf origin/open origin、record/topology lineage、record source stamp、topology source stamp、BoundTargetを固定数のidentity照合で確認する。消費時は追加I/O・再parse・可変長binding比較をしない。move前のfieldアドレスを保存せず、containerのmoveを許す。

失敗はSupply(HeldSources)のInputRejectedへ第一理由を保持し、別budgetなら提示側と元claimを停止する。前段tokenを消費し、同じ試行の再発行/再消費は不可。checked段階はPolicyCaps/Slots未確認のままで、ProtectedSupply・Closed・ack・permitへの変換はない。

### 12.3 所有権・費目・未対応

proof/checkedはidentity参照だけで、source/resourceを所有・複製しない。所有領域には非testのconstructor/変更/抽出APIがない。領域をdropすると固定field順でsource/held/receiptが破棄され、proofの生存でresourceを延命しない。拒否票のrelease/checkpointは独立subsetではNotReachedのまま。上位ownerの固定discard観測やOS close確認を捏造しない。

発行1＋消費1＝2 workを独立計数する。取得dispatchは別途1 work。取得recheckの可変長binding/祖先/path照合、metadata/topology単発操作・ACL cleanup・予約等は**別の取得費**である。祖先数Kに対して成功時topology操作数は`2×(3K+2)`で、同じ上限を共有する。これらの動的取得費を2や3で代表させず、全体work/resourceモデルへの統合とcap承認は未対応として残す。

新規Rc allocationはHeldIdentityとtopology source stampの各1個。既存のissuer/source/lineage/origin参照はRc cloneであり、FDの複製ではない。HeldSourcesEvidenceは64 bytes以下、既存claimは64 bytes以下を合成型契約で検査した。所有source/ancestor/receipt量や一時metadata/temporary/cleanup費を無料と扱わない。

既存Context/Recordsの4 work、run_creationの17差分、通常strictの3round/3decode・6record検証、停止gateは未変更。準備Envelope・通常strictへの接続、本番opener/issuer、PolicyCaps/ScanSlots、上位診断の接続、全体受付は未対応である。[HeldSources合成検証記録](E2E_BEST_PRACTICE_R2_OL03_HELD_SOURCES_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

## 13. ScanSlotsの独立合成fragment

[slots.rs](../native/r2-outer/src/signature_boundary/positioned_read/metadata/transfer/topology/records/strict/scan_ops/connection_owner/protected_inputs/supply_evidence/slots.rs)にScanSlotsEvidence、ScanSlotInputs、ScanSlotsCheckedを追加した。**PolicyCaps→Slotsという全体の検査順は変えない**。今回はslot条件だけの独立評価片であり、ScanSlotsCheckedはPolicyCaps確認済み段階でもValidatedSupplyPartsでもない。ProtectedSupply/準備入口/通常strictへ変換するAPIはなく、欠落policyを合成の成功値で補わない。

### 13.1 発行前提と同一性

合成prepareはHeldEvidenceInputsと同issuerのHeldSourcesCheckedを値で受け取り、held moduleの型付きSlotBindingを得る。同budget/origin/session/started、未session開始・未generated/used、前段の発行/消費、immutable held owner/leaf origin/record・topology lineage/source stamp/BoundTargetを検査する。SlotBindingのfield/発行はheld moduleだけに閉じる。root/path文字列やコピーした番号の自己申告では結ばない。

固定の合成factoryだけがInitial／BeforeM4／AfterM4の3sourceを作り、取得候補を検証してからScanSlotInputsを返す。外部から任意のScanOps、factory、model、開始済みsourceを渡すconstructorは設けない。sourceのmodelは試験専用`bp5-r2-evidence-synthetic-scan-0.1`で、本番collector/backendの承認を意味しない。

各sourceは独自のidentityと開始状態を所有する。開始状態の検査traitはsealedで、実装はcfg(test)の合成backendだけ。本番実装・本番constructorはない。合成backendの実ScanOpsメソッド（open/ACL init/enum/read/metadata/cleanup）は失敗も含めて必ず開始を記録する。後からraw sourceをwrapperへ入れて「未開始」とする口や、test以外の状態resetはない。合成backendは成功handle/scan/cleanup証拠を作らない。

取得・発行・消費時に、3slotが存在すること、固定round順、各sourceと取得時canonical identityの一致・相互の非alias、対応する固定model、source自身の未開始状態を照合する。slot入替え・roundだけの改変・別source・重複identityはBinding、欠落/未知modelはUnavailable。開始済みで失敗したsourceもBindingで拒否する。

### 13.2 一度限りの発行・消費と停止

同SharedBudgetのbridge claimへslots issued/usedを各1個追加した。発行/消費はworkより前にclaimを不可逆消費し、専用issuerのissued_hereも要求する。proofのdrop、失敗、値のmoveで再発行/再消費を回復しない。別budgetの場合は提示側と元claimを停止する。

proofの同issuer/owner照合後、held bindingと固定3slot条件を再確認してScanSlotsCheckedへ進む。追加I/O・scan実行・再parseはなく、mutable sourceの取り出し口もない。返す型とopaque Debugは`independent_fragment_policy_unverified`である。未来の統合ではPolicyCapsCheckedを要求する段階契約が必要であり、現fragmentをその代替にしない。

失敗はSupply(Slots)のInputRejectedに第一理由・検知位置を保持し、期限/取消/先行理由をBindingへ置換しない。独立fragmentのrelease/checkpoint観測はNotReached。所有field順は3slot→HeldEvidenceInputsの既存source/held/receipt順で、proof/checkedはidentityだけを保持し、backendやheld resourceを延命しない。型は非Clone/非Copy/非serde、Debugは固定opaqueである。

### 13.3 費目と残課題

合成prepareは1 work、取得検証・発行・消費はそれぞれ入口1＋slot guard3＝4 work、計13。各phaseで残work0〜4と課金直後の取消を検査した。既存Context/Records4・HeldSources2・run_creation17へ単純加算した全体上界ではなく、全体の費目統合とcap承認は未対応である。

合成source identityのRc allocation3、slot issuer identity1、test用計数observer1を作る。SlotBindingは既存identity/origin/source/lineageのRc cloneと外部BoundTarget借用を保持する。source値・配列・部分所有・解放/observer保持量を無料にしない。ScanSlotsEvidenceは32 bytes以下、bridge claimは64 bytes以下を合成型契約で確認する。

通常strictの固定3位置/owner/collector、3roundの資源会計、3decode・6record検証、既存停止gateは変更していない。本番backendの供給証拠、PolicyCaps/必要profileの供給順序、全体work/resource上界、準備Envelope・上位診断への接続は未対応。[ScanSlots合成検証記録](E2E_BEST_PRACTICE_R2_OL03_SCAN_SLOTS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

## 14. PolicyCaps詳細設計とPC-01合成subset

[PolicyCapsEvidence詳細設計draft-0.4](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)では、ApprovedCaps、限定BootstrapScope、保護されたResourceRequirementWitness、PolicyCapsEvidence/CheckedとResourceInput/Quotas配賦partsを分けた。必要量がcap以内という算術結果だけで承認せず、同registry/build/model bundle・期限・receipt/held/source/初回profileへの結合を要求する。

profileは現行RoundScope内の借用型で、値移動するproducerへ持ち出せない。初回の既存decode/estimateを同scope内でpolicy確認→Initial kernelへ引き継ぐ案と、安定した外側receipt所有者/固定callerへの内部API移行を承認待ちとして明記した。4回目のdecode・profile claim reset・自己参照/unsafe・scan実測後のcap承認は採らない。

同設計のP0〜P6は将来の順序案であって現行経路ではない。cap/BootstrapCapsの有限数値、全dimension、動的費/保持量、全体work/resource受付が確定しない場合は停止する。PolicyCaps→Slots順、独立ScanSlots片の未承認状態、既存17差分・3decode/6record検証・全体受付無効を維持する。

PC-01はcfg(test)の固定合成issuerだけでApprovedCaps/模擬Witness/PolicyCapsEvidenceを発行し、同HeldSourcesChecked・budgetへの結合、承認/モデル/期限・40独立項目、不可逆issued/used、Slots先行拒否を確認する。prepare1＋issue44＋consume44の89 workは独立subsetの実計数であり、全体上界ではない。checkedから配賦/Slots/準備Envelopeへ進むAPIはない。実profile projection・本番cap registry・実clock・parts配賦・P0〜P6は未対応。[PolicyCaps合成検証記録](E2E_BEST_PRACTICE_R2_OL03_POLICY_CAPS_EVIDENCE_SYNTHETIC_2026-10-23.md)を参照。

## 15. PolicyCaps→Slotsの型による順序固定（レビュー後修正）

§13のScanSlots片と§14のPolicyCaps片は、どちらも`bind_slots`で`HeldSourcesChecked`を消費していた。held消費はbudgetごとに一度のため両者は排他で、Policy→Slotsへつなげなかった。修正後、Slotsの準備入口は`HeldSourcesChecked`ではなく消費済みの`PolicyCapsChecked`を値で受け取り、`ScanSlotInputs`は`PolicyInputs`（held入力を含む）を所有する。Slots側に`HeldSourcesChecked`を受ける口はなく、Context→Records→HeldSources→PolicyCaps→Slotsだけが型で成立する。Policy側の「Slots先行ならBinding」も維持する。

Slotsの準備・取得・発行・消費は、`PolicyInputs::require_checked`で同じPolicyIdentity（ptr一致）・発行済み・`policy_evidence_used`・held binding再照合を確認する。capの40次元比較は再実行しない（消費済み段階のidentity照合のみ）。新規workはなく、Slotsの費目（準備1＋取得4＋発行4＋消費4）は不変。`ScanSlotsChecked`のDebugは`after_policy_caps_not_supply_or_permit`へ変更した。PolicyAllocationParts/ResourceInput/Quotas発行、準備Envelope・通常strictへの接続、全体受付は引き続き未対応である。

## 16. PC-02：保護された同estimate必要量projection

[詳細設計§12](BEST_PRACTICE_BP5_R2_OL03_POLICY_CAPS_EVIDENCE_DESIGN.md)のScanResourceRequirementsは同ScanWorkEstimateを借用し、その内側の実profileから既存resource-0.2の数量を導出する。Initial/同receipt・round・budget/未session・Fresh/retry snapshotを検査し、projectionと比較のclaimを不可逆消費する。既存decode/profileを追加しない。別budgetでの失敗は元claimにも保持する。

合成capとの35項目比較はscan subsetだけの部分結果で、未導出の外側/管理量/bootstrap5項目の全体確認を求めるとUnavailable。PC-01の模擬Witnessを置換せず、§15のPolicyCaps→Slots順序も変更しない。ResourceInput/Quotas・準備Envelope・通常strictへ昇格する口はない。費目はprojection18＋比較45 workで全体上界には未接続。[PC-02検証記録](E2E_BEST_PRACTICE_R2_OL03_PC02_PROJECTION_SYNTHETIC_2026-10-23.md)を参照。

## 17. PC-03 parts配賦・証拠消費の詳細設計

[PC-03詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_PC03_PARTS_ALLOCATION_DESIGN.md)はMDのみ。非実行のScanPartsDraftと、実cap/完全性証拠を前提にする完成PolicyAllocationPartsを別型とし、未導出5項目やPC-02の部分結果を完成証拠へ読み替えない。budget側の不可逆claim、同receipt/issuer/model/budget/started、固定3論理slotと後の実source結合、未移譲partsとPolicyCaps証拠の同一性を要求する。

PolicyCaps→Slots順序を保ち、parts/proofの交換・二重発行・異なるslot/sourceへの移譲で停止する。現状は完成parts発行不能で、最初の合成実装案もview/非実行DraftとUnknownでのfinalize拒否までに限定する。固定discard・上位診断保持・configure後の別guard・PC-04借用前提・費目所有を明記し、実ResourceInput/Quotas/通常strictへは接続しない。
