# WF-B SG-A後：同backingの所有・容量確認境界とwriter退出／borrow退役

Version: draft-0.2 / Date: 2026-11-14 / 読取り基準HEAD: `ab0c216` / レビュー修正基準HEAD: `6429276`。

draft-0.1のレビュー修正：数値の誤りはなかった。packet予約設計§7の不変式は同時active workspaceを全体で最大1とするが、WX01／02は同recordの条件だけで、直前recordのwriterがcaller join未確認やpost_check未退役のまま次recordのwriterを開始してよいかが未記載だった。WX01に、同trialで直前にencodingを試みたrecordがencodedへ昇格済み（writer／post_check退役確認済み）であることを開始条件として加え、WX02を全体で最大1へ改め、BW04へ対照を加えた。選択状態・予約値は変えていない。

Status: **詳細設計のみ。LOAD6／LOAD7の選択・storage／writer方式・容量capは未承認。** 元のtest 5,000ms・既定並列度、通常経路未切替、正式発行口・C実行入口・body起動閉鎖、全体受付無効、Unknown、VM／監視／telemetry調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・Pushは行わない。

親は[packet総量・部分buffer予約設計draft-0.2](BEST_PRACTICE_WFB_SGA_PACKET_TOTAL_BUFFER_RESERVATION_DESIGN.md)と[固定schedule・slot設計draft-0.3](BEST_PRACTICE_WFB_SGA_FIXED_SCHEDULE_SLOT_ENCODING_DESIGN.md)。完成line／論理予約と実allocationの違いを保ち、BR02〜07を同backing・同writer frame・同borrowへの条件として詳細化する。以下の内部型名・状態・確認物は設計名であり、発行口・台帳・buffer APIを実装／起動するものではない。

## 1 対象・所有の単位

候補は、一つのrecord予約B[j]に一つの出力backingを結合し、workspace→encoded slotへ同じbackingのまま移す方式。同record内のaliasは同じallocationとして扱い、別recordへ同じbackingを重複採用することや、copyを同一backingと称することは認めない。

raw backing／mutable viewをpublic API・外部callback・任意pluginへ渡さない。`readonly`という型名、同値bytes、serialized ID、凍結済みmetadataだけを、write不能・実参照同一性の証拠にしない。privateな固定継続を通してのみwrite／readの役割を与える候補であり、その非漏出・非改変性は将来のsource coverageが必要である。

fixture・合成依存のidentity／claim台帳は実runtime用と共有しない。合成成功や外部診断から本物のBackingAnchor／Grant／Ackを再生成する入口を作らず、正式発行口は閉鎖のままとする。

## 2 先行内部型・同一性の結合案

| 内部型・slot | 必須のprivate結合／役割 | 公開しないもの・失敗時 |
|---|---|---|
| BackingAnchor | 同root／trial／schema／profile／record slot／B[j]／一度限りattemptへの実参照 | labelやbytesから復元不可。別owner・slot・版の混入は拒否 |
| BackingHolder | Anchor、取得結果の実backing参照、容量状態、custody位置、先行Failure | raw backingはここだけが保持する候補。部分生成で参照を捨てない |
| CapacitySlot | requested bytes、view offset／length、backing extent、storage mode、根拠の区分 | request値をobserved値へcopyしない。unknown・例外を保持 |
| WriteGrant | 同Anchor／attempt／writer origin／epoch、active／revoked／spent状態 | 同値copy・再入・失効後の再利用拒否。将来の内部権限であって実発行なし |
| WriterFrame／ExitSlot | 同Grantのenter、in-flight状態、finally候補、caller合流状態 | finallyだけで退出確定しない。先行slotをenter前に保持 |
| BorrowSlots | §5の固定4roleのorigin・状態・retire claim | 空slotを解放成功にせず、未知borrowを0へ補完しない |
| PublishSlot | 同backing・正規長・sealed入力・writer／post確認の一度限り昇格 | 別backingやcopyを採用しない。post未確認は非公開で保持 |
| RetirementSlot | 同Anchorの参照退役・custody・物理解放の別状態 | 参照解除をallocator／GC／OS解放へ昇格しない |

同一性は、同run内の固定14／15 record位置に置くcanonical cellと実backing参照の関係で検査する案。無制限のglobal registryを追加しない。一つの取得結果が別recordの既存backingと同一、または容量・所有関係を確認不能なら、新slotへのwrite／昇格を拒否し、元の所有責務を保持する。別viewでもbackingが同じなら別allocationと数えないが、record間の共有をこの候補へ許可したことにはしない。

epochは同attemptの失効・遅い復帰を区別するための内部状態で、外部入力で更新しない。integer wrap・owner再生成・別slot再bindで古いGrantを有効へ戻さない。値域・物理配置・全fieldのbyte上界は後続の内部型／保持算定に残す。

## 3 容量確認の境界：四つの事実を分離

| 項目 | 確認する値／性質 | それだけでは分からないこと |
|---|---|---|
| request | recordのB[j]を要求した事実 | 同じ容量で実確保されたか |
| view region | offset、length、書ける範囲 | backing全体・pool・他aliasの存在 |
| backing extent | backing全体のpayload byte範囲・同一性・固定性 | allocator丸め・header・一時copy・GC等の実charge |
| allocator charge | runtime／nativeで確保・保持される総費用 | view／extentの観測からは未導出。現時点はUnknown |

候補の厳しいstorage profileは、`request=B[j]`、`view_offset=0`、`view_length=B[j]`、`backing_extent=B[j]`、固定長・排他的private保持とする。これは必要条件の案で、特定API／allocatorの採用や、その条件を実現可能と確認したものではない。B[j]はH=1,428、S=1,125、L=909、I=493、SUM=1,250、TERM=1,507byteの既存未承認予約候補を保持する。

ここでのview条件はwriter取得時の全予約regionについてで、encoded後の使用長`used_length≤B[j]`とは別である。read用SegmentRefが使用済みprefixだけを表す場合も、同Anchorと全backing extentの対応を残す。短いsegment長へ変えたことを、backing容量の縮小・残領域の解放・raw mutable viewの公開許可にしない。

shared／resizable／pooled／detached／所有不明・capacity不明・他writerへ漏出した可能性があるstorageを、view長だけで`fixed_exclusive`へ昇格しない。排他性・固定性はproviderの自己申告flagだけで通さず、固定生成元と非漏出sourceの根拠へ結合する。必要な観測・APIは未選定で、今回実確認しない。

buffer取得後に確認する区間は、同Holderへ実参照を先に保持→安全な固定操作でview／backingを照合→同容量post確認→WriteGrantの候補条件成立、の順とする。未確認・throw・不一致ならwriteを開始せず保持する。任意objectのgetter／Proxy等を検査のために呼んでよいという契約ではなく、受領物の生成境界そのものに根拠が必要である。

取得後に大きなbackingを検出して拒否しても、「大きなallocationが一度も起きなかった」とは言わない。確認中の一時領域も含む実費上界を事前に抑える機構・根拠がなければ、物理memory cap充足はUnknownのまま。要求B[j]と観測値の一致を、OS allocatorのcharge一致や実解放の証拠にしない。

## 4 writer frame・停止・退出確認の二段階

本候補は、監査可能な固定同期writerがraw参照を外へ逃がさず、追加のasync task／native後続writeを残さないことを前提にする。この前提を実装で確認できない場合は退出を未確認とし、非同期対応を暗黙に追加しない。

| ID | 境界 | 状態・責務 |
|---|---|---|
| WX01 | enter前に同Anchor／容量確認済み／Grant・epoch・停止状態を検査。加えて、同trialで直前にencodingを試みたrecord（TERMではPrePacketの最後のrecord）がWX08の昇格まで完了し、そのwriter_frame／post_checkの退役が確認済みであること | 拒否ならwriter frame未開始。claimを復元して再入しない。直前recordがexit_unconfirmed／post未退役なら、正常に戻っていても次recordを開始せず、そのbatchを停止して保持する |
| WX02 | enterを先行slotへ記録してから固定writer本体へ入る | active frameは同trial全体で最大1（record間でwriter／post_checkを重ねない）。再入・別origin・別Grantを拒否 |
| WX03 | 各新token前にGrant／停止と既存BR04の範囲を確認 | 停止後は新tokenを開始しない。新clockやpollを追加しない |
| WX04 | 正常／throw／取消のfinallyでGrantを失効し、exit candidateを同slotへ記録 | active frameを退出確定へ置換しない。in-flight extent・先行理由を保持 |
| WX05 | 固定callerの復帰／catch継続で、同frameから戻ったことと同exit candidateを合流 | 別frameのreturn・Ack copy・Promise settleだけを代用にしない |
| WX06 | 後続writerなし・raw参照非漏出・in-flight終端を裏付け、joinedを確定 | 不足ならexit_unconfirmed。active／borrow責務を消さない |
| WX07 | joined後、post_check roleを固定継続へ与え、終端・LF・正規長・入力不変を確認 | 失敗は非公開backingで保持。writer復帰だけで昇格しない |
| WX08 | post_check退出／retireを確認後、同backingを一度だけencoded slotへ昇格 | write資格再発行・copy・再encodingでの採用なし |

finally内はまだwriter frameの中であり、raw参照が局所変数に残っている可能性がある。したがってexit candidateとcaller側joinを分ける。同期return／throwを確認し、後続処理の不存在・非漏出がsourceで裏付けられた場合に限り、joinの根拠として使う。実装の形が未確定の今、return／finallyの発生だけで退出証拠を発行済みとはしない。

停止は新規write資格を同期に閉じる要求で、既に始まったtoken writeを瞬時に止める保証ではない。in-flightのwriteが既に予約範囲内で始まっていれば、終端が確認されるまで元backingを保持する。Grantをrevokeしたことやcursorを記録したことを、終端・未確認extentなしの証拠にしない。遅い復帰は同じ旧attemptの退出確認へだけ合流し、新slot／新Grantへbindしない。

取消・期限到達・post失敗・finally throwで退出確認が欠けた場合、先行Failureと非公開backingを保持する。finally候補を作ること自体に失敗しても、enter前のExitSlotから未確認責務を失わない。再実行・別writerでの完了・補助buffer作成で穴を埋めない。

## 5 固定borrow roleと退役

raw backingはHolder内部に留め、固定のprivate継続へ必要な役割だけを与える。roleの名前がreadonlyでも、raw mutable viewを渡した後の非改変性が保証されたことにはならない。保護されたread操作の具体機構・非漏出・費用は未実装である。

| role | 権限・開始前提 | 退役条件 |
|---|---|---|
| writer_frame | 容量確認後の同Grantで予約範囲だけwrite | WX04〜06の失効・同frame join・in-flight終端確認 |
| post_check | writer joined後、正規長・LF等を固定readで確認 | 同post継続の復帰・参照非漏出・同originの一度限りretire |
| segment_build | encoded後、固定順のpacket segment参照を組むread資格 | 同segment構築の終了と、残した参照／custody先の確定 |
| packet_custody | 同packet／同segmentの一度限り上位受領に必要なread資格 | packet受理とは別の同borrow退出・参照返却／custody責務の確認 |

各roleはrecordあたり一つの先行slotと一度限りenter／retire claimを持つ候補とし、再入・借用中の再bind・失敗後の再貸与を拒否する。固定14／15recordならrole位置は56／60個という構造候補になるが、全fieldのbyte量や同時active数全体を算定した値ではない。TERMはPrePacketのsegmentではなく、recordに適用しないroleは未開始／非適用のままにする。

順序制約としてwriter_frameとpost_checkは重ならず、これらが退出未確認の間はsegment_build／packet_custodyを開始しない。segment_buildの元参照保持とpacket_custodyのreadは重なり得るため、同record内で最大2 roleのread借用を許す候補とする。raw参照の想定外漏出があれば、この有限role数で全aliasを把握したと主張せずUnknown／停止へ戻す。

BorrowRetireAckは同Anchor／role／origin／epoch／enter実体へ結合したprivateな確認物の設計名である。同値labelや外部Ackを代用にせず、確認の生成元は固定の復帰継続へ限定する。重複retireを二重解放にせず、既に確定した退役状態と最初の理由を維持して拒否する。存在しないborrowを空slotから「返却済み」と推測しない。

packet receiptはbytesの受理であり、packet_custodyのborrow退役でも、元segment参照の解放でもない。上位が保持を続けるなら同backingはliveのままである。所有責務の移譲とborrow終了も別で、固定の移譲先が保持を引き受けたことを確認できなければ元Holderが責務を残す。別ownerへ移っただけで容量支出・先行prefixを0へresetしない。

## 6 昇格・参照退役・物理解放の分離

| 段階 | 確認してよい意味 | 確認したとは言えないこと |
|---|---|---|
| encoded昇格 | 同backingに正規lineがあり、writer／postの資格が退役 | packet受理・全reader解放・memory返却 |
| local borrow退役 | 特定role／originの利用終了と保護参照の返却 | 他role・上位custody・未知aliasの不存在 |
| local参照解除 | 当該ownerが管理参照を外したこと | 別owner・runtime内部の参照消滅 |
| custody責務移譲 | 同backingの保持責務を固定の相手が確認して引き受けたこと | allocationが消えたこと・copyがないことの単独証明 |
| backing reclaim | 対象backingのruntime／native解放の確認 | OSへ即時返却されたこと |
| OS返却 | 対象に対応した返却の根拠があること | 今回は機構も対応証拠も未確認 |

参照退役の候補条件は、当該ownerが新しいwrite／borrowを同期に閉じ、writerとpostがjoined／retired、適用するsegment／custody roleの責務が確認され、未知aliasや未確認extentが残っていないこと。いずれか不明ならhold／retirement_unconfirmedとし、clear・reuse・別slotへの再採用をしない。byteのゼロ化・detach・resize・手動freeの操作は本書で採用・許可しない。

親予約設計のretiredは、このプロトコル上で確認できた責務の退役として扱い、GC／native解放／OS返却と無条件に同義にはしない。解放対象・確認階層を分けて記録し、物理解放が未確認ならその欄をUnknownのままにする。単なる参照解除を使って総physical memoryのlive量から引かない。

creditを同trialの別record・別trialへ再利用しない既存条件を維持する。記録上retiredになっても、R_totalの履歴・支出prefixを削除しない。こうして同recordに再allocationを始めない前提なら、出力backingの**累積生成payload**もrecord予約和以下という条件付きモデルを使えるが、allocator chargeや複数trialを含む実memory保証ではない。

## 7 正常・故障prefixと未確認保持

| prefix | 固定の扱い | 同時保持へ残すもの |
|---|---|---|
| capacity確認前／途中失敗 | writeなし。claim／取得結果の有無を保持 | allocation不明・部分Holder・先行診断 |
| 別backing／共有pool／view容量だけ一致 | 新write／採用を拒否 | 元backing・実extent／所有関係のUnknown |
| write途中throw／取消・finally未確認 | failed_held。次encodingなし | 同backing全体・confirmed prefix／未確認extent・frame責務 |
| finally候補あり・caller joinなし | 候補のまま。active=0と見なさない | write資格失効状態・raw参照／in-flight不足 |
| writer joined・post失敗／未退出 | encoded公開なし | 同backing・post borrow・先行理由 |
| encoded後・receipt欠落／borrow未退役 | 元参照／custodyを保持。再通知／copyで救済しない | 完成PrePacket・segment／custodyのalias |
| local退役済み・GC／native解放不明 | local事実だけを記録 | reclaim／physical chargeのUnknown |

FS08と、FS08未到達時にFS13で行う早期失敗の診断batchは同じrecord予約／claimを排他的に使う。どちらのbatchでもrecord jで失敗すれば、次workspace・上位通知を開始しない。FS13のzとTERM封印は残すが、TERM encoding／z_postなし。未encoding TERMや先行shellも総保持の対象であり、failed backingに含めて数え落とさない。

先行理由はfixed Failureへ保持し、容量・混入・順序・取消・退出未確認・custody不足を区別する。内部診断を追加recordやraw例外へ展開せず、旧record schemaへ新しいwire fieldを無言で追加しない。追加内部fieldの容量・診断写像・保持上界は後続でレビューする。

## 8 最大同時保持へ渡す前提と費目coverage

次の保持表では、同Anchorのallocationを一回だけ数える一方、別copy・実extent全体・未確認保持・sealed入力・role cellを別項目とする。workspace→encoded slotのaliasは二つのallocationではなく、上位がcopyを作れば別allocationである。未把握のalias／copyがある場合は、閉じた上界を得たとしない。

実extent≤B[j]、recordあたりallocation高々一つ、grow／隠れcopyなし、失効後再allocationなしという前提が全て裏付けられるなら、record群の出力payloadには13,400／14,309byteの条件付き包絡を使える。これは完成line長が同じという理由だけから導かれるものではない。全borrow位置56／60も、payload・metadata・内部参照・allocation overheadを含むbyte上界ではない。

BR02〜07に対して、容量受領・同一性検査・Grant／frame enter・finally候補・caller join・post borrow／退役・昇格・custody確認をOP12／13／18／19の費目へ対応付ける必要がある。固定4roleの補助slot生成費、各確認のwork、退出待ち、通知失敗、metadata保持を未計上にしない。追加clock／poll／再guardが必要なら別版でschedule・62／70取得候補を再計算し、今回黙って足さない。

writerのsource非漏出・固定復帰境界・実capacity確認の保証、全phaseの最大同時保持、実allocator／GC／OSの挙動、R内encodingの費用・鮮度はUnknown。上界を閉じるためにVM／監視調査・実環境操作・設定変更を再開しない。

## 9 静的・合成・実確認の境界

| 区分 | 確認できる契約／必要証拠 | 今回の実施状態 |
|---|---|---|
| 静的S | private生成元、raw参照の非漏出、固定同期writer、容量／join／退役のsource対応 | 今回は既存MDの読取りと契約の整理だけ。新規の実code照合なし |
| 合成F | 別owner／backing、容量不一致、再入、join不足、late復帰、borrow退役の拒否 | 受入計画のみ。台帳／fixture／検査器を実装・実行しない |
| 実R | 実生成元・backing extent／固定性・copy・writer復帰との対応、実費・解放階層 | 別承認・有限の対象／時間／保存／終了条件が必要。全て未採取 |
| 承認A | storage／writer方式・profile／容量・操作範囲・保管 | 選択を含め未承認。文書化を採用・実行承認にしない |

今回buffer取得・容量getter・allocator probe・時計／OS値採取・GC操作・native／実通信を起動しない。実確認が必要でも、何をどの上限で確認し、未確認時に誰が保持するかを先にレビューする。取得後の一度の成功を最悪allocationや物理解放の保証にしない。

## 10 後続の独立fake／oracle受入案（全て未実施）

| ID | 対照・故障 | 必須条件 |
|---|---|---|
| BW01 | 同値bytes・別Anchor／owner／slot／版 | 実参照結合を拒否し、旧元slotの責務を保持 |
| BW02 | 同backingの別view・別recordへの重複採用 | aliasとcopyを分け、record間共有を自動許可しない |
| BW03 | request／viewだけB[j]、backing大・shared／resize／unknown | capacity適合にせずwriteなし。既発生allocationを消さない |
| BW04 | enter前拒否・二重enter・別Grant／epoch、直前recordのjoin未確認／post未退役のまま次recordへenter | 一度限りframe／role。再bindで再利用しない。直前recordが昇格・退役確認済みでなければ次recordのWX01を拒否し、batchを停止 |
| BW05 | finally候補だけ／別frame return／Ack copy | joinedへ昇格せずactive／raw参照不足を保持 |
| BW06 | token途中取消・遅い復帰・finally throw | revokeと退出を分離。次encoding／clear／reuseなし |
| BW07 | writer joined後のpost失敗／未退出 | encoded公開なし。同backingとpost責務保持 |
| BW08 | 同backing昇格・copyによるすり替え | 昇格は一度だけ。copyの容量／費目を無視しない |
| BW09 | segment／custody二role重複・未知borrow・二重retire | 固定roleと同origin。重複返却で支出を減らさない |
| BW10 | packet receiptだけ、local参照解除だけ | borrow退役・GC／native解放／OS返却へ昇格しない |
| BW11 | FS08／早期診断batchの各jで失敗 | 同予約を排他的に使用。sealed TERM保持・TERM encodingなし |
| BW12 | 全logical条件成立だがallocator charge不明 | conditional payload包絡と総memory／実費保証を分離しUnknownを維持 |

独立oracleは対象のidentity／retire helperを流用せず、固定のowner／slot／origin関係表、容量四区分、finally候補／join／borrow状態の期待表で照合する計画とする。今回の文書確認・定数検算をその合成試験や実確認として数えない。

## 11 未承認事項と今回の範囲

- [ ] privateな同backing生成・容量四区分・storage必要条件のレビュー。
- [ ] 固定同期writer・finally候補／caller join・同attempt退出の確認方法。
- [ ] 固定4roleの権限・非漏出・borrow退役・custody条件のレビュー。
- [ ] 参照退役と物理解放の分離、最大同時保持・費目coverage・実費の算定。
- [ ] LOAD6／LOAD7・storage／writer方式・容量profileと、実装・合成確認・実確認・保管の個別承認。

全て未承認。本MDと親2文書の参照更新だけを行い、選択・方式・容量capを採用しない。元の5秒期限・既定並列度、各閉鎖条件・全体受付無効・Unknown・調査保留を維持する。実装・負荷採取・試験再実行・実process対照・実接続・実通信・設定変更・コミット・Pushは今回行わない。

文書整合として対象3文書のローカルリンク13件・表21個の列数、WX01〜08／BW01〜12のID連番、未承認チェック5項目、固定14／15record×4role＝56／60位置と既存予約和13,400／14,309byteの定数式、末尾改行と差分空白を確認した。文書と定数の静的検算のみで、buffer取得・容量getter・台帳／writer実装・合成試験・負荷採取・試験再実行・実退出／物理解放／最大同時保持の実証ではない。

## 12 後続のphase別保持・内部slot値域（2026-11-14）

[phase別保持・多重度と内部slot最小値域draft-0.1](BEST_PRACTICE_WFB_SGA_PHASE_RETENTION_SLOT_DOMAIN_DESIGN.md)で、workspace→同backing昇格、前record退役前の次enter拒否、固定4roleの配置／適用位置と内部状態の対応を整理した。空cell・未確認取得／解放・alias管理費を0とせず、論理個数／条件付き出力payloadと実memory／合法最大を分離する。選択未承認・元5秒／既定並列度・各閉鎖条件・Unknown・調査保留を維持し、実装・採取・再実行は行わない。
