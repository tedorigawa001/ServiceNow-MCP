# WF-B (C)：移譲開始後の停止・所有境界とdetach後照合の差分設計

Version: draft-0.1 / Date: 2026-11-09 / 読み取り照合基準HEAD: `ece8724`。

Status: **設計のみ。** 親は[下位移譲claim・pending／holder設計draft-0.4](BEST_PRACTICE_WFB_SUPPLY_TRANSFER_DESIGN.md)と[同snapshotの所有・停止契約](BEST_PRACTICE_WFB_SNAPSHOT_READ_LIFECYCLE_DESIGN.md)。[preflight検証記録とレビュー修正](E2E_BEST_PRACTICE_WFB_SUPPLY_TRANSFER_PREFLIGHT_2026-11-09.md)を前提とするが、その成功をclaim消費・移動済み証拠へ転用しない。

正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。本書で実装・holder公開・C実行・実期待値pin・実source照合・S発行・core／実接続・実通信・設定変更・Pushは行わない。以下の型・継続・状態・理由は実装予定のprivate契約であり、新たな実行権限ではない。

## 1 現行との差分

現行preflightは同source ownerのanchor、別brandの未消費claim、空のpending／holder／failure shellを生成・照合する。claimはstate=`unused`だけを表し、shellのpayload型も`undefined`だけである。正常準備後も元ownerのregistry／table／viewを保持し、消費・detach・公開は0。

現行`supplyTransferAccess.matches()`はanchorと元ownerのcurrent／issued参照、現在のprepared contextを同時に検査する。元normal fieldを空にした後は一致せず、close後のcontext不在もidentity不一致に見える。また、元ownerのfail／closeは保持fieldをclearし、finishはborrowを退役させる。preflightの拒否・close・finishもこの前提で作られており、taking後へ直接流用できない。

差分は、(a) 通常利用権と参照保持の分離、(b) 同期停止だけを行うprivate継続、(c) 発行anchorと明示的payloadだけの関係検査、(d) pending優先の責務記録とnormal slot専用detach、(e) 未公開失敗時の固定回収／保持・finish gateである。旧factoryのfacade・理由・終端結果を暗黙に変更しない。

## 2 private所有slotの再区分

| 対象案 | 保持物・権利 | taking後の扱い |
|---|---|---|
| SourceNormalSlot | 同registry／table／view／declarationsを束ねるPreparedSupplyPayloadへの通常利用slot、容量1 | gateを先に閉じ、pending記録後にこのslotだけdetach |
| SupplyIssuanceAnchor | 元owner・construction・prepared／borrow・正規registry・table origin・発行table／view／declarations | 検査根拠として保持。通常利用権はなく、最終退役対象 |
| TransferControl | 同source／transfer owner・claim origin・受領先shellを結ぶ一度限りの権利台帳 | 全gateが同じ台帳を参照。消費済みからunusedへ戻さない |
| TransferPending | 同shellのprivate active payload slot、容量1 | 同payloadを保持して未公開の照合・回収を所有。再移譲不可 |
| TransferFailureCustody | 同failure shellのprivate責務slot、容量1 | 元slot／pending／発行aliasの未退役箇所と段階を保持。通常利用不可 |
| Diagnostic／Result slot | 先行理由・停止・消費bit・phase・保持箇所・退役確認 | 参照を除いた有限診断。結果投影の成否で責務を失わない |

PreparedSupplyPayloadは既存参照のwrapperであり、registry／table／view／file／bytesを作り直さない。wrapper・taking用control・固定失敗保持先・診断／結果slotは消費前に用意する。既存のfrozen shell自体を書き換えず、同owner内のprivate payload slotで容量1を管理する。外部から任意payload／claimを渡すadopt口やfriend登録口は作らない。

現行のregistry／table／view等の分散fieldを、そのまま「通常利用slot」「発行証拠」の両方として扱わない。実装時にはnormal利用を単一private slotへ集約し、既存current aliasは同slotの一部として明示的に退役、issued参照／table origin／envelopeは検査専用の発行根拠へ分類する。互換用aliasを残す場合も固定保持表に含め、通常利用gateを迂回できないことを試験する。旧factoryのclear結果・計数・export維持は別の回帰条件とする。

detachはnormal slotの単一置換を基準とし、発行根拠・borrow／Snapshot・pendingを消す汎用clearではない。source側に残る検査専用alias、anchor経由のbytes参照も保持中として報告する。通常slotが空であることをpayload完全退役・物理解放と呼ばない。

## 3 消費状態・停止gate・線形化点

immutableなclaimのstateを書き換える方法、同値claimの再発行、二つの独立booleanによる「消費済み／source利用可」の管理は採用しない。同claim originに結合した先行private TransferControlを唯一の権利台帳とする。

権利状態案はunused → taking → discarding → retired、回収未確認時はretained_unconfirmed。`phase`はprechecked／pending_recorded／detached／post_checked等の進行診断として別管理し、phaseだけで通常利用を許可しない。holder公開状態は本段階では存在しない。

**claim消費の線形化点は、同controlのunused→takingの単一同期置換。** 元sourceの通常利用gateも同controlを読み、taking以降は元slotに参照が残っていても利用を拒否する。消費計数0／1はこの不可逆な状態に対応させ、先行した加算だけ・gate閉鎖だけの中間状態を作らない。状態更新に必要なobjectは消費前に用意する。

最後の受付順は、終端→先行診断→正規停止→同owner／claim／shell／anchorの同一性→claim未消費・元normal slot一つ・pending空・回収先確保→takingとする。複数原因があれば先行診断を保持し、現在の正規停止をcontext不在由来のbindingへ丸めない。二重take／同期再入は追加消費せず固定理由で停止する。

消費前後の固定処理内にawait・任意callback・Proxy hook・source操作・clock採取・再decode・再hashを挟まない。故障試験は固定内部scriptで境界に配置する。JS参照代入内部の非現実的なtorn writeを模擬せず、代入前／後の観測可能なprefixを対象とする。OS信号や実スレッドの保証には拡張しない。

## 4 taking後の停止・終了の専用継続

| 操作 | 消費前 | taking／discarding／retained_unconfirmed |
|---|---|---|
| 正規close | 既存preflight／元ownerのclose契約 | 同rootへ同期close latchと既存readStopだけを伝える。元CanonicalSupplyAssembly.closeは呼ばず、payload参照を消さない |
| binding／生成失敗 | 既存fail＋clearを利用可 | 先行transfer理由を記録し、同rootへの既存lifecycle理由写像だけを依頼。元CanonicalSupplyAssembly.failは呼ばない |
| 通常利用／再prepare／再take | 先行拒否／停止・claimを検査 | 拒否。元slotへの巻戻し・claim返却・代替source生成なし |
| finish | 準備参照clear後に既存finish | 固定回収または未確認保持を先に判定。参照が未退役なら元finishを呼ばない |

継続は同compositionのlexical境界だけに置き、診断facade／公開summaryから元rootを再取得しない。現在の`canonicalSupplyAccess.context()`は通常利用向けであり、停止後の回収の前提にはしない。別のreadonly停止参照は同rootのclose latch・先行理由・終端／borrow状態を読むだけとし、session／budget／creditや新Snapshotを発行しない。

close直後に通常利用を禁止することと、保持参照を捨てることを分ける。親readStopは既存の開始claim発行後だけ記録する規則を維持する。transferFirst／transferStop、親supplyFirst／lifecycleFirst／readFirst／readStop、discard診断は別軸とし、後着closeやcleanup異常で先行原因を上書きしない。

## 5 detach後の照合契約

検査を次の三つへ分ける。候補payloadからanchorや期待値を再構成しない。

1. **発行・経路identity**：先行private slotにpinしたanchorそのもの、同source／transfer owner・claim origin・pending／failure／受領shellとの結合を確認する。anchorは通常利用停止後も同一性の根拠として残る。
2. **payload関係検査**：明示的なanchorと同payloadを比較し、元normal fieldを読まない。close後でも関係検査だけは可能であるが、これだけでは通常処理を再開できない。
3. **現在停止・権利検査**：同controlのtaking、期待phase、同期停止・先行失敗・終端・borrow失効の有無を確認する。postで成功扱いするには1〜3すべてが必要。回収は停止中でも1・2と保持責務に基づいて行う。

payload関係検査の必須項目：

- constructionのowner／Snapshot／setId／map／files／rows／先頭file／ordinal／session／budget origin／prepared／発行borrowは、元issuerが消費前にpinした同参照・値。
- payloadのregistry／table／view／declarationsはanchorの発行済み参照そのもの。table.envelope／view.envelope／view.table／table originとdeclarationsの結合も固定する。
- file数は元filesと同数・最大32、rowsは既存12。原順序でregistry[i].fileとfiles[i]、ordinal、source origin／record、bindingとdeclarationの同参照関係を全件確認する。
- file／sourceのcopy、別root・同setId、ID／digest一致だけ、sort／dedup、旧summaryやlegacy補正値で代替しない。値coreを再実行して別mapを作らない。既存SourceRecordの構造上限は維持するがactual長=宣言長を新条件にしない。

prepared・borrowの同参照が残ることと、それらが現在有効であることを分ける。`Borrow.matches()`や現在contextの成功をidentityの唯一の根拠にしない。停止後・借用失効後もpinされた発行根拠から回収対象を同定できる一方、失効後のpost受理は現在停止・権利検査で拒否する。

detach前preは元normal slotとanchor／payloadの一致および通常利用権一つを確認する。detach後postはpendingが同payloadを保持し元normal slotが空、claim消費1、holder公開0であることを追加確認する。元slotが空になったためだけにidentity不一致へ落とさない。逆に正しいanchorがあることだけで未detachや別pendingを受理しない。

## 6 固定scheduleと各失敗位置

| 境界 | 消費 | 通常権・保持先 | 故障／close時の責務 |
|---|---|---|---|
| F0 先行slot／payload wrapper／control準備、最終pre前 | 0 | 元normal slotが保持 | 元ownerの既存固定discard。未生成failure slotへの移譲を装わない |
| F1 最終pre通過、taking置換直前 | 0 | 元normal slot。pending空 | 固定拒否し元経路で破棄。再prepare不可 |
| F2 taking直後、pending記録前 | 1 | 元normal slotは参照保持のみ、通常権なし | 同failure custodyが元slotとanchorの責務を捕捉。元参照を先にclearしない |
| F3 pending記録直前／記録後 | 1 | 記録前は元slot、記録後はpendingが主責務、元aliasも残る | 記録済みbitと実slotを照合し同一payloadを一責務として追跡。再記録・別payload挿入なし |
| F4 元normal slot detach直前 | 1 | pendingが保持、元slotは利用禁止alias | pending保持確認なしにdetachしない。故障時は両保持箇所を固定回収表へ |
| F5 detach直後、post前 | 1 | pending＋anchor／発行根拠。元normal slotは空 | 元ownerへ戻さず未公開のまま固定回収。sourceDetach=1を巻き戻さない |
| F6 post中／post成功後 | 1 | pendingが保持、holderは空 | 拒否・停止なら回収。成功でもpending内の非実行準備結果に留め、holder公開／次段受理を行わない |
| F7 固定回収／保持確認・結果固定中 | 既存値 | 同failure custodyまたは固定保持元 | 未確認参照があれば保持してborrow／Snapshot退役を保留。不変診断で終端し、追加回収試行や成功化をしない |

順序は **taking → pending.payloadへ同PreparedSupplyPayload参照を1回記録 → 元normal slotの空置換 → post**。pending記録前に元slotを消すこと、post成功前のholder公開、claim消費後のsource通常利用再開は不可。pending記録・sourceDetach計数は各成功代入に対応し、試行数や元discardPassesと混ぜない。

このscheduleで部分detachを必要としない単一normal slot設計を優先する。互換aliasの残留・途中退役はF4／F5の保持表で扱い、消したaliasを復元しない。allocationや結果投影のthrowも責務移譲完了を意味しない。source／pending／failureの実保持確認が済むまで元finish・borrow退役へ進めない。

## 7 未公開失敗の回収と診断

消費後の全prefixを受ける固定回収・失敗保持・finish gateは、claim消費を有効にする前提である。親設計の「第3段階のdiscard」を理由に、第2段階の失敗後始末を未実装のままtakeを動かさない。holder公開後の正常discardは後段に残すが、未公開pending／元aliasの回収を先に用意する。

回収開始は一度限りの専用状態で管理し、同failure custodyへ既存責務を保持→固定参照clear→空確認→anchor／発行根拠退役→元root結果固定とborrow退役→必要時Snapshot退役の順とする。pendingが空でも元alias・issued alias・anchorが残れば完全退役ではない。結果slotは先行確保し、生成失敗を追加の任意objectへ保存し直さない。

回収・保持確認が不明ならretained_unconfirmedとし、元参照・pending・anchorのうち未退役箇所を同ownerが保持する。空への補完・failure slotへ移譲したという未確認申告・元finishによる退役済み化は禁止。close／finishの反復でも再試行しない。外側の後日回収、GC、物理ゼロ化、OOM時の診断必着はUnknown／未対応である。

診断は固定reason・phase・claim消費0／1・pending記録0／1・sourceDetach0／1・holder公開0・回収試行0／1・保持箇所の有限bit・退役確認を分離する。正規closeはtransferStop=supply_closed、既存firstを保持する。混入はbinding_mismatch、二重takeはduplicate_transfer、準備失敗は既存transfer_prepare_unavailable系を新入口内だけで確定する。本文・digest・path全文・raw例外・private参照は出力しない。

## 8 費目所有・上限と未確認事項

供給準備のregistry／table／view生成は元owner、taking用control／wrapper・固定責務slot・pre／post照合・pending記録／detach・未公開回収は移譲owner、borrow／Snapshot退役は元lifecycleが所有する。下位でsession／budgetを作らず、同opaque origin結合を実会計とみなさない。

pre／postの全件対応検査は各最大32file、shell照合は固定3role。claim消費・pending記録・detach・各回収開始はそれぞれ最大1。既存10event slotのtransfer_claimed／pending_owns／source_detachedを使い、holder_publishedは0。追加phase／保持診断は固定enum／bitのみで、要求回数に比例するlistを追加しない。

unit係数・全guard数・wrapper／台帳の実layout・全heap／work・実E／Sは未確定のUnknown。実装前に失敗prefixを含む有限操作表と単独選択子へ落とし、実測と独立oracleを照合する。Bのcap・D_stop900／D_end1000・guard131,524は変更せず、open／read／hash／resource cleanupは0のまま。既存期限を延長して追加費用を吸収しない。

## 9 合成受入条件（未実施）

| ID | 独立対照・拒否条件 |
|---|---|
| TB01 | 同owner／claim／anchor／shell／control／payloadの有効基点と各1項目差。copy・別root・同setId・summaryからの再構成を拒否 |
| TB02 | 消費点の直前は0、直後以降は1。再入・二重take・後着closeでも追加消費・権利復活なし。消費とgateを別更新する変異を検出 |
| TB03 | F0〜F7の故障・closeを別記述の所有oracleで確認。pending記録前の元clear、記録前detach、参照copy／再生成・順序補正の変異を検出 |
| TB04 | 元normal slot空でも正しいpending／anchorで関係検査成功。旧matches／current field依存を残す変異、未detachなのにpost成功させる変異を検出 |
| TB05 | taking後のclose／failが元CanonicalSupplyAssemblyのclearを呼ぶ変異、finishが先にborrowを退役させる変異を検出。停止理由と保持責務を両方維持 |
| TB06 | envelope／live context・借用失効・未発行／消失slot等、preflightで未到達だった条件へ固定単独選択子を先に用意する。現在の等価変異判定を継承しない |
| TB07 | 同一性だけは停止後も照合可能だが、通常postは拒否。closeによるcontext不在をbindingへ誤分類する変異と、cleanup identityから通常権を復活する変異を検出 |
| TB08 | source／pending／issued／anchor／failureの各保持漏れ、回収途中故障を注入。未確認保持・finish保留・一度限り回収を確認。反復要求で診断・計数不変 |
| TB09 | 消費点・pending記録・detachのevent順序と0／1を独立に数える。detachをdiscardへ混算、二重退役・二重課金する変異を検出 |
| TB10 | 旧B／C-start／供給準備／preflightのclose前後・理由・export・compiled保証を維持。新factoryもholder公開・C実行・正式発行0、fixtureの梱包漏洩負対照を維持 |

正常経路の試験だけでなく、各拒否条件について他の条件が整合した対照を用意する。oracleは本体の検査式・anchor builder・event係数をimportせず、元canonical参照の対応と各境界の責務を別記述する。実host／worker／transportは使わない。

## 10 次の実装分割と停止線

1. 同controlによる通常利用gate、停止だけのprivate継続、anchor＋明示payload関係検査を整備する。既存preflight・旧試験を維持し、takeは閉じる。
2. pending／failureのprivate active slot・固定回収／未確認保持・finish gateと有限scheduleを整備する。未公開失敗prefixの安全性がない限りclaimを消費しない。
3. taking→同参照pending記録→normal slot専用detach→postまで接続し、TB01〜10・compiled変異・梱包を確認する。holderは空のまま、post結果は非実行・未公開準備結果だけ。

本書は設計保存と文書照合だけであり、実装・合成試験・新たな費用検証は行っていない。holder公開・正常受領・C→kernel実行・実予算／停止／resource接続は別工程・別承認まで閉じる。
