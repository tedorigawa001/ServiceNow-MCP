# BP-5 R-2 OL-03：3round resource台帳の詳細設計

Version: draft-0.15 / Date: 2026-10-21 / Status: 固定collectorから最終clock・typed strict ackまで合成検証。通常strict接続は未実装、運用上限は未承認。

## 1. 範囲と停止状態

[estimate消費型bridge](BEST_PRACTICE_BP5_R2_OL03_ESTIMATE_BRIDGE_DESIGN.md)と[現行collector費目設計](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md)に続き、Initial／BeforeM4／AfterM4の3roundが消費する独立resourceの会計を定義する。基準は `fad0749`。現行の `scan_ops.rs`、`normalized_metadata.rs`、`child_set.rs`、`collector.rs`、`profile.rs`、`strict.rs` と[単一bridge合成記録](E2E_BEST_PRACTICE_R2_OL03_ESTIMATE_BRIDGE_SYNTHETIC_2026-10-21.md)を照合した。外部仕様やOS APIを調査する工程ではない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持する。初稿は設計のみで、§14/15の数量計算、§16のsession状態subset、§18の内部会計を追加した。OS接続・実機操作・token発行・設定変更・本番policy投入・permit発行を含めない。運用quotaの数値を新しく承認せず、設計完了や内部binding成功を実行権へ変換しない。

前工程の740テストは単一bridgeまでの合成検証であり、本書のsession台帳の検証成績ではない。workは課金ブロック、operationは単発source契約の試行であり、CPU時間・RSS・OS syscall数・hard期限の保証ではない。

## 2. 現状と変更対象

| 現行 | 本設計で追加するもの |
|---|---|
| `with_boundary` がscanごとに新しいLedgerを生成し、呼出し側から合成Quotasを受ける | 同一inspectionを通じて残るsession会計。roundローカルなresource identity・pending readは引き続き分離 |
| work100万・payload2GiB・startから10秒・EINTR残は元SharedBudgetを共有 | 再発行しない。session台帳はこれらの第二の消費元を作らない |
| attempts[Open/Enum/Read/Metadata/Cleanup]、names、live/peak、cleanup予約をscan内で管理 | round枠とsession累積枠の両方をsource操作前に検査する |
| `Summary.names` / `Quotas.name_bytes` はmetadataのxattr名コピー量 | `xattr_name_bytes` と意味を明示。directory列挙名やpath確保量を含むと解釈しない |
| `ClosureSource::scan` を使う通常strictは完全collectorへ未接続 | 通常strictの型付きadapterとcleanup証拠伝播は後工程。本書で旧traitへ数値だけを渡さない |

現行の `attempts[j] <= 1_000_000`、`live <= 132` は単一boundaryの構造的上限であり、運用quotaの承認値でもsessionへ3倍付与する根拠でもない。未知の上限・producer・費用を0や無制限で代用しない。

## 3. 内部型・binding（擬似契約）

以下は最終形の内部契約案であり、公開API・JSON schemaではない。状態/bindingは§16、内部累積会計は§18、固定collectorのsession経路は§19で実装した。通常strictと完了証拠は未接続である。

| 型 | 契約 |
|---|---|
| `ScanSessionLedger` | inspection ownerが一度だけ作る非Clone/非serdeの所有型。予算origin、元started、receipt/target/contextの由来、固定model、進行状態と累積量を保持 |
| `RoundResourceScope` | 同sessionへの短期・排他的borrow。現在のRoundScope object/tokenと固定round slotへ結合し、同時に2個のactive scopeを作らない |
| `RoundLocalLedger` | source/handleのidentity、serial、pending read/宣言、当該roundの消費・予約・liveを保持。前roundのresourceを次roundへ持ち込まない |
| `ResourcePolicy` | 保護されたproducerが固定modelと共に供給する承認上限。ScanWorkEstimateから生成しない。未提供/未知modelはUnavailable |
| 終了証拠 | round差分とsession累積量、cleanup状態・有限理由のみ。Observation・再試行権・permitを含めず、実行条件へ再入力しない |

session生成には元inspection owner側のone-shot claimが必要。同じreceipt/budgetから別sessionを作り、残を満額へ戻す経路を設けない。§16でbudgetに残るclaimを実装したが、実receipt/context/budgetの保護されたproducerは未接続で、内部constructorだけで運用上の由来が成立したことにはしない。

bindingは、元SharedBudgetの `inspection_origin` のRc identityと元started、同RecordReceipt/lineage、同target/contextへのborrow、同固定collector/resource modelを要求する。同じhash/generation/path文字列だけでは代替しない。receiptのrecord binding（release/generation/index/registry等）は既存strict再読/照合で毎回検証し、変更された値へsessionを再bindしない。

round開始時は同RoundScope object/token、同宣言、元session originを検査する。同名roundの新tokenへの再発行、別receipt/target/budget/startへの持込み、sessionコピー、入力数値からの復元は禁止。Debugは固定opaque labelとし、pointer・path・code・資格情報を出力しない。

## 4. 台帳の種類と所有

| 資源 | 会計単位 | 予約・消費・上限 |
|---|---|---|
| source attempts | Open/Enum/Read/Metadata/Cleanupの5分類、roundとsessionの累積 | 成功だけでなく失敗・Interrupted・拒否に至る最後のsource試行も含む。消費を返金しない |
| cleanup予約 | 未処理解放試行の個数 | acquire前に1枠予約。成功handleへ移譲し、Dropで一度だけ実消費。累積cleanup実消費と未使用予約を分ける |
| live owner / acquire中予約 | 同時数とsession peak | Anchor/Directory/File/Cursor/Aclを区別して所有。3roundのpeakを加算しない。種類別内訳なしにOS FD数と呼ばない |
| xattr名bytes | round/session累積 | 実コピーbytesを計上。最大64KiBのbuffer capacityをI/O前に照合し、遅延/不正応答も既存方式でboundedに会計 |
| directory列挙名 | enum試行・最大255byte buffer | 現行namesへ混ぜない。単発bufferはbounded。総コピー量を別枠にするかはpolicy/操作上界設計で明示し、未計数なら運用受付不可 |
| payload bytes | 元SharedBudgetのused/reserved | 成功bytesを同じbudgetへ一度だけ加算。session側に控除可能な複製枠を作らない。失敗EOF probeの実bytesも保持 |
| retry | 元SharedBudget.retries_left | session開始時r0を記録。read/EOFの合法EINTRだけが元残を消費し、round切替で補充しない |
| 管理allocation | count配列・groups・route・observed・hash/name buffer等 | 同時寿命/最大数の別設計が必要。live owner数やworkだけでmemory受付済みにしない |

失敗source試行で返却handleがないこと、hidden retry/open/refill/成長allocationがないことはScanOps契約の前提である。native syscallへの1対1対応やOS内部bufferは未検証。

## 5. 累積枠と3round配賦

固定slotは0=Initial、1=BeforeM4、2=AfterM4とする。policyはsession capと各slotのround capを別に持ち、両方を満たす場合だけ操作できる。未使用round枠を自動的に別roundへ移譲せず、session残もround境界で再初期化しない。

各分類jのsource試行前に、checked算術で次を確認する。cleanup以外の通常試行は、**現在slotのround累積とsession累積の両方**を一体で更新し、他slotのround累積は更新しない。Cap不明はUnavailable、overflow/不足はLimit、binding/順序違いはBinding。

```text
round_used[j] + 1 <= round_cap[slot][j]
session_used[j] + 1 <= session_cap[j]
```

総操作数上限を採用する場合は5分類和もchecked算術で検査し、cleanup予約まで含めて二重の枠を保持する。分類別capの単純合計を承認済み総capとみなさない。

配賦に使う上界は現行の固定collector scheduleに結合した新しいresource submodelとして導出する。現在の識別子は `bp5-r2-scan-resource-0.2`（§14/15の純粋数量計算のみ実装、配賦/運用は未承認）。旧 `bp5-r2-scan-work-0.1` の仮定係数・予定操作式を認証として流用しない。work用profile/estimateは操作quotaを発行せず、必要統計の追加・収集費も別途モデル化する。

概念式は次のとおり。数値係数は後続のsource操作別計数・独立oracle検証が終わるまで未確定とする。

```text
U_session[j] = sum(U_round_base[slot][j], slot=0..2)
             + U_shared_retry[j](r0) + U_global_terminal_tail[j]
```

各baseには固定祖先walk/rewalk・snapshot・列挙・read/EOF・cleanupを含める。成功より長い拒否prefixも覆う。共有retryは全sessionで最大r0回、枯渇等の最後の異常試行は失敗で全工程が停止することを前提に一度だけ計上する。tailを各baseに含めた場合は再加算しない。read以外はEINTR/WouldBlockを再試行しない現行契約を維持する。

### 5.1 round枠のretry/tail収容（2026-10-21、レビュー）

共有retryはsession全体で最大r0回だが、どのroundで発生するかは事前に決まらない。正当なEINTRがr0回すべて1つのroundへ集中し得るため、round枠を `U_round_base[slot][j]` だけで作るとそのroundのRead枠が先に尽き、正しい動作をLimitで拒否する。最後の異常試行（terminal tail）も発生roundを事前に特定できない。従ってround枠の必要量は次とする。

```text
round_cap[slot][j] >= U_round_base[slot][j]
                    + U_shared_retry[j](r0) + U_global_terminal_tail[j]
session_cap[j]     >= U_session[j]   # retry/tailは1回だけ
```

- round枠の総和はsession必要量より約 `2×(U_shared_retry[j](r0)+U_global_terminal_tail[j])` 大きくなる。これは二重付与ではなく、session枠がretry/tailを全体で1回分に抑える。round単位の余裕を他roundへ移譲しない§5本文の方針とも両立する。
- 各roundの検査はround枠とsession枠の**両方**で行うため、round枠の余裕だけで共有retryを各roundへ再付与したことにはならない。retry以外の分類でtail分の余裕を持たせる場合も同じ規則を使う。
- 次roundのfresh profileは減ったrを読むが、round枠の必要量は保守側（session開始時のr0）で固定してよい。減ったrに合わせてround枠を縮める場合も、session枠と実消費を巻き戻さない。

capはこの必要量を収容できる承認policyでなければならないが、上界が小さいことだけでcapを承認しない。将来roundの予測から実消費を差し引いて枠を復活させず、実施済みの固定phaseだけを予定から除外する。

## 6. 同時最大数・cleanup予約の遷移

acquireにはOpenだけでなくMetadata分類のACL initも含む。dispatch直前に、round/sessionの通常試行枠に加え、両方のcleanup枠・live枠を確認する。

```text
cleanup_used + cleanup_reserved + 1 <= cleanup_cap
live_owned + live_reserved + 1 <= scan_live_cap
```

cleanup枠は§5と同じく**現在slotのround枠とsession枠の両方**でこの式を検査し、予約・実消費も両方へ一体で計上する（round_cleanup_used/reservedとsession_cleanup_used/reserved）。live枠は同時数であり累積ではないため、roundとsessionで同じ現在値を検査し、peakはmaxで記録する。

運用では `outer_held_owners + scan_live_owned + scan_live_reserved` がrole全体の承認された同時上限へ収まる必要もある。target/record/topology側の保持量・余裕は保護されたcontextから得る設計が別途必要で、不明なら運用開始しない。scanの既存132をそのままrole余裕とせず、peak×3にも変換しない。

1. checkedな候補値と全枠を検査し、元budgetへdispatch/cleanup分をprechargeする。新しい台帳処理のwork費は§10で別評価する。課金中停止ならsourceを呼ばず、spent workは返さない。
2. round/sessionの試行消費・cleanup予約・live予約を一体でcommitする。片側だけを書き換えた後で失敗する構造にせず、source呼出し中にRefCell等のborrowを保持しない。
3. handleを返したらpost-operation checkpointより先にRAII ownerへ移す。live予約をlive所有へ変換し、cleanup予約は保持する。遅い成功でも必ずownerが解放する。
4. handleなしの失敗では未使用cleanup/live予約だけを取り消す。試行消費とworkは返金しない。成功を装って返却されないresourceはsource契約違反で、台帳だけでは救済しない。
5. Dropは予約済みcleanupを一度だけ試行し、cleanup_reservedをcleanup_usedへ変換する。取消/期限/work不足で解放を省略しない。数値FDへの再close/retryは禁止。
6. 解放未確認ならunconfirmedを永続記録して停止する。Rust ownerが手放されたためlive_ownedが0になっても、OS上の解放や容量回復を証明したとは扱わない。次のacquire/roundへは進ませない。

複数のownerはそれぞれ自分のprepaid cleanupを続けるが、新しいresource取得は停止する。summaryはsessionへの加算源ではなく既に課金した差分の証拠とし、round完了時に同じattempts/namesを二重加算しない。

## 7. round順序とone-shot

提案状態は `ExpectInitial → Active(Initial) → AwaitStrict(Initial) → ExpectBeforeM4 → Active(BeforeM4) → AwaitStrict(BeforeM4) → ExpectAfterM4 → Active(AfterM4) → AwaitStrict(AfterM4) → Finished`。どの段階からも失敗はterminal `Stopped`。rollback/reset/resumeはない。

- round入口は元sessionの試行状態を最初のfallible guardより先に消費する。別session/別slotの状態を書き換えない。開始途中の取消・期限・binding不一致でも同slotをやり直さない。
- 同じroundの重複、AfterM4先行、slot飛越し、並行active、Finished後の追加開始、Stopped後の再入場をsource操作前に拒否する。
- scope/tokenはActiveの間だけ有効。resource/pending read/未完了宣言がround外へ逃げるAPIを設けない。
- bridge成功かつlive/予約/unconfirmed/pending retry/宣言残がすべて0の場合だけAwaitStrictへ移す。bridge単体では次roundを許可しない。
- 次slotへの進行は同じround/phaseのAfterScan→record/path/metadata/time再読→strict record検証→FinalIndex/clockの成功に結合する。caller指定boolや任意の「完了」methodでは進めない。
- BeforeM4とAfterM4の位置は既存 `compare_topology` のcallbackと復帰位置に固定する。台帳がround番号を順に消費しただけで、M4を実施済みとはしない。

通常strict接続では、このAcknowledgementを既存の型付きphase ownerから一度だけ渡す内部契約が必要である。本書ではそのAPIを実装せず、旧ClosureRequestにsession ID文字列だけを追加して代替しない。

## 8. 共有retryとpayload

read/EOFは同resource serial・同offset/length/eofのpending requestだけを再試行できる。EINTR1回ごとに元SharedBudgetのretry残を1減らし、attempts[Read]のround/session枠も1消費する。session開始時r0は会計の上界用であり、各roundへr0を配る値ではない。

pending requestがある間は別操作・別resource・次roundを拒否し、retry枯渇・取消・期限・短読取・異常応答で停止する。scope終了時のpending retryを消して成功に戻さない。合法EINTR後はrが減るため、scan終了時に入口rとの等値を要求しない。次roundのfresh profileは同budgetの減った残を読む。

payloadは全3scan・target A/B・record等で元のused/reservedに従う。既存予約を押し退けず、read直前に要求長が入ることを確認し、応答後の実bytesを一度だけ加算する。成功EOFは0bytesでもread試行を1消費する。異常EOF/短読取でコピー済みのbytesを返金しない。record等の既存会計をsessionから再加算しない。

## 9. 失敗時停止・終了証拠

| 条件 | 主理由と扱い |
|---|---|
| 元budgetのsticky失敗・取消・期限 | 既存の最初の理由を維持し、sessionもStoppedへ。新scope/予算を作らない |
| receipt/budget/start/token/round/状態違い | Binding。数値generation等の実変更は既存strictのChangedを保持 |
| policy未提供/未知model/取得不能 | Unavailable。fallback・満額補充なし |
| 累積/同時枠不足・checked overflow | Limit。source操作前に停止、予約済みcleanupは継続 |
| hash/metadata/path/集合/short read等 | 既存Failureを保持。後続strict phase/roundへ進めない |
| cleanup不明・未解放/予約残 | 成功禁止。先行理由がなければUnavailable、既存理由があれば上書きせずcleanup不成立を別保持 |
| pending retry・未完了宣言 | 現行のReadFailed/Changedを維持し、停止/解放を実行 |

NotStartedとCollectedを区別し、前者に架空のcleanup完了票を作らない。Collectedの既存summaryとsession差分/累積を保持し、resultだけをResultへ変換して証拠を捨てない。bridgeの終端checkpointで成功を破棄した場合も同じ規則を使う。

roundローカルなowner破棄とsession終端後も、unconfirmed/停止理由を消さない。hostの終了票・cleanup_incomplete・強制停止への接続は別設計で、台帳が0になったことをOS終了確認と同一視しない。

## 10. 費目所有・model更新

現行kernel S1902、O.use7、O.dispatch1、単一bridge1910、profile/計算込み1991は変更前の合成基準値である。session照合・累積枠検査・予約commit・終端集約を追加してもこの値を無条件に維持すると約束しない。

- session生成/round開始・終了・strict acknowledgementはO側へ新しい課金点を設計する。
- 各source試行の追加会計はS側のどの分類が所有するかを固定し、cleanupのworkは取得時prechargeで覆う。Drop時に停止済みbudgetへ新workを要求しない。
- 単一dispatchの既存課金へ新しい可変長走査やsession集計を隠さない。固定配列5分類以外のiteration、合計算術、allocationも明示する。
- collector/kernel/resourceの実処理が変わる場合は関連model/係数と独立oracleを改版し、旧estimateで新kernelを通さない。guard7/入口guard1の費用変更も必要なら別途記録する。

現在のwork上界による実閉包規模の試算は3round約1,160万〜1,165万で、元100万を超える。resource台帳完成はその問題を解消しない。未知のI/R/O・allocation・OS費を0にせず、[全体受付設計](BEST_PRACTICE_BP5_R2_OL03_TOTAL_WORK_ADMISSION_DESIGN.md)の全体受付は無効のままとする。

## 11. 全接続時の合成テスト受入条件（部分検証済み、未接続項目を含む）

1. 同receipt/budget/startで3roundを順に実行。各round残があってもsession総枠の境界±1で停止し、次roundでattempts/xattr/cleanup消費がresetされない。cleanup枠もround/sessionの双方の境界±1で検査する。正当なEINTRをr0回1つのroundへ集中させても§5.1のround枠内で成功し、session枠を超える追加retryは拒否されることを確認する。
2. 別receipt/target/context/origin/start/token、新sessionでの再開、同名roundの新scope、重複/飛越し/並行/Finished後/Stopped後をsource呼出し0で拒否。
3. acquire前のcleanup/live枠不足はopen/ACL initを呼ばない。失敗acquireでは未使用予約のみ戻り、試行とworkは保持。成功/遅延成功はpost-guard前にowner化。
4. 全source失敗点・cleanup不明点で、全ownerが一度だけ解放を試行。取消/期限/work不足でもprepaid cleanupが走り、先行理由とunconfirmedが両方残る。
5. 3roundのpeakはmaxでありsumでない。他ownerを含む同時枠不足・予約中境界・解放未確認時の容量再利用禁止を検査。未取得枠だけの解除を累積返金と誤らない。
6. data/EOF両方で共有r=0/1/8、複数roundに跨る分割消費、枯渇後の最後の1試行、pending request違い/低水準迂回を検査。
7. xattrの0byte応答用1byte probe、64KiB境界、不正/遅延応答、コピー後停止を検査。directory列挙名とxattrの枠を混同しない。
8. payloadの既存予約を保持し、3scanの再読分を計上。EOF0、短読取/異常応答・遅延成功の実bytesを保持し、二重課金/返金なし。
9. bridge成功だけでは次roundが開かず、AfterScan・record再読・FinalIndex・clockのどこかで失敗すると後続source操作0。cleanup不成立のsummaryも外側へ保持。
10. checked overflow・未知model・未提供cap・全不足prefix、算術/新guard課金中の取消/期限を検査。操作計数の独立oracleと費目別auditで新しい上界を照合する。

synthetic policy/context/sourceはtest専用とし、運用producerの承認へ昇格させない。合成上の操作数/owner解放とOS syscall/FDの実証を分ける。

## 12. 実装順・承認待ち

1. 現行collectorに対応するsource操作別費目・必要shape統計・拒否tailを導出し、純粋resource上界と独立oracleを合成検証する。
2. session内部型・唯一の生成claim・round順序/binding・停止理由を合成resourceで実装する。運用capは投入しない。
3. round/sessionの累積会計・cleanup/live予約・summaryの移動を固定collectorへ接続し、新しいwork所有/modelを計数する。
4. 通常strictの型付き開始/acknowledgement/終了証拠契約を別途設計し、前後厳密照合を維持した合成経路だけへ接続する。
5. 全体I/R/O・独立resource・管理allocation・承認producerを合算して審査する。OS接続・受付有効化・permitは別承認である。

**接続時の寿命制約（2026-10-21、レビュー）**：実装済みのScanSessionLedgerは `Finished` 以外でdropされると、claim経由で**同じinspectionのSharedBudget全体**を停止させる（安全側）。上記3〜4の接続では次を満たす必要がある。

- ledgerの寿命は3roundとその後続phase（AfterScan、record再読/clock/strict検証、M4/topology、FinalIndex）を全て覆う。具体的には `review_strict_record_target` 全体をownerの寿命とし、途中のhelper/closureへmoveして早期dropさせない。
- `Finished` への遷移は、AfterM4のstrict acknowledgement（FinalIndex/clock成功）を受けた後だけに限る。bridge成功・round順序の消化・M4到達だけでは遷移させない。
- 各roundの `RoundResourceScope` は、bridge成功とcleanup証拠（live/予約/unconfirmed/pending retry/宣言残が0）をもって完了扱いにしてからdropする。そうしない場合は正常経路でもsession全体が停止する。完了setterは型付きの証拠からだけ呼べる内部契約とし、boolの外部設定口を設けない。
- ledger生成後に従来の非session経路（session不要のcollect/strict等）を同じbudgetで実行すると、ledger放棄後は停止理由が伝播する。統合後は同inspection内の経路をsession経由へ揃える。

未確定：各運用cap/総操作枠、role側の保持resource内訳、列挙名総量の別枠、管理allocationの同時上界、実collector接続後の新会計work上界、strict acknowledgementの正確なRust寿命、hostへのcleanup証拠伝播。唯一生成claimは§16、内部会計費は§18まで具体化した。実sourceの内部操作/blocked I/O、system祖先policy、更新lease/ABA/全検査後差替え対策は別の停止課題である。

## 13. draft-0.1作成時の文書検証（履歴）

文書更新のみ。新規本書と親3文書の相対リンク先55件、fence対応・末尾改行・末尾空白・diff checkを確認し、変更対象がMDだけであることを確認した。簡易リンク検査の初回実行ではコードブロック内の `U_shared_retry[j](r0)` をリンクとして誤認したため、コードブロック/inline codeを除外する検査へ改め、数式と実リンクを区別する回帰入力も通した。節anchor内容まで自動照合したものではない。

コード実装・Rustビルド/試験の再実行は行っていない。本書の実装試験が未実施であることは§11のとおり。

## 14. 純粋resource数量計算（draft-0.3、最初の実装subset）

`scan_ops/resource_model.rs` は固定scalar Shapeから数量だけを返す。ShapeはE/F/D/h/K/C/L（virtual index込み）で、入力の整合・範囲・checked算術を検査するが、受理済み宣言の由来や個々のfile上限は証明しない。保護されたprofile/receipt/round/sessionへの結合、統計収集費は未実装。数量出力をResourcePolicy/Quotas/permitへ変換する口はない。Debugは数量や内部情報を含まない固定labelとする。

現行kernelと独立literalでmodel照合し、通常成功経路の操作上界を次とする。T=D+1、W=2E+3、A=W(h+1)+2Kとする。Wの3はroot初回walk・rewalk・最終rewalk。OはACL以外のopen、Mは完全snapshot数である。

```text
O = A + T + E
M = A + E + 2T + 2F + 1
base[Open, Enum, Read, Metadata, Cleanup]
     = [O, E+3T, C+F, 9M, O+M]
```

Eは列挙childのopen/snapshot、Tはcursor open、2Tはcursor/親事後snapshot、2Fはbind/EOF後snapshot、末尾1は保持root最終snapshot。ACL initはMetadataに含み、各snapshotはMetadata9試行とACL cleanup1を使う。dot/dotdotが両方返る場合を含む列挙上界で、常に同じ実測件数になるという意味ではない。

round分類別上界はbaseにEnumの異常yield1、Readの共有残r＋最後の異常試行1を加える。3round分類別上界は3baseに同じtail/rを一度だけ加える。総試行上界はそれぞれ `sum(base)+r+1`、`3sum(base)+r+1`。EnumとReadのterminal異常は同じ実行では両方発生しないため、分類別上界の和より総上界が1小さい。session実装時は総枠・各分類枠・cleanup予約を独立して同時に満たす必要がある。

初版resource-0.1はsnapshot1回のxattr出力capacity上界64KiBをM/3M倍していた。resource-0.2では§15の停止不変条件を用いて `21(M−1)+65536` / `21(3M−1)+65536` へ引き締めた。enum出力capacity総量 `enum_three×255`、payloadの保守上界 `3(L+F)`、scan内peak owner上界5は変更しない。enumの値は実コピーbytesの台帳ではない。peak5はrootを保持しながらleaf/cursor/child/ACLを所有する現行逐次scheduleの上界で、OS FD・外側owner・管理memoryを含む承認値ではない。3roundでも15へ加算しない。

計算自体は元SharedBudgetへ固定9 work（model/domain/walk/snapshot/base/round/three/bytes/publication）を課金し、各行の前後/終端checkpointとsticky停止を維持する。ループは5分類の固定長だけ。collectorの既存SやO.use/O.dispatchは変更せず、この算術費を今後のO側に別計上する。runtimeのraw Shape入力を保護された統計とみなさず、由来を持たない出力を受付へ使わない。

基本fixtureはO=63、M=73、base=`[63,14,6,657,136]`、計876操作。r=8ならround分類別=`[63,15,15,657,136]`、3round分類別=`[189,43,27,1971,408]`、総上界885/2637。これは必要量でありcapの承認・予約ではない。3roundに1回の合法EINTRを含む実測2629操作もこの数量内に入る。

新規10テストでwide u128 oracle、overflow、未知model/不正shape、全不足work prefix、9課金点の取消/行終端期限、10 shape×3round実操作、876点の失敗/解放不明/取消/期限注入、data/EOF retry、共有rの3round経路を確認した。[数量モデル合成記録](E2E_BEST_PRACTICE_R2_OL03_RESOURCE_MODEL_SYNTHETIC_2026-10-21.md)を参照。この数量計算の時点ではsession台帳・caps配賦・唯一claimは未実装だったが、後続§16/18に内部subsetを追加した。strict acknowledgement・OS sourceは未実装。

## 15. xattr上界の停止不変条件とresource-0.2

前提は、正規化成功したnames一覧が空0 byteまたは `com.apple.provenance\0` の21 byteだけであり、それ以外・不正応答・取得失敗ではstickyに停止して次のNamesReadへ進まないこと。コピー後に同snapshotのsize再確認等を行う場合はあるが、未知一覧を受理して次のsnapshotへ進む経路はない。失敗後に後続roundも停止する§7/9の契約が3round上界の前提である。

N回までsnapshotを試行するとき、成功prefixの実コピー量は最大21(N−1)。最後の1回だけ、size queryに基づいて最大65536 byteのbufferを要求し得る。現行の枠検査は `names_used + max(declared_size,1)` を読取前に行うため、コピー実消費とこの事前capacity要求の両方を次で覆える。

```text
Q(N) = 21(N−1) + 65536    # N>=1、checked算術。N=0はBinding
xattr_round = Q(M)
xattr_three = Q(3M)       # 全sessionのterminal大コピーは1回。3×Q(M)ではない
```

基本fixture M=73は1round 4,784,128→67,048 byte、3roundは70,114 byte。規模例M=137,538は1round 2,953,813 byte（約2.95MB）。最終snapshotも成功する場合は21N以下で、この必要枠内に入る。これはcapacityを64KiBへ縮小する変更ではなく、累積上界の引締めである。

normalizerの実受理文字列を `ALLOWED_NONEMPTY_NAMES` へ集約し、`bp5-r2-scan-xattr-names-0.1` と共有capacity定数を数量モデルの前提へ結合した。モデルは固定のpolicy ID・受理文字列（NUL込み21 byte）・65536上限と照合し、変化したらUnavailable。resource-0.1入力も拒否し、出力契約をresource-0.2へ改版した。実kernelの操作/受理動作は変えないのでcollector-work-0.1は維持する。

許可一覧追加/変更、受理最大bytes拡大、capacity変更、未知名を許容して継続、停止後の再scan/次round許可、NamesReadのhidden retryを導入する場合は、前提を再審査しnormalization policyとresource modelを改版する。ID/定数照合だけで将来の制御フロー変更を自動的に証明できるとはしない。

追加2テストと既存oracle拡張でQの境界/overflow/旧model・policy変更拒否、成功prefix0/1/72件＋最後の未知64KiB、capちょうど/1byte不足、コピー後の再snapshot禁止を確認する。3roundの共有台帳そのものは未実装であり、Q(3M)のruntime強制を試験済みとはしない。

## 16. session状態内部型・唯一生成claim（draft-0.5）

`round_declaration/session.rs` に非Clone/非serdeのScanSessionLedgerと、台帳への排他的borrowを持つRoundResourceScopeを追加した。固定state modelは `bp5-r2-scan-session-state-0.1`。生成時はresource-0.2/collector-work-0.1の固定IDとも照合する。操作/cleanup/names等の数量・残枠はまだ保持せず、ResourcePolicy/Quotas/collectorへ渡す口もない。

### 16.1 budgetに残る唯一claimと停止理由

SharedBudgetがprivate `Rc<ScanSessionClaim>` を1つ所有し、started Cellとfailure Cellを持つ。createは最初のfallible workより前にstartedをreplace(true)し、失敗・drop・完了後も解除しない。同budgetからの2個目はBinding、先行stickyがあれば元の理由で拒否。session自身のboolだけにclaimを置かず、台帳をdropして生成権を回復させない。

SharedBudget::stopはclaim開始後の最初の理由も保存する。未完了ledger/round scopeのDropは新しいworkやI/Oを行わず、共有cellへUnavailable（既存理由があればその理由）を保存する。Dropはmutable budgetを借りていないため、その時点でbudget.failedがNoneの場合もあるが、次の既存checkpoint/workがcellを読み停止をラッチする。新たなsource操作の前の既存guardを迂回してよいという意味ではない。

claim未開始のbudgetは従来のsticky規則を維持する。新規budgetの固定claim storageを追加したが、CPU/RSS/allocatorの保証や保護されたinspection生成の証明は行わない。別budgetを外側で作り直してinspectionを再開する権限は与えず、その運用producer自体は後工程である。

### 16.2 同receipt/budgetとroundへの結合

sessionは元receipt/target/contextへのborrow、lineage/origin/claimのRc identity、元started、固定modelを保持する。beginは期待slotの状態を最初のfallible処理前に一旦Stoppedへ消費し、全guard成功後だけActiveへ移す。先行停止・budget不足・binding不一致で元状態へ戻さない。

beginは同receipt/target/context object、同lineage、RoundScopeのbudget originと元budget origin/claim/start、期待roundを検査する。同じ内容の別objectや、originだけをコピーした新budgetは拒否する。Active scopeのrequireは同じRoundScope object/tokenも要求し、同tokenをコピーした別scopeさえ受け付けない。使用tokenは固定3slotへ保持し、後続roundで前tokenを再利用することも拒否する。

順序はInitial→BeforeM4→AfterM4。Active/AwaitStrict/Finished/Stoppedの再begin、飛越し、重複を拒否する。排他的borrowで通常の並行beginを型でも阻止するが、専用compile-fail試験は未実施。失敗理由とclaimは継続し、同slot/別sessionを作り直すreset APIはない。

### 16.3 完了遷移はまだ開けない

本番コンパイルにはActiveからAwaitStrictへ進めるproducer、strict acknowledgement、Finishedへ進めるsetterを追加していない。未完了scopeを単にdropするとStoppedになる。cleanup/phaseの証拠なしに「成功」を自己申告して次slotを開けるAPIは提供しない。

3roundの正方向テストだけがprivateなcfg(test) fixtureでscan完了/strict acknowledgementを模擬し、AwaitStrict→次Expect→Finishedへ進める。この試験は実cleanup/AfterScan/record再読/FinalIndex/M4の接続や承認を証明しない。既存collector/通常strictはこの新sessionをまだ必須入力にしておらず、生成成功をscan開始許可へ変換しない。

### 16.4 費用・検証範囲

生成は2 work、beginは2 work、Active scopeのrequireは1 workを元SharedBudgetへ課金する。model/identity/state・最大3token比較だけの固定blockで、可変長record/index走査、parse、I/O、数量集計は行わない。Drop/明示stopは追加workなしで理由を保持する。失敗prefixのspentは返金しない。実resource配賦や最終ackの費用は未実装で、このsubsetの2/2/1をsession全体の上界とは呼ばない。

新規10テストで、固定費、合成3round順序、重複生成・生成失敗・未完了drop、各slot/状態違反、同内容の別receipt/target/context、別origin/claim/start/model、copied scope/new token/前token再利用、明示失敗と各課金点の取消/期限を検査した。生成のfresh guardを外す変異では重複試験が失敗し、復元後に全体を再検証した。[session状態合成記録](E2E_BEST_PRACTICE_R2_OL03_SESSION_STATE_SYNTHETIC_2026-10-21.md)を参照。

後続§18でround/session内部累積会計・cleanup/live予約を追加した。次は固定collectorとの接続、完了証拠とstrict acknowledgementが必要である。全体受付・運用cap・OS source・実機操作・permitは引き続き対象外。

## 17. 実閉包規模のsource操作数試算（2026-10-21、レビュー）

§14の操作式（resource-0.2、r=8）へ、親設計の[work規模試算](BEST_PRACTICE_BP5_R2_OL03_COLLECTOR_WORK_REDESIGN.md#71-実閉包規模の机上試算2026-10-20レビュー)と同じ規模のshapeを代入した机上計算である（実装・実測・運用cap承認ではない）。前提：E=5,501、F=4,501（index込み）、D=1,000（T=1,001）、h=5、K=27,501、C=6,000。

| 項目 | 値 |
|---|---:|
| A = (2E+3)(h+1)+2K | 121,032 |
| Open O = A+T+E | 127,534 |
| snapshot M = A+E+2T+2F+1 | 137,538 |
| Enum E+3T | 8,504 |
| Read C+F | 10,501 |
| Metadata 9M（ACL init込み） | **1,237,842**（約75%） |
| Cleanup O+M | 265,072 |
| 1roundのsource操作（base合計） | **1,649,453** |
| 3roundのsource操作（3×base＋r＋1） | **4,948,368** |
| xattr名（§15のQ、1round／3round） | 2,953,813 ／ Q(3M)=8,730,409 byte |
| scan内peak owner | 5（3roundで加算しない） |

- workと同じく、全walkの各edgeで完全snapshot（Metadata9＋ACL cleanup1）を取る方式が支配的である。source操作数でも1roundで約165万、3roundで約495万となり、§5の運用capを承認する際の規模感として残す。
- これらは単発source契約の試行数であり、native syscall数・OS処理時間・FD数の実証ではない。walkの軽量化（祖先edgeの限定確認、root祖先の集約等。scan詳細設計§6.4）を採用すれば、操作数・work・xattr枠の各式を同時に改版する必要がある。
- 数値が算出できることは受付可能性を意味しない。capが未承認のままでは§5どおりUnavailableで開始しない。

## 18. session累積枠・予約/返却の内部実装（draft-0.6）

`session/resources.rs` は `bp5-r2-session-allocation-0.1` の内部会計層である。sessionに1回だけ設定する非CloneのResourcePolicyは、5分類試行・総試行・live・xattr名bytesについてsession capと3slotのround capを別々に持つ。各roundの実消費を固定配列に残し、round切替・boundary再利用で消費をresetしない。ResourcePolicyのfieldはprivateで**本番constructorはない**。合成試験だけがpolicyを作り、resource数量モデルの出力からpolicyへ変換しない。未設定/未知modelはUnavailable、再設定/開始後設定はBindingで停止する。

### 18.1 事前検査と原子的commit

boundary生成時に既存scope.requireを通し、同receipt/round/元budgetへの結合を継承する。各試行直前にも元origin/claim/startedとcheckpointを検査する。固定長のsessionと現在slotの候補値をchecked算術で作り、**両方の全検査とwork prechargeを通った後だけ両方をcommit**する。片側の更新後に不足が分かる形にはしない。

- 通常試行は分類/総消費を各1増加。既存のcleanup予約も総枠とCleanup枠に常に含める。
- acquireはOpenまたはACL init相当のMetadataだけ。加えてcleanup予約/live予約を各1増やす候補を検査する。非所有attemptによるOpenはBinding。
- callback直前に試行を消費し、失敗・Interrupted相当の試行も返金しない。callbackは単発・hidden retryなし・失敗時handleなし・非panicという内部source契約を要求する。
- 成功handleはpost-checkpointより前にRAII Ownerへ移し、live予約を所有へ変換。peakは同時所有のmaxで、round peakの和をsession peakにしない。遅い成功でも取消/期限の後で必ずOwnerがcleanupする。
- handleなしの失敗はAcquisitionのDropで未使用cleanup/live予約だけを戻す。試行・workは戻さない。予約中のliveも次の候補検査に含める。

### 18.2 cleanupと停止後の解放

Ownerはscope境界へborrowで結合し、Dropでrawをtakeして解放試行を一度だけ行う。round/sessionのcleanup予約を実Cleanup試行へ変換し、総実消費も各1増やす。これは予約時に検査済みなのでDropで新しいfallible workや取消/期限検査を行わない。ほかのOwnerも同様に解放し続ける。

解放未確認はround/sessionのunconfirmedへ残し、共有claimへ最初の理由（なければUnavailable）を保存する。liveが0になっても容量回復や実OS解放の証明にはしない。後続試行はcheckpointで拒否し、先行HashMismatch/取消等を上書きしない。boundary終了時もlive/live予約/cleanup予約/unconfirmedの残を拒否する。`mem::forget`でOwnerが失われた場合、残を検出して成功を拒否するが、失われたresourceを回収できたとは主張しない。

### 18.3 xattrと既存予算

copy_namesはcapacity 1〜65536を、round/session双方の残へ**コピー前に**照合する。Metadata試行と、応答したbounded実bytesを一度だけ加算する。遅延応答でも実bytesを保持し、capacity超過応答はmin(capacity)を残してReadFailed。内容のnormalizationを代替するAPIではなく、既存normalizer/固定collectorとの接続は次工程。directory名とは別会計である。

payload used/reserved、retry残、元startedは新しく作らず、配賦によって増加/返金しない。Read試行数だけは台帳に累積する。pending retryの検査・read payload課金は既存scan_ops側の責務であり、今回まだ接続していない。

### 18.4 費目と未接続事項

設定は1 work、boundary入口は既存requireの1 work。試行会計/dispatchは1 work、acquireはcleanup分1を加え計2 work。cleanupはprepaidで追加workなし。固定2台帳/5分類のみを対象とし、policy storageのRc/RefCell allocationや実collector接続後の全体上界が確定したとはしない。既存collector-work-0.1/resource-0.2の処理は変更せず、今回の費用をそれらの既存Sへ隠して含めない。全体受付は無効のまま。

新規13テストと[累積会計合成記録](E2E_BEST_PRACTICE_R2_OL03_SESSION_ALLOCATION_SYNTHETIC_2026-10-21.md)を追加。成功3roundの進行だけは既存のtest専用完了/strict ack fixtureを使用する。本番の完了setter、strict ack、運用cap producer、role外側ownerの枠、collector summaryの移動、cleanup証拠のhost伝播は未接続。会計boundary成功だけでは次round/permitは開かない。

**固定collector接続時の二重計上（2026-10-21、レビュー）**：既存 `scan_ops::Boundary::begin` と本節の `prepare` はいずれも「dispatch1＋acquire時cleanup prepay1」をworkへ課金し、scan_opsのscan単位 `Ledger`（attempts/live/予約）と本節の `Used` は同じsource試行を別々に数える。そのまま重ねると同一操作にwork・試行数が二重に計上され、§11のS1902等の計数とも一致しなくなる。接続時は次のいずれかを明示的に選び、work model・費目所有表・独立oracleを同時に改版する。

- (a) scan_opsのscan単位会計をsessionのround会計へ置換し、課金点を一本化する。
- (b) scan_ops側を課金と試行計数の正とし、session側はworkを課金せず、同じ候補値で累積枠検査とcommitだけを行う。

どちらの場合も、片方だけが成功してもう片方の枠が未commitとなる経路を作らず、cleanup予約・live・unconfirmedは単一の真実源から両方の枠へ反映する。

## 19. 固定collector/scan_ops接続：方式(b)

`consume_and_collect_session` を追加した。既存estimateを値で消費し、同じScanInputsのclaimを先に消費した後、session boundaryから一度だけConnectionを受け取り、固定のcollectorへ渡す。任意kernelの選択やpolicy生成は行わない。Connection発行はround slotごとのone-shot claimで、guard失敗後も戻さない。同RoundScope objectのpointer identityとtokenを照合する（pointerは比較だけに使い、dereference/出力しない）。同名roundの別scopeも拒否する。

接続契約は `bp5-r2-session-collector-entry-0.1`。session側が独立literalと照合する。既存collector-work-0.1/resource-0.2はbase kernelの費目/数量契約として維持するが、session全体の受付証明として単独使用しない。session開始済みbudgetで旧collect/旧boundary（Connectionなし）へ入る場合はBindingでsource操作前に止める。session未開始の従来合成経路は互換性を維持する。

### 19.1 authoritative eventと費目所有

§18末尾の**方式(b)**を選択する。実操作/所有の正は既存scan_opsであり、session側に別のraw ownerを作らない。

| 事象 | 唯一の起点 | session反映とwork |
|---|---|---|
| dispatch/acquire前 | scan_ops::Boundary::begin | local枠検査→既存work precharge→session/round候補検査→両側commit。接続側は追加dispatch/cleanup workを課金しない |
| acquire成功 | 既存own（post-checkpointより前） | local/sessionのlive予約を所有へ変換。sessionはhookだけでrawを所有しない |
| handleなし失敗 | 既存Acquisition::drop | 両側の未使用cleanup/live予約だけを返却。消費/試行は返さない |
| cleanup | 既存Resource::dropのraw.take | 両側の予約を実消費へ変換し、同じcallbackでcleanupを一度だけ実行。追加work/再試行なし |
| xattrコピー | 同じmetadata応答 | local/sessionへ同じbounded実bytesを一度だけ反映。summaryを再加算しない |

local work precharge後にsession枠不足が分かる場合、spent workは残るがどちらの試行/予約もcommitせず、sourceを呼ばない。session側commit後はfallible処理/追加workなしでlocal側もcommitする。source呼出し中は台帳RefCellのborrowを保持しない。固定サイズ候補・Rc clone・予約反映は既存dispatch/prepayの固定blockへ含める。可変長走査/parseや新しいretry loopは加えない。

既存normalizerのxattr buffer確保前とNamesRead直前でsession capacityも検査する。実bytesはコピー後・post-checkpoint前に反映し、遅い/不正応答でも返金しない。内容の許可一覧や前後metadata照合は変更しない。

### 19.2 寿命・失敗・終了証拠

Connectionは同origin/claim/started/slotに結合し、元with_resourcesのactive cellを共有する。boundary終了/unwindでactive=falseになり、保存したcloneも新dispatchに使えない。実Ownerのcleanupはactive/取消/期限にかかわらずprepaidで継続する。Connectionは公開token/permitではなくstrict内部のhookであり、constructできる本番policyはない。

Collected Outcomeは従来のsummaryを保持して移動する。NotStartedには架空summaryを作らない。エラー/late stop時にもcleanup/live/retry/宣言残の終端検査を維持し、unconfirmedをclaimにも残す。summaryのattempts/namesをsessionへ加算する口はない。session入口は実scopeのrequireを通すが、collector成功だけでAwaitStrict/Finishedへ進めない。

### 19.3 workと検証

固定fixtureの実費は、既存単一bridge1991にscope.require1＋Connection1を加え**1993 work**。dispatch/cleanupを二重課金しない。合法EINTR1回は既存宣言read guard1＋dispatch1＋分類1の計3を追加し、最初のroundは1996。3roundのsource試行は `[189,42,19,1971,408]`＝2629でlocal summary/session/独立traceが一致、retry残7を維持する。session生成2、policy設定1、各begin2、record/phase/ackなどはこのbridge実費に含めない。

接続modeの費目所有契約をsession-entry-0.1として明記したが、全inspectionのI/R/O・管理allocation・最大CPU時間を証明したものではない。raw shapeからpolicyへ昇格せず、全体受付は無効のまま。追加8テスト、876×4 source失敗点、160 work prefixなどは[固定collector接続合成記録](E2E_BEST_PRACTICE_R2_OL03_SESSION_COLLECTOR_SYNTHETIC_2026-10-21.md)を参照。

通常strictのproduction acknowledgement/完了setter、運用policy/外側保持owner、host終了証拠、OS sourceは引き続き未接続。3roundの成功進行だけはcfg(test) acknowledgementを用い、M4/FinalIndex全体の本番統合を検証済みとはしない。

## 20. 通常strict向け終了証拠の次工程（設計のみ）

[型付きcleanup・round完了・strict acknowledgement詳細設計draft-0.1](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)で、ClosedScanResourcesとscan成功を分離し、Active→AwaitStrict→次Expect/Finishedへ進むproducerを定義した。cleanup確認済みの失敗を成功扱いせず、NotStarted/境界未生成には証拠を発行しない。

固定adapterはConnectionの退役と両台帳の終了状態を実行identityへ結合し、round完了はscopeと成功証拠を値で消費する。ackはAfterScan→record再読/厳密検証→FinalIndex/Node→最終clock/checkpoint後のstrict tailだけが発行・消費する。BeforeM4 callbackとAfterM4の実位置、ledgerの全inspection寿命、Inputsをdropしてphaseへ移るborrow順序を維持する。

これはMD設計だけで、既存cfg(test) ackを本番へ移す変更ではない。新guard/work・終端証拠のprepay/allocation・具体的Rust lifetimeは未検証で、783テストを新契約の成績に読み替えない。全体受付・運用policy・OS source・permitは停止を維持する。

後続の[終了証拠設計draft-0.3 §13](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)でscan_ops終端のCleanupDisposition/ClosedScanResourcesのみ実装した。未開始/確認済み/不成立を区別し、session mirrorと累積保存則を照合してConnection/slotを退役する。主Failureとcleanup診断は別に保持し、round成功/ackはまだ発行しない。[合成検証記録](E2E_BEST_PRACTICE_R2_OL03_CLEANUP_EVIDENCE_SYNTHETIC_2026-10-21.md)を参照。

終端診断のprepay1追加に伴いwork/entry/session-entryを0.2へ改版し、kernel1903、単一bridge1992、session bridge1994（EINTR1の最初のround1997）となった。§19の1902/1991/1993/1996はその時点の履歴値。操作数/bytesとresource数量モデル0.2の式は変えず、kernel bindingだけ更新する。通常strict・運用policy・全体受付・permitは引き続き開けない。

続く[終了証拠設計draft-0.4 §14](BEST_PRACTICE_BP5_R2_OL03_STRICT_COMPLETION_DESIGN.md)で、実Closedと同固定collectorのObservation成功を消費してActive→AwaitStrictへ移す内部型を追加した。sessionのslot別完了claimはfallible処理前に消費し、receipt/round/budget/book結合・未ack drop/forget後の停止を検証する。固定O.round_completeは追加3 workで、既存session1994は変更せず完了経路1997（EINTR1は2000）。strict ack/通常strict/全体受付は追加していない。[合成記録](E2E_BEST_PRACTICE_R2_OL03_ROUND_COMPLETION_SYNTHETIC_2026-10-21.md)を参照。

続く同設計draft-0.5 §15ではAwaitStrictのままPending→AfterScanRoundへ値で移す。slot別after_scan_startedを先に消費し、同phase/scopeで実AfterScanを成功させてからObservationをdropする。cleanup/数値診断とleaseだけを新stageへ移す。未ack drop/forgetで次roundを開けず、既存会計へoperation/bytesを再加算しない。追加O.after_scan_stageは3 work/round。[合成記録](E2E_BEST_PRACTICE_R2_OL03_AFTER_SCAN_STAGE_SYNTHETIC_2026-10-21.md)を参照。production strict ack・全体受付・通常strict/OS接続は無効のまま。

続く同設計draft-0.6 §16でslot別records_startedを先に消費し、AfterScanRound→record再読/clock/厳密JSON・binding検査→RecordsVerifiedRoundを追加した。元budget/同Compared phase/scopeへ結合し、sourceのprojectionや数値から成功を復元しない。既存record側の共有byte/操作/意味検査費を維持し、O.record_stage=3 work/roundを追加する。[合成記録](E2E_BEST_PRACTICE_R2_OL03_RECORD_STAGE_SYNTHETIC_2026-10-21.md)を参照。FinalIndex以降のtyped tail・production strict ack・通常strict/全体受付・OS接続は未対応。

続く同設計draft-0.7 §17でslot別final_index_startedを先に消費し、RecordsVerifiedRound→実FinalIndex/Node再照合→FinalIndexRoundへ移す。AwaitStrict/元budget/Closed/同Compared phaseを再照合し、終端失敗や未ack drop/forgetでも次roundを開けない。O.final_index_stage=3 work/roundを既存phase費と分離する。[合成記録](E2E_BEST_PRACTICE_R2_OL03_FINAL_INDEX_STAGE_SYNTHETIC_2026-10-21.md)を参照。最終clock/typed strict ack・通常strict/全体受付・OS接続は未対応。

続く同設計draft-0.8 §18でslot別final_clock_startedを先に消費し、FinalIndexRound→実最終clock/checkpoint→FinalClockRoundへ移す。元receipt/scope/Finished phase/budget/Closedへ結合し、clock試行は旧経路と同じ1、追加controlはO.final_clock_stage=3 work/round。未ack drop/forgetで次roundを開けない。[合成記録](E2E_BEST_PRACTICE_R2_OL03_FINAL_CLOCK_STAGE_SYNTHETIC_2026-10-21.md)を参照。typed strict ack・通常strict/全体受付・OS接続は未対応。

続く同設計draft-0.9 §19でslot別ack_startedを先に消費し、FinalClockRound→private typed ack即時消費→Expect(next)/Finishedへ移す。元budget・Closed・同Finished phaseを再照合し、失敗時は停止と元診断を保持する。追加O.strict_ack=3 work/round、操作/bytes/retry/resource数量は不変。Initial/AfterM4後のwith_round末尾失敗も全体失敗とする。[合成記録](E2E_BEST_PRACTICE_R2_OL03_STRICT_ACK_SYNTHETIC_2026-10-21.md)を参照。通常strict固定位置/M4接続、OS source、全体受付、permitは追加していない。
