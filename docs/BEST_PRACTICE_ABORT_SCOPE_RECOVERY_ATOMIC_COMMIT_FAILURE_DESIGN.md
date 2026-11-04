# OB-03 atomic commit準備・線形化点と失敗時所有権

Version: br006-recovery-atomic-commit-failure-draft-0.2 / Date: 2026-11-04。
設計基準HEAD: `3f61e4a`／AC-A実装開始HEAD: `381c7fd`。Status: **AC-Aのowner／準備状態・claim・失敗診断／全破棄だけ合成内実装済み。staged record・atomic commit・seal成功・正常終端は未実装。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・設定変更・Pushは行わない。**

[OB-03親設計](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_OB03_DESTINATION_CONTENT_DESIGN.md)§6〜9と[FP-3内部契約](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FP3_POST_ACCEPT_BUNDLE_DESIGN.md)の差分。atomic commitの準備と、commit前後の失敗責務を対にして具体化する。以下の成功遷移は未実装・未承認である。AC-Aの限定実装と実行結果は[検証記録](E2E_BEST_PRACTICE_ATOMIC_PREPARATION_ACA_2026-11-04.md)と§11に分離する。

## 1 現行到達点と再利用禁止

[FP3-C検証記録](E2E_BEST_PRACTICE_BUNDLE_CONSUMER_FP3C_2026-11-04.md)の継続は、唯一のready bundleを消費中slotへ移し、同budgetのpre／work／post／最終照合後にpayloadをretireし、固定abortする。消費数1やretiredは成功destではない。現行のFP3-A／B／C・旧header／D2入口と試験を維持する。

将来のcommitは別fresh合成constructor内の固定継続とする。FP3-Cのretire後に本文・proof・acceptedを復元せず、消費前の同取引からcommit準備へ接続する。公開mode指定・後付けbundle／dest登録・summaryからの昇格・任意callbackを設けない。

既存`normalAccepted.take`は元accepted slotを外してtransferredにする。一方、既存`sealRecoveryFinishExpectation`は未移譲のaccepted slotを前提とする。この既存sealを先に呼ぶ、take済みacceptedを戻して呼ぶ、contextだけをsealして後から全本文を付ける方式は採用しない。必要なのは同full受領物・同bundleからのprivate継続であり、その型付き接続自体を後続で検証する。

初稿の調査時にあったkernel作業中差分は保持し、設計だけの到達保証へ取り込まなかった。初稿作成と、後続AC-Aの実装／試験（§11・検証記録）は区別する。

## 2 不変条件と所有権の判定元

1. payloadの利用権限は常に0か1。sourceのtake後は元slotを復元しない。未公開destへの参照保持は利用権限ではない。
2. 同construction token・owner・元take／projection receipt・元parts／proof pair・budget identity／serial・失効serialが一致するものだけを扱う。値一致・同形copy・ID／hash一致はidentityの代用にしない。
3. 空handleは事前確保するが、単独では利用不可。同rootのprivate登録・同object・同commit状態・live条件をすべて満たす固定操作だけが利用できる。本文getter・JSON化・外部borrowを持たない。
4. 利用可能状態、成功数、cleanup責務の関連先は一つのcanonical commit recordから判定する。別々のboolや移譲通知で成功を組み立てない。
5. cleanupの実行主体／capsuleは同constructionで一つだけ。payloadの利用先がdestへ変わっても、capsuleを複製したり実解放をcommit内で始めたりしない。
6. 失敗・失効後の再準備、claim再arm、元ownerへのrollbackによる再利用は禁止。本文破棄確認と解放確認は別証拠である。

## 3 先行確保するowner・slotと準備物

同rootのDATA検査前に、dest shell・停止／診断slot・commit claim・固定解放責務slot・失敗時上位custody予約を確保する。実payloadは同取引の検査済み供給物だけから後で結合する。shell確保失敗は生成失敗として止め、登録口の追加で救済しない。

| 案の保持物 | 内容と発行元 | 利用・破棄責務 |
| --- | --- | --- |
| CommitOwner | 同token・budget binding・開始時点の全deadline・失効世代、未使用の準備／commit claim | 同root専有。callerから生成・登録不可。claimと固定診断はclear後も保持 |
| DestinationShell | 未公開空handle、未公開payload slot、commit状態、失効slot | DATA前に予約。payloadの有無だけで利用可にしない |
| CommitPreparation | 同準備追跡slotのbundle・parts／proof pair・期待値／全本文／rows／prefix、同dest／元receiptの対応 | 検査中の追跡slot。別rootやretired bundleから作らない |
| PreCommitBundle | 同準備物を検査済みとして固定結合した未公開候補。元のfull projection／期待値／全manifestと終端bindingを保持 | post・最終照合前はcommit不可。単独の外部handleは返さない |
| CanonicalCommitRecord | 同候補・空handle・dest・元receipt・budget／失効serial・同terminal責務への固定対応 | 公開前に確保・freeze・検査済み。最後の状態遷移だけで利用権限を発生させる |
| TerminalBinding | 同source identity・frame／世代・cleanup sink／identity・元accepted originと責務holderの最小対応 | payloadを含まない。正常終了確認は未発行。失敗時は同FailureOwnerへ継承 |
| FailureOwner／custody slot | 既存first hard、cleanup診断、未解決責務、本文破棄receiptの受け口 | 最初から予約。commit前後で新たな別FailureOwnerを作らない |

既存型との対応（案）：§2の「同owner」は、D2で合成内実装済みの`DestinationOwner`を指し、destの所有者identityとして再利用する。`CommitOwner`はclaim・失効世代・全deadlineの保持に限り、`DestinationShell`は同`DestinationOwner`に属する空handleとpayload slotとする。OB-03親設計§3の`TakenSealProjection`は、FP-1で合成内実装済みの`ReceivedAcceptedProjection`に当たる。`SealedMixedBundle`は、線形化点の到達後に同destが保持する`PreCommitBundle`由来のpayloadに当たり、別objectを新たに確保しない。いずれも実装時に確認する。

準備用slot、stage中のdest payload slot、binding台帳、kernel照合用借用はすべてpayload追跡対象とする。後からclosure・診断cause・helper cacheへ隠して残さない。owner shellと診断だけが残る場合と、payloadが残る場合を区別する。

## 4 準備状態と固定順序

以下は将来の合成内遷移案。現行FP3-Cのretired／failedをこの状態へ読み替えない。

| 状態 | payload利用権限と許可操作 | 停止時の扱い |
| --- | --- | --- |
| reserved | destは空・利用不可。準備claim未使用 | shell生成失敗／停止を固定診断へ。未生成resourceを解放済みと推定しない |
| preparing | claim先行消費済み。同bundleは追跡slot内、destは利用不可 | 元／準備／候補／借用の全破棄。再準備不可 |
| staged | 候補・空handle・commit record・terminal bindingの確保済み。destは依然利用不可 | post停止・最終不一致はcommit数0。stage済み参照もclear |
| committing | 同期section内だけ。元の利用権限0、destもまだ利用不可 | 線形化前なら失敗終端へ。元slotを戻さない |
| sealed | 最後の線形化点を通過した同destだけ利用可 | 後続hard／close／cleanup開始で直ちに利用不可へ |
| invalidated／failed | payload利用権限0。正常確認の有無と失敗診断は別管理 | 全破棄を確認後、最小終端責務／失敗custodyだけ保持 |
| terminal-only／discarded | 本文なし。同source closed＋同cleanup confirmedを受ける固定終端だけ | 確認不足・別origin・再消費は拒否。通常成功へ救済しない |

固定順序：

1. 同rootのbusy・first hard・claim未使用・同bundle readyを確認し、準備claimを検査／確保より先に消費する。同objectを準備追跡slotへmoveし、元ready利用権限を外す。
2. 同停止／budget ownerのpre checkpointを実施する。新timer・別clock owner・残時間からの期限再計算は行わない。
3. workで同receipt／parts／proof pairと全構成を検査し、候補・空handleの固定対応・commit record・terminal bindingを確保／freezeする。終端originを供給できなければUnknownのまま拒否する。work不適合は固定理由だけを暫定保持する。
4. 同ownerのpost checkpointで取消／期限・先行hardを優先する。通過後、同bundle／dest／record／claim・budget／serial・失効世代、source open・同ready・cleanup未開始、本文／混合manifest／prefix各laneを最後に再照合する。
5. commit開始claimを一度だけ消費し、固定sectionへ入る。stagedを公開成功とは扱わない。正常seal遷移は別の明示承認がある段階だけで試験する。

準備claimとcommit claimは別責務。準備失敗後にcommitできず、commit失敗後に準備からやり直せない。guard内のswallowed再入もfirst hardを保持して停止する。

## 5 固定commit sectionと線形化点

線形化点は、**同canonical commit recordに結び付いたdestを利用可能とする最後の状態書込み**一箇所とする。commit件数はその到達履歴から得る。件数だけを先に1へ上げたり、複数slotの存在から成功を推測したりしない。

freeze済みrecord自体のfieldを書き換える意味ではない。rootのprivateな判定slotを、事前確保・検査済みの同recordに結合したsealed状態へ最後に切り替える方式とする。失効後のpayloadなし状態／終端identity保持先も事前に用意し、full record参照を外して履歴だけを保持できる構造が必要である。単一の判定元からcommit履歴・利用可否・責務関連先を導出できるかは後続の型／compiled試験で確認する。

sectionに入る前に必要な確保・schema／全field比較・proof再検査・handle登録先の予約をすべて終える。section内は同rootが管理するprivate lexical slotの固定move／除去と固定状態書込みだけとし、次を禁止する。

- await／Promise継続、I/O、追加guard／clock採取、caller hook、任意getter／setter・Proxy、ログ／通知。
- 新規object／配列／handle／registry entryの確保、freeze・serialization、schema解析、再投影・任意の比較器呼出し。
- public helper呼出しや、任意処理を行えるcleanup callback／登録callback。

sectionの順序案：

1. committingへ入り、同候補をstage済みdest payload slotへ固定moveする。この時点ではdestを利用できない。
2. 元ready／準備／消費中slot、parts／proof origin等の独立利用slot・照合借用slot、kernel側の移譲元payload借用を固定手順で外す。destが必要とする元証拠は、同候補内の固定参照だけで維持する。
3. cleanup責務のcanonical holderが引き続き同rootの一つであることを保持し、関連先は同commit recordへ固定する。capsuleの二重発行／上位への先行移譲はしない。
4. 最後の状態書込みで同destをsealedへ切り替える。これが唯一の利用可能化であり、元利用権限0・同dest権限1・commit到達履歴1を同じrecordから判定する。
5. sectionを抜けた後だけ事前確保した空handleを返す。返す直前までのfirst hard／失効も同rootで拒否できる構造とし、戻り値だけでliveを証明しない。

現行`acceptedChannel.invalidatePayload`は単なるslot除去だけでなくfinish状態の失効も伴う。そのまま任意callbackとしてsection内で呼べるとは仮定しない。移譲元borrowの固定除去とdest失効の責務を区別するprivate境界が必要であり、後続の実装・compiled検証まで未確認とする。元acceptedを復元して既存sealを通す代替は不可。

例外が起こらない想定だけに依存しない。section途中に合成故障を挿入した場合も、線形化前は成功0・利用権限0、線形化後は過去commit1を保持してdest失効へ進める。最終書込み後にcommitを0へ戻す「成功取消し」はしない。JSの同期所有権上のatomicであり、プロセス停止・OOM・OS資源transactionの保証ではない。

## 6 失敗時の所有権・破棄責務

| 失敗位置 | 有効payload owner／commit履歴 | 固定破棄と診断／cleanup holder |
| --- | --- | --- |
| shell確保／DATA検査前後 | 利用可能destなし・commit0 | 部分生成物だけを追跡して破棄。生成失敗の固定診断と実際に生成済みの責務を同上位slotへ保持 |
| pre／work／post・最終再照合 | preparing／stagedは外部利用不可・commit0 | 元／準備／候補／dest stage／借用を全clear。first hard・post優先・同rootの未解決責務を保持 |
| section途中・線形化前 | 一時move済みでも利用権限0・commit0 | 両側slotをclear対象にする。元へのrollbackなし。capsuleは同rootの一つだけ |
| 線形化後・handle返却前 | 過去commit1、liveは失効により0 | 空handleを返さずdestを失効・全破棄。履歴を成功応答に昇格せず、診断／責務は同FailureOwnerへ |
| handle返却後のhard | 過去commit1、以後の固定操作は拒否 | destと全aliasを同期失効。保持中handleがあっても再利用不可。未解決cleanupを上位custodyへ |
| source close／cleanup開始 | payload利用権限0、正常終端確認はまだなし | payloadを失効・破棄し、payloadなしterminal bindingのみ保持。解放失敗／未確認なら正常完了にせず失敗診断へ |

全clear対象：元pending／take／projection受領物、準備slot・PreCommitBundle・stage済み／sealed dest payload、full本文／manifest／rows・expectation／prefix・parts／proof／marker／origin・検査用copyとkernel借用。空handleや固定診断が残ってもpayloadへの到達路を残さない。commit recordも失効後はpayloadを外し、最小の履歴／終端identityだけを残す構造とする。

本文破棄receiptは、保護scopeを抜けbusy・一時借用が終了し、新slotとkernel側を含むpayloadPending／isClearedが成立した後だけ発行する。clear失敗・参照残留・budget identity破損では移譲を拒否する。予算identityの不整合を作り直して上位へ通さない。first hardは上書きせず、cleanup失敗／未確認は別軸に保持する。

失敗custodyには最小cleanup-only capsuleと固定診断・未解決責務だけをmoveする。payloadや再sealに使えるproofをclosureへ隠さない。上位slotへの一度限りcommit receiptと固定最終discardは既存FailureOwner契約を再利用し、正常source close／accepted discardをhard後にも通せるとは仮定しない。

## 7 正常終端との接続境界

本稿ではterminal bindingの供給・保持・失効責務を予約するだけで、正常終端を成立させない。後続D4で、同source／frame／cleanup sinkの終了確認をそれぞれ取得し、payload破棄確認とは別に一度限りterminal-only discardへ結合する。

同source closed＋同cleanup confirmedの両方が揃う前は正常完了にしない。異なる世代・source・sink、cleanup未開始／未確認、重複receipt、順序違反を拒否する。commit履歴や空handleは解放確認の代用にならない。実source／worker／OS由来の証拠は未接続であり、合成issuerの成功を実証拠に昇格しない。

## 8 費目所有とUnknown

| 費目 | 所有点／上界に含める範囲 |
| --- | --- |
| shell／claim／診断／上位予約 | constructor。DATA前の固定数・部分生成失敗・予約返却 |
| 準備物／候補／record／handle／terminal binding | 同準備phase。元graphとの同時保持・参照配列／索引・copyピーク |
| 全構成照合とpre／post | 同budget。成功・暫定拒否・post停止・最後の再照合を別計数 |
| commit section | 固定move／clear／状態書込みの個数。元borrow除去とcleanup関連先の変更を含む |
| 失効・全破棄・custody | 同失敗owner。commit前後・部分stage・参照残留・移譲拒否を含む |
| terminal-only／最終discard | 同終端owner。payloadのない責務保持・late cleanup・二重消費拒否 |

元C/G/P・retry・210試行・全60秒・開始UTC／全deadline・各局所bounded制約を維持する。追加費目を既存usageへ無根拠に内包／二重課金しない。総work／heap・copyピーク・3round配賦・必要予約・中断粒度はUnknownのまま。未導出を0として全体受付や本番capを有効化しない。

## 9 後続の合成受入条件

- 状態と所有権の独立oracle：元／準備／stage／destの利用可否を手書き遷移表から導出する。実装のinspectを期待値生成器にしない。参照保持と利用権限、commit履歴とlive状態を別に検査する。
- 準備0／部分確保／staged／section各書込みの直前直後／線形化直後／返却前後の故障を、temporary emit copyだけで挿入する。commit0または履歴1＋失効のどちらかであり、元とdestの同時利用は常に0。
- 同receipt／take／parts／pair／budget／epoch／terminal originの混入・copy・欠落、二重準備／commit・失敗後再開・summary再登録を拒否する。検査到達点を計数し、早い別条件の拒否だけを後段保証として数えない。
- pre／post取消・期限・guard例外・swallowed再入、work不適合とpost停止の優先順位を検査する。元S／全deadline・canonical会計が変わらないことを確認する。
- section内に確保・callback・guard／clock・await／I/O・getterを追加する負の対照を静的／compiled監査で検出する。単一線形化点、件数と状態の同一判定元、section前の確保完了を確認する。
- 各payload slotのclearを一つずつ除くと本文破棄receipt／上位移譲が拒否されること。borrowをcapsuleへ隠す変異も拒否する。正常cleanup確認とは別試験にする。
- 合成内seal成功は明示承認後の別試験とし、旧FP3-C固定abort試験を残す。strict compile・実emit graph・独立oracle・梱包除外／runtime friend不在を維持する。

## 10 未確認事項と次の分割

未確認：移譲元borrow除去のprivate契約、canonical recordのpayload切離し方法、実装上の単一線形化点と非確保section、正常terminal証拠との一度限り結合、各追加費目の上界。これらは本稿の記述だけで確認済みとしない。

推奨順序は、(AC-A、合成内限定実装済み) owner／準備状態・claim・失敗診断と全破棄を固定abortの合成内で実装、(AC-B、未実装) 同bundle／record／terminal bindingと非公開staged境界を固定abortのまま接続、(AC-C、未実装) 事前レビューと別の明示承認後に合成atomic commit／同期失効・空handle検査、(D4、未実装) 正常terminal-only／固定discard・hard診断の連続接続。本稿自体は後続実装・seal成功を承認しない。実接続・実通信・全体受付はさらに別の承認条件に残す。

## 11 AC-Aの限定実装と後続境界

`createSyntheticAtomicPreparationRoot`は別fresh合成継続の引数なし`prepareAtomicCommit`だけを固定公開する。DATA検査前に同token／既存DestinationOwnerに結合したAtomicPreparationOwner、非公開空handleを持つAtomicDestinationShell、original identity台帳、準備claim・固定診断slotを確保する。identity台帳はpayloadを含まないshell参照だけであり、外部登録・成功handle・利用権限を持たない。

同rootのready bundleから、FP3-Cのconsumer／retireを通さず準備継続へ進む。claimを先行消費し、reservedからpreparingへ移り、唯一の同bundleを準備追跡slotへmoveする。同budgetのpre後、AtomicPreparationに同owner／shell／bundle・budget identity／serial・失効serial・開始UTC／全deadlineを結合し、全構成照合を行う。これは準備用のbasic bindingであり、AC-Bの完成record・terminal origin供給・stagedの証拠ではない。

work不適合は固定理由で暫定保持し、post停止を優先する。post通過後の再照合まで通ってもphaseをfixed_abortとして既存state失敗へ進む。準備中bundle／wrapper／owner／shellをclearとisClearedへ含め、busy終了・kernel側payload不在の確認後だけ既存失敗custodyへ移る。claim／phase別first failure・件数は保持し、payloadを上位capsuleへ隠さない。source／cleanup開始ではinvalidatedとして利用不可にし、後続の試行も拒否する。

現在の実装状態はreserved／preparing／invalidated／failedだけで、staged／committing／sealedやcommit claimの成功消費は作らない。追加費目はowner／shell／marker／空handle・identity台帳、準備wrapperと重複参照保持、pre／post・work／final全構成照合、診断・clear／custody検査。総量・work上界はUnknownのまま。旧入口の挙動と成功数0を維持する。
