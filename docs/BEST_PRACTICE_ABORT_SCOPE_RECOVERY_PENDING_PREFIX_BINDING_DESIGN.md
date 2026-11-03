# PD-B：同pendingのPD-A入力化・比較・関係値の接続差分

Version: br006-recovery-pending-prefix-binding-draft-0.3 / Date: 2026-11-03。
設計基準HEAD: `802b5c3`／(A)実装基準HEAD: `2043665`／(B)実装基準HEAD: `af6fdaa`。Status: **(A)値専用境界と(B)同pending／header consumer・開始claim・暫定候補を合成実装。(C)のpost受理／関係値発行・消費は未着手。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。**

[prefix／delta契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_PREFIX_DELTA_DESIGN.md)§8〜11と[private header供給](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_ACCEPTED_HEADER_SUPPLY_DESIGN.md)§8の差分。本稿は同pendingの供給元・比較範囲・一度限りの内部関係値を具体化する。(A/B)の合成実装は§8〜9に限定し、実接続・実通信・設定変更・Pushは行わない。post受理済み関係値や移譲先sealを実装済みとはせず、NB-03の固定abortを維持する。

## 1 現行との差分

[合成kernel](../tests/support/review/synthetic-recovery-kernel.ts)は同takeからprivate receiptを発行し、固定consumerが実accepted headerを一度だけ`pendingHeader`へ渡す。(B)で同pendingから固定DATA viewを作り、(A)を経由して[PD-A](../tests/support/review/synthetic-prefix-delta.ts)を呼ぶ。transfer post-guard後も固定abortする。

追加するのは、既存transfer保護scope内の固定入力化・PD-A呼出し・private比較と、post-guard後の内部関係値受理／固定消費である。公開snapshot／rootの引数にprefix・verify・header・関係値を追加しない。新factory／登録台帳／caller callback／summaryからの再構成を導入しない。

## 2 供給元と入力化

`p`は同ownerが保持する`pendingTransfer`だけを指す。take前previewや別rootから渡された構造一致値を代用しない。

| 入力／保持物 | 固定供給元 | 対応と禁止事項 |
| --- | --- | --- |
| P0 | `p.content.owned.model.initial_prefix` | 元親prefix。PD-Aのparent_prefixに直接使わない |
| Pp | `p.content.owned.model.prefix` | 親処理後の原順序prefix。PD-Aのparent_prefixへ供給。sort済みpinsから復元しない |
| trace／original_rows | 同`model`の参照 | 同生成owner・固定選択順の対応を保持。callerのtraceや別モデルを登録しない |
| pins base B | `p.content.pins.seed.header` | Ppのlimitationsを既存規則でsortしたbaseとの比較対象。P0をbaseと誤認しない |
| version／collection | 同pins headerの`schema_version`／`collection.status` | modelの版・実accepted headerの版／collectionとも一致を要求 |
| verify V | `p.taken.value.plan.verify` | 同planの保持値から下記6項目だけを固定抽出。再verify・再観測しない |
| 実accepted header H | 同takeの`consumeHeader`が渡した`pendingHeader` | receipt消費後の同readonly参照。seed／issued投影／summaryを代用しない |
| owner／receipt／window／budget | pのtoken・binding・taken・既存budget | 既存identity検査を維持。ID文字列や値一致で代用しない |

PD-Aには既存の厳密な6 top-level fieldだけを作る：`kind`、固定`model_id`、`schema_version`、`collection_status`、`parent_prefix`、`verify`。kind／modelは固定定数とし、verifyは`stage／verify_required／consistency／verify_error／limitations／errors`だけを渡す。plan.verifyのaccounting／attempts等をspreadしてstrict schemaへ混入させない。時刻や費用は同plan／budgetの既存検査で保持し、この値計算から更新しない。

入力化は同model・同planのreadonly値を固定recordに参照するだけとし、その後のbounded copy・厳密検査は既存PD-Aが行う。PD-Aへ渡すcopyの成功をprovenanceの根拠にしない。`checkOwnedSupply`と既存completed／pins／row／input対応の検査を維持し、同model参照を関係値へ結ぶ。今回新たにOM-Aを再実行して「同生成物」を作り直さない。親traceの独立した正しさの検証は既存model試験と接続oracleで区別する。

## 3 比較範囲

PD-A出力をQとする。比較用の配列を追加sort／dedup／切詰めして通さず、既存出力の各laneを区別する。

| 関係 | 必須の比較 |
| --- | --- |
| Pp→Q | Q.parent_prefixは同Ppをbounded copyした値として配列全体・順序・重複を検査。eligibilityの拒否を救済しない |
| Q.base_prefix→B | limitationsはsort済みbaseとの順序一致、errorsは元順序・重複込みの一致 |
| Q.plan_pre_prefix | sort済みbaseに固定deltaを適用した途中lane。原順序側やHの代用品にしない |
| Q.ordered_prefix→Q.canonical_prefix | 原順序laneを別に保持し、既存PD-Aのcanonical関係を利用。原順序をcanonicalで上書きしない |
| Q.canonical_prefix→H | H.limitations／H.errorsと完全一致。limitationsはUTF-16順、errorsは先頭100件の原順序・重複を保持 |
| 版・collection | Q・B・Hのschema version／collection statusとmodelの版を照合。別版をcanonical化で救済しない |

errorsの比較は各要素の`stage／code／update_xml_sys_id`の有無と値を検査する。配列順序を無視した集合比較やJSON objectのproperty列挙順には依存しない。candidate_filter_violation等の版・stage・sys_id制約はPD-Aの既存strict検査を通す。warningsの100／103・長さ200／201、errors枠と切詰め警告は既存契約のままである。

関係値が示すのは、同合成ownerが保持するP0／Pp／trace・同pins base・同planの固定delta・同accepted headerのprefix関係だけ。target／versions／principal／release／開始UTC／coverage／limits／selection等のfull header全項目を再比較した保証ではない。既存accept投影の検査を維持し、prefix一致でそれらを置換しない。body内容比較・finish job・実worker由来・移譲先seal authorityも示さない。

## 4 一度限りの関係値と所有者

名称案`PendingPrefixCheck`はwork中だけの暫定候補、`OrderedPrefixRelation`はpost-guard後の非export関係値とする。両者を同constructor内の固定継続だけが作り、callerが入力値や成功boolから発行できる入口を設けない。

関係値は同pending object・construction token・pins・taken object／marker／projectionReceipt・plan／handoff／origin／source／cleanup／window・budget identityとserial・rootの失効serialへ結ぶ。P0／Pp／trace・H・Qの必要lane／統計への参照も同ownerの保持slotに束ねる。Hの発行元は既存consumeHeaderで検査済みのprivate receiptに依拠し、すでに消費したprojection slotを再読して架空のidentity証明を追加しない。

claimは関係値の中のboolだけに置かず、同pendingを所有するroot側に利用状態を置く。同rootの再入・重複開始でclaimを取り直せず、値のcopy／別pendingへの移動では利用可能にならない。

| 責務 | 消費点／再利用禁止 |
| --- | --- |
| 既存take claim | 元acceptedをpendingへ移す前。今回再armしない |
| 既存header consume claim | work内で実headerを取得する時。比較のため再consumeしない |
| 関係計算開始claim | 初回transferのpre-guardへ入る前に同rootで消費。pre停止・shape不適合でも再armしない |
| 関係値利用claim | post受理後の固定内部consumerで消費。成功／失敗とも同関係値を外部へ返さない |

最初の実装では、受理済み関係値を同scope内の固定consumerが一度だけ検査・消費・破棄し、従来の固定abortへ進む。seal成功・正常移譲先への返却口を作らない。将来sealへ接続する場合は別設計・検証が必要である。

## 5 固定順序・停止と破棄

1. 既存transfer開始claimと関係計算開始claimを消費し、同takeでpendingを形成する。部分形成失敗は暫定失敗として保持する。
2. 既存transfer pre-guardを実施する。ここで停止したらPD-Aを呼ばず、headerも未消費のまま固定失敗経路で破棄する。
3. workで既存identity／owned検査を行い、headerを既存consumerから一度取得する。同pendingの入力を作り、PD-Aを1回呼び、§3を検査して暫定候補を保持する。callback・await・I/O・時計採取を挟まない。
4. workのshape／limit／値不一致を暫定理由として保持し、既存transfer post-guardを必ず実施する。取消・期限・先行hard・再入を上書きしない。
5. post通過後、同pending／taken・budget／失効serial・live routeを再確認する。work不適合があれば固定binding拒否へ進み、候補を受理しない。成功した場合だけ同ownerの関係値slotへ受理する。
6. caller hookなしの固定consumerで関係値のidentityと利用claimを検査・消費し、保持物を破棄する。その後もNB-03の固定state abortを維持する。

公開失敗理由は既存`cancelled／deadline_exceeded／internal_review_error`の境界を増やさない。rootのfirst_failureでは既存のbinding／state等を使い、PD-Aのraw例外・prefix／errors本文・行IDを上位診断へ出さない。暫定値不一致がpost停止より先に上位hard slotをclaimしないようにする。

同rootのclear対象へ暫定候補・受理関係値・入力record・H／Qと一時copyを追加する。`payloadPending／isCleared`は新保持slotを含み、busyなscopeや参照が残る状態では本文破棄証拠を作らない。失効時は関係値の参照をclearしclaimはspentのまま保持する。NB-03の上位custodyへ移すのは既存cleanup責務・固定診断だけであり、関係値やheaderを入れない。参照clearを物理消去やcleanup確認と同一視しない。

## 6 費目と未確認範囲

| 費目 | 所有者と追加範囲 |
| --- | --- |
| 入力record・identity／serial検査・claim | 同normal root。take／header consumerの既存費用との重複を分離 |
| PD-Aのcopy／eligibility／merge／sort／出力 | 同transfer work。既存usageは入力snapshotだけであり全work・heapではない |
| base／header配列比較と暫定候補 | 同work。最悪件数で全要素比較し、early-exit成功だけで上界を見積もらない |
| post再確認・関係値消費・clear | 同保護scope。二重回収を作らず、custodyの費用と区別 |

全work・copyピーク・中断粒度・3round配賦・予約額は未導出／Unknown。局所capの有限性だけで全体予算達成を主張しない。既存単一予算の枠を緩和・再計算・無断流用せず、全体受付と本番capは有効化しない。

## 7 合成受入条件と実装順

独立oracleはPD-A／OM-A／plan投影を呼んで期待値を作らず、親順序と固定deltaの手書き表・別表現の逐次処理で全配列を比較する。実creatorが生成できる経路と、pure-only境界を分離し、後者をroot受付拡張の根拠にしない。

- 同pendingのPpとsort済みB、固定delta、Hが一致する経路を確認。P0の誤供給、seed headerの誤採用、同集合のerrors順序交換、原順序laneのcanonical上書きを負の対照にする。
- 100／103、重複・長さ、errors99／100、dropとX既出／未出現、版・collection制約を維持する。full header変更は本関係値の保証外として既存投影試験と分ける。
- 別pins／pending／plan／taken／receipt、copy／summary、二重開始／消費、失効serial違いを拒否する。private試験口を作る場合もruntime rootやfixture台帳へ接続しない。
- pre停止ではPD-A呼出し0、work不一致＋post取消／期限ではpost理由優先、再入を握り潰しても失敗する。全失敗位置で新保持slotがclearされ、同custodyへ移譲できる。
- assertionはguardの外で行う。新header供給試験の初回見逃しを再現しないよう、誤供給の負の対照で実際の失敗を確認する。
- package漏出監査のimport許可をPD-Aの固定依存だけに更新し、新private markerの負の対照を追加する。新経路のcompiled保証と製品src buildは別に確認する。

推奨分割は、(A) 固定入力化・配列比較の内部境界と合成oracle、(B) 同pending／header consumerへ接続してclaim・pre/post・暫定候補を検証、(C) 関係値のpost受理・一度限り消費・全破棄とcompiled／梱包監査である。各段階で固定abortを維持する。(A)の実装・試験範囲は以下に限定する。

## 8 (A)の値専用実装・非保証範囲

[synthetic-pending-prefix-values](../tests/support/review/synthetic-pending-prefix-values.ts)の`projectSyntheticPendingPrefixValues`は、厳密な外側DATA契約`kind／model／pins_header／plan_verify／accepted_header`を受ける。modelは`schema_version／prefix`だけの値viewであり、実OMモデル・trace・ownerを受け取る入口ではない。(B)の固定callerが同pendingからこのviewを作る。値helper自体にowner／receiptを登録しない。

headersはschema_version／collection.status／limitations／errors、verifyは§2の6項目だけをown DATA descriptorから読む。対象外のprincipal／accounting等は、getterを含んでも実行せず無視する。これらの正しさ・full header適合を確認した保証ではない。選択対象のproxy／accessor、外側やmodel viewの未知fieldは拒否する。

選択値全体を共有snapshot枠でcopyする：nodes 8,000、文字課金1,950,000（入力string長×3、keyを含む）、depth 6、record keys 8、array 103。これは3つのprefixを含む値専用受付の有限枠であり、PD-Aの既存nodes 2,500／文字650,000／eligibility上限は別途維持する。比較対象headerが104以上ならPD-A前にinput拒否する。全合法DATAの直積を必ず受理する保証や全work／heap上界ではない。

PD-Aを1回呼び、modelの版・base prefix・accepted側の版／collection・canonical prefixを比較する。配列のsort／dedup救済はしない。比較結果は`authority:none／checked_scope:prefix_values_only`とPD-Aのfreeze済み値・snapshot使用量だけを返し、入力aliasを保持しない。shape／limit／binding／unsupportedとinput／delta／base／acceptedの固定理由を返し、PD-A失敗時は元のphaseも`delta_phase`に保持する。raw例外・cause・入力値は返さない。

値helper単独では同pending・receipt／pins origin・元trace・実accepted provenance・one-shot関係値・guard・失効・全体予算は未検証であり、再呼出し可能な値計算をone-shotの証拠に昇格させない。[検証記録](E2E_BEST_PRACTICE_PENDING_PREFIX_VALUES_2026-11-03.md)に(A)時点の独立oracle・初回失敗・負の対照と未接続状態を記録する。(B)では次節の固定kernel importだけを追加し、packageの固定依存監査と配布除外を維持する。

## 9 (B)の同pending接続・暫定候補

normal rootに`prefixStarted`を置き、transfer開始と同時に一度だけ消費する。pre停止でも再armせず、PD-Aへの入力化はwork内の既存同identity／owned検査・header消費の後に限る。同`p.content.owned.model.prefix`／model版・pins header・taken plan.verify・pendingHeaderを固定callerから(A)へ渡す。

成功時だけprivate `PendingPrefixCheck`へ同token／pending object／model／header／budget identity・serial／失効serialと値計算結果を束ねる。workでの値helper失敗は固定reason／phaseだけを保持して暫定不一致とし、post guardの取消・期限・先行hardを優先する。post通過後は既存checkTakenと候補identity／budget／serialを再確認するが、候補をpost受理済み関係値へ昇格しない。`post_checks`は再確認回数だけでありauthorityではない。

候補はrootのclearとisClearedに含め、固定abort／停止でheader等とともに破棄してから既存上位custodyへ進む。inspectは開始・呼出し・候補数・再確認数・保持boolと固定拒否分類だけ。関係値数は0のまま。全work費用や3round配賦は依然Unknownで、実会計の枠・期限は変更しない。

[接続検証記録](E2E_BEST_PRACTICE_PENDING_PREFIX_TRANSFER_2026-11-03.md)に正常・guard停止・値不一致とpost停止の競合・再入・失効・混入・親省略を確認した結果を記録する。試験の値helper spyはVitest内だけに置き、runtime rootに依存差替え口やfriendを追加しない。(C)の関係値post受理・一度限り消費・compiled保証は未実装。
