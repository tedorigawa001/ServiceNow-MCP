# WF-B EvidenceStore：artifact単位の内部契約とfake

Version: draft-0.10 / Date: 2026-11-05 / 基準HEAD: `7f6ef4f` / レビュー修正の基準HEAD: `fb91044` / 試行別結果の実装基準HEAD: `85eb9ad`。

draft-0.10: [DT-C検証記録](E2E_BEST_PRACTICE_WFB_RECORDER_CONTINUOUS_DTC_2026-11-05.md)。通知throwより先にprivate Store受付を閉じ、他方通知と元のcleanupを継続する。固定6checkpoint列の操作／byte／clock上界を確認した。式・費目所有と保証限界は[DT-C設計§8.3](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md#83-dt-c連続検証通知と費目)。実予算受付や運用capは有効化しない。

draft-0.9: [DT-B検証記録](E2E_BEST_PRACTICE_WFB_RECORDER_TERMINAL_DTB_2026-11-05.md)。Store busy照会・固定unwind継続をmodule-privateに接続し、Storeのcleanup／試行結果固定より先にrecorder終端へ入らない。閉鎖後clock不正は一度だけStore受付を取消すが、既存cleanupと診断は保持する。実保存／ProcessOwnerへの接続ではない。

draft-0.8: [DT-Aの合成検証](E2E_BEST_PRACTICE_WFB_SLOT_DEADLINES_DTA_2026-11-05.md)。固定期限表・同run／budget bindingをsave／receipt消費／closeへ接続した。旧単体の期限pairは維持し、recorder終端・manifest writer・実予算接続は行わない。

draft-0.7: [slot固定期限表・閉鎖後recorder終端の差分設計](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md)を追加。save・receipt消費・closeが同じprivate rowを使い、Storeの健全性とcheckpoint受付／recorder終端を分離する契約。実装・運用値の承認は行っていない。

draft-0.6のレビュー修正: 接続済みの期限供給を「未実装」としていた§3と、実装の所在を訂正した。挙動は変更していない。

draft-0.5: [試行別結果の合成検証記録](E2E_BEST_PRACTICE_WFB_STORE_ATTEMPT_2026-11-05.md)を追加。`saveAttempt`が当該呼出し専用の凍結結果を返し、旧`save`はreceiptだけを返す互換入口とする。Store全体のfirst reasonと試行の主失敗／cleanup理由を分離し、bridgeはsnapshotから推定せず同じ戻り値を保持する。

draft-0.4: cleanup期限以降に返ったcloseの成功を、新しい状態`late`として示す（§3）。

draft-0.3: [recorder一度限り接続の差分設計](BEST_PRACTICE_WFB_STORE_RECORDER_BRIDGE_DESIGN.md)を追加。receiptの公開DATAを権限へ昇格せず、同生成元のprivate継続・共有期限／停止・試行別cleanup診断を結ぶ方針。既存fakeの挙動・未承認事項は変更せず、接続は未実装。

draft-0.2のレビュー修正: 入力長の検査とコピーの間にcallbackが入り、byte上限をすり抜けられた経路を閉じた。入力・再読の長さは実サイズで判定する。cleanup期限を超えて返ったcloseはconfirmedにしない。object以外の偽receiptも同じsticky失敗にする。

Status: **試験専用・メモリ内だけの実装。OS backend・実保存は未実装。recorderとはSB-B／試行別結果をfake接続済み。** 正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。保存先・保持期間・運用cap／時間枠・停止方式は未承認のまま。既存証拠のcopy／保管操作・再採取・実接続・実通信・設定変更・Pushを行わない。

親は[固定採取器契約](BEST_PRACTICE_WFB_FIXED_RECORDER_CONTRACT.md)§3。実装は`tests/review/fixtures/store-recorder-kernel.ts`（`fixed-evidence-store.ts`は再export）、合成driverと対照は`tests/review/fixed-evidence-store.test.ts`。[検証記録](E2E_BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_2026-11-04.md)と合わせて読む。

## 1 所有権・用途

- `FakeEvidenceStore`は同run token・root identity・明示cap・clockを保持する。生成口は試験専用で、実session／runtime／既存fixture台帳へ接続しない。複数storeの合算・唯一の生成claimはsession台帳の後続課題。
- run用の14固定slotだけを受理する。session票は別台帳のため受理しない。外部名・連番0／7・pathはcreate前に拒否する。manifestも今回の層ではopaque artifactであり、必須集合・発行順の証明にはならない。
- `EvidenceOps`は同期の単発境界。`identity`、`createExclusive`、`writeOnce`、`flushOnce`、`closeOnce`、`readBack`だけを持つ。real fs／path／process／fetchは実装しない。fakeのidentityは所有・祖先・symlink・ACL等の検査済み条件を抽象化するだけで、その実取得を検証していない。
- `createExclusive`は既存slotを変更せず拒否する。handleを返せない失敗では未回収resourceを作らないことがdriver側の前提。後続OS backendでは、失敗時の部分取得責務を別途具体化する必要がある。

## 2 一度限りsaveと固定順序

`save(run, slot, bytes)`は同storeの非再入区間で実行する。

1. 同run・固定slot・未claimを確認し、slotを先に消費する。以後の入力拒否・create失敗でも戻さない。
2. 入力がUint8Arrayでなければ`limit`で拒否する。長さは組込みgetterで実サイズを読み、subclassの申告を使わない。読めない偽インスタンスは`binding`。file／累積byte上限を確認し、予定byteを予約する。部分失敗でも返却せず、既存bytesへretry書込みし直さない。
3. 検査から**callbackを挟まず**、入力bytesをprivate copyにする。内部slotから複製し、subclassのiteratorは使わない。その同じcopyからSHA-256を計算する。最初のclock／root guardはこの後、create直前に行う。
4. 排他createを1回。得たhandleを保持し、writeは正の短書込だけoffsetを進める。EINTRはoffsetを変えず、retryを課金する。0・負・非整数・要求長超過・不明variantは拒否する。
5. 全bytes完了後にflushを1回、closeを1回。closeは呼ぶ前にattempt済みとし、throw／falseでも再試行しない。
6. 元handle・固定slot・上限を渡して再読する。fake driverは現在のslotが元handleに対応し、close済みであることを確認する。長さとSHA-256をprivate copy由来の期待値へ照合する。再読の実サイズが期待値と違えばhash前に拒否する。
7. 最終guard後だけ、同storeのWeakMapへprivate保存情報を結合したopaque receiptを発行する。byte本体はreceipt／診断へ出さない。

各単発境界の前後で同root・単調clock・停止を確認する。identity検査中に時間が進む場合も操作前に再検査する。同期callbackの再入はsticky失敗とし、外側の呼出しを成功へ戻さない。

直接排他作成したfake artifactを検証後receiptへ結び付ける方式で、staging／renameは使わない。実OSのno-replace publicationやdurabilityを実証したとは扱わない。失敗時のpartial bytesはメモリ内に残し、削除／上書き／別名fallbackをしない。

## 3 有限費用・cleanup

合成用構造上限はfile最大65,536 byte・累積最大1,048,576 byte・1artifact最大4096 write試行・EINTR retry最大16。正の明示file／総byte／attempt capと、0以上のretry capを要求する。**本番capではなく、未承認の運用値を採用していない。** retryと総試行を別々に制限し、retry=0なら最初のEINTRで停止する。

write試行数は最大attempt cap。create／flush／close／再読は各1回、slotは最大14。writeへは残りcopyを渡すためscratchはfile上限内だが、各試行のcopy累積費用は最大attempts×fileBytesである。OS・JavaScript heap・allocator／RSS・実messageの上界証明ではない。再読driver自身も要求limit以内の取得を行う前提で、過大allocationを後検査だけで防げたとはしない。

正常操作には同じ絶対`deadline`、失敗後cleanupにはそれより後の有限`cleanupDeadline`を明示する。途中で期限を再設定しない。DT-A以降、bound bridgeは元の外側予約から計算した固定2区分の表を同run／budget originへ結び、Storeへ供給する。`manifest.json`だけ後続manifest区分で、他の13名はevidence区分。save・receiptのpublic／private消費・通常／失敗closeは同じprivate rowを使う。旧単体入口だけは明示pairを維持する。時刻はsafe integer・開始点未満／逆行拒否、等値は期限切れ。厳密入力・算術・実装境界は[DT-A設計§8.1](BEST_PRACTICE_WFB_SLOT_DEADLINES_RECORDER_TERMINAL_DESIGN.md#81-dt-a実装境界)を参照。

取得済みhandleがまだclose未試行ならfinallyで最大1回closeする。元の停止理由を保持し、`cleanup=not_started／confirmed／late／unconfirmed`を別軸で示す。cleanup期限切れ・時計取得失敗なら操作を増やさずunconfirmed。close要求だけをconfirmedにしない。成功の返答がcleanup期限前に得られた場合だけconfirmedとする。等値・超過は`late`で、返答はあったが予約を超えたことを示す（通常closeも同じ）。`late`はconfirmedと同じ扱いにせず、時間予約内の解放の証拠にしない。失敗の返答、close後に時刻を読めない・時計が逆行した場合はunconfirmedのままとする。同期操作を途中で止める仕組みではないので、超過の実行自体は防げない。これもfake driverの返答であり、実FD解放の証明ではない。

## 4 receipt消費・診断

- `consume(run, receipt)`は同storeのprivate receiptだけを受理する。正当receiptはguard前に消費claimを取り、wrong run・取消・期限・post-guard失敗でも再利用できない。これらの失敗はstickyなので、消費と検査の順序は外部から観測できない。
- copy／foreign／JSON／値summary・object以外の値はreceiptにならず、同じsticky失敗にする。二重consumeは拒否する。成功時の固定slot・size・digestは凍結DATAで、別receiptや正式証拠へ昇格できない。
- 最初の失敗はsticky。以後の新規save／consumeを拒否し、slot／累積予約を戻さない。既に書いたartifactを上書きしない。cleanup失敗で先行reasonを置換しない。
- 診断は固定reason・数値・cleanup状態だけ。raw例外・入力byte・path・環境情報を反射しない。入力の予期しないaccessor例外も固定理由へ落とす。OOM等で必ず回収できる保証はない。
- 保存receiptは**artifact単位のfake照合結果**。公開consumeのDATAはack権限にならない。SB-Bの閉じたprivate継続ではcheckpoint ackへ接続するが、run全体のpreservation・manifest・session票や実ディスク耐久保存の証拠と呼ばない。

## 5 合成受入と残課題

固定SHA-256既知値（空／abc）、手書き操作順、offset列`[0,1,1,2]`と試行数を独立oracleに使う。collision、slot replay、名前拒否、入力copy、短書込、EINTR境界、byte／総試行上限、可変長バッファ・長さやiteratorを偽るsubclass・Uint8Array以外の入力、flush／close／再読のfalse／throw、同長hash不一致、長さ変更、handle差替え、root失効、取消、期限／逆行、再入（save中のconsume、consume中のsaveを含む）、receipt混入・post-guard停止、first reasonの保持、cleanup中のthrow・期限超過を確認する。

OS backend・metadata／ACL／symlink実取得、共有session claim／retry、manifest集合、実保管、全体process終端は後続。recorderへの一度限り受理はSB-Bのfakeのみで接続済み。今回の合成成功だけでR02／R03／R04／R07や再採取gateを満たさない。

## 6 呼出し単位の試行結果

本体は試験専用の共通`store-recorder-kernel.ts`、旧`fixed-evidence-store.ts`は再exportである。`saveAttempt(run, slot, bytes)`は`{ receipt?, attempt }`を返し、両方のcontainerを凍結する。`save`は同じcoreを一度呼んでreceiptだけ返す。独立した「最後の結果」slotは置かず、各呼出しのlocal recordをfinallyまで保持するので、再入拒否が外側の結果を上書きしない。

| disposition | 判定 | cleanup |
|---|---|---|
| not_started | create境界へ入っていない。入力／guard拒否・sticky拒否・busy再入を含む | not_started。前回の値を写さない |
| create_failed | createを1回試したがhandleを受領しなかった | not_started。driver側で隠れたresourceを作らない前提は未実証 |
| partial_unverified | handle取得後に保存証拠を発行できなかった | 当該handleのconfirmed／late／unconfirmed。0 byteでもこの区分で、書込完了やdurabilityを意味しない |
| saved | flush・close・再読・hash・post guardを通りreceiptを発行した | 当該handleのconfirmed。run全体の保全ではない |

固定fieldは`createAttempted`・`handleAcquired`・`closeAttempted`・`reservedBytes`、試行の`reason`・`rejection`、`cleanup`・`cleanupReason`。create／closeのflagは単発境界を呼ぶ直前に記録し、throwでも試行済みとする。cleanup予約切れ等でcloseを呼ばなければ`closeAttempted=false`かつcleanup unconfirmedとなる。

`reason`はこの保存の主失敗を保持する。既存sticky状態による拒否は`store_stopped`／`rejection=sticky`、busy再入拒否は`binding`／`rejection=busy`。Store全体の最初の理由は従来どおりsnapshot.reasonへ別保持する。cleanupのfalse／throwは`cleanupReason=close`、不正／取得失敗時刻はclock、予約超過はdeadline。cleanup失敗で主理由を置換しない。成功後やconsume失敗後の次の保存拒否も、新recordのcleanupはnot_startedである。

試行結果は限定DATAで、bytes・path・raw例外を含まず、receiptを新規生成／昇格する権限ではない。DT-Aのtable-modeでは選択済みの`deadlineClass`／`deadlineVersion`を追加する。busy／sticky拒否では選択自体がないので付加せず、legacy単体結果も変更しない。Store内部に呼出し履歴を無制限保持せず、bridgeは既存の最大6 slotへ同じ凍結resultを紐付ける。Storeからの戻り自体が得られない異常ではattemptを推定・捏造しない。recorder終端はDT-Bで合成接続し、通知throw／部分生成を含む固定連続対照・構造費目はDT-Cで確認した。任意呼出し列・OSの通知／解放・実時間／heap上界と実予算受付は未確認のままである。
