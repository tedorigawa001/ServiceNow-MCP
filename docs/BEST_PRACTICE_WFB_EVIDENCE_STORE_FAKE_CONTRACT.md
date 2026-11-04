# WF-B EvidenceStore：artifact単位の内部契約とfake

Version: draft-0.1 / Date: 2026-11-04 / 基準HEAD: `7f6ef4f`。

Status: **試験専用・メモリ内だけの実装。OS backend・実保存・recorder接続は未実装。** 正式発行口閉鎖・全体受付無効・Unknown・調査保留を維持する。保存先・保持期間・運用cap／時間枠・停止方式は未承認のまま。既存証拠のcopy／保管操作・再採取・実接続・実通信・設定変更・Pushを行わない。

親は[固定採取器契約](BEST_PRACTICE_WFB_FIXED_RECORDER_CONTRACT.md)§3。実装は`tests/review/fixtures/fixed-evidence-store.ts`、合成driverと対照は`tests/review/fixed-evidence-store.test.ts`。[検証記録](E2E_BEST_PRACTICE_WFB_EVIDENCE_STORE_FAKE_2026-11-04.md)と合わせて読む。

## 1 所有権・用途

- `FakeEvidenceStore`は同run token・root identity・明示cap・clockを保持する。生成口は試験専用で、実session／runtime／既存fixture台帳へ接続しない。複数storeの合算・唯一の生成claimはsession台帳の後続課題。
- run用の14固定slotだけを受理する。session票は別台帳のため受理しない。外部名・連番0／7・pathはcreate前に拒否する。manifestも今回の層ではopaque artifactであり、必須集合・発行順の証明にはならない。
- `EvidenceOps`は同期の単発境界。`identity`、`createExclusive`、`writeOnce`、`flushOnce`、`closeOnce`、`readBack`だけを持つ。real fs／path／process／fetchは実装しない。fakeのidentityは所有・祖先・symlink・ACL等の検査済み条件を抽象化するだけで、その実取得を検証していない。
- `createExclusive`は既存slotを変更せず拒否する。handleを返せない失敗では未回収resourceを作らないことがdriver側の前提。後続OS backendでは、失敗時の部分取得責務を別途具体化する必要がある。

## 2 一度限りsaveと固定順序

`save(run, slot, bytes)`は同storeの非再入区間で実行する。

1. 同run・固定slot・未claimを確認し、slotを先に消費する。以後の入力拒否・create失敗でも戻さない。
2. file／累積byte上限を確認し、予定byteを予約する。部分失敗でも返却せず、既存bytesへretry書込みし直さない。
3. clock／root guardの後、入力bytesをprivate copyにし、その同じcopyからSHA-256を計算する。
4. 排他createを1回。得たhandleを保持し、writeは正の短書込だけoffsetを進める。EINTRはoffsetを変えず、retryを課金する。0・負・非整数・要求長超過・不明variantは拒否する。
5. 全bytes完了後にflushを1回、closeを1回。closeは呼ぶ前にattempt済みとし、throw／falseでも再試行しない。
6. 元handle・固定slot・上限を渡して再読する。fake driverは現在のslotが元handleに対応し、close済みであることを確認する。長さとSHA-256をprivate copy由来の期待値へ照合する。driverが過大なbytesを返したらhash前に拒否する。
7. 最終guard後だけ、同storeのWeakMapへprivate保存情報を結合したopaque receiptを発行する。byte本体はreceipt／診断へ出さない。

各単発境界の前後で同root・単調clock・停止を確認する。identity検査中に時間が進む場合も操作前に再検査する。同期callbackの再入はsticky失敗とし、外側の呼出しを成功へ戻さない。

直接排他作成したfake artifactを検証後receiptへ結び付ける方式で、staging／renameは使わない。実OSのno-replace publicationやdurabilityを実証したとは扱わない。失敗時のpartial bytesはメモリ内に残し、削除／上書き／別名fallbackをしない。

## 3 有限費用・cleanup

合成用構造上限はfile最大65,536 byte・累積最大1,048,576 byte・1artifact最大4096 write試行・EINTR retry最大16。正の明示file／総byte／attempt capと、0以上のretry capを要求する。**本番capではなく、未承認の運用値を採用していない。** retryと総試行を別々に制限し、retry=0なら最初のEINTRで停止する。

write試行数は最大attempt cap。create／flush／close／再読は各1回、slotは最大14。writeへは残りcopyを渡すためscratchはfile上限内だが、各試行のcopy累積費用は最大attempts×fileBytesである。OS・JavaScript heap・allocator／RSS・実messageの上界証明ではない。再読driver自身も要求limit以内の取得を行う前提で、過大allocationを後検査だけで防げたとはしない。

正常操作には同じ絶対`deadline`、失敗後cleanupにはそれより後の有限`cleanupDeadline`を明示する。途中で期限を再設定しない。recorderの外側予約からこれらを供給する接続は未実装。時刻はsafe integer・逆行拒否、等値は期限切れ。

取得済みhandleがまだclose未試行ならfinallyで最大1回closeする。元の停止理由を保持し、`cleanup=not_started／confirmed／unconfirmed`を別軸で示す。cleanup期限切れ・時計取得失敗なら操作を増やさずunconfirmed。close要求だけをconfirmedにしない。これもfake driverの返答であり、実FD解放の証明ではない。

## 4 receipt消費・診断

- `consume(run, receipt)`は同storeのprivate receiptだけを受理する。正当receiptはguard前に消費claimを取り、wrong run・取消・期限・post-guard失敗でも再利用できない。
- copy／foreign／JSON／値summaryはreceiptにならない。二重consumeは拒否する。成功時の固定slot・size・digestは凍結DATAで、別receiptや正式証拠へ昇格できない。
- 最初の失敗はsticky。以後の新規save／consumeを拒否し、slot／累積予約を戻さない。既に書いたartifactを上書きしない。cleanup失敗で先行reasonを置換しない。
- 診断は固定reason・数値・cleanup状態だけ。raw例外・入力byte・path・環境情報を反射しない。入力の予期しないaccessor例外も固定理由へ落とす。OOM等で必ず回収できる保証はない。
- 保存receiptは**artifact単位のfake照合結果**。recorderのcheckpoint ack／preservation軸へ接続せず、run全体の保全・manifest・session票や実ディスク耐久保存の証拠と呼ばない。

## 5 合成受入と残課題

固定SHA-256既知値（空／abc）、手書き操作順、offset列`[0,1,1,2]`と試行数を独立oracleに使う。collision、slot replay、名前拒否、入力copy、短書込、EINTR境界、byte／総試行上限、flush／close／再読のfalse／throw、同長hash不一致、長さ変更、handle差替え、root失効、取消、期限／逆行、再入、receipt混入・post-guard停止を確認する。

OS backend・metadata／ACL／symlink実取得、共有session claim／retry、manifest集合、recorderへの一度限り受理、実保管、全体process終端は後続。今回の合成成功だけでR02／R03／R04／R07や再採取gateを満たさない。
